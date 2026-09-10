/*
 * Visitor identity + persistence — server-side.
 * The visitor identity cookie (`mp_vid`) is a stable random token we use to
 * recognize a returning visitor without authentication. Card data lives in D1.
 */

import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { isGeneratedVisitorName } from "./visitor-name";

export const VISITOR_ID_COOKIE = "mp_vid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export type CardColor = "pink" | "teal" | "green" | "orange" | "neutral";
export const CARD_COLORS: readonly CardColor[] = [
  "pink",
  "teal",
  "green",
  "orange",
  "neutral",
] as const;

export type VisitorRecord = {
  id: string;
  number: number;
  name: string;
  color: CardColor;
  issuedAt: string;
  /** PNG data URL of the drawn signature, or null if the visitor didn't draw. */
  signature: string | null;
};

type VisitorRow = {
  id: string;
  number: number;
  name: string;
  color: CardColor;
  issued_at: string;
  signature: string | null;
};

function rowToRecord(row: VisitorRow): VisitorRecord {
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    color: row.color,
    issuedAt: row.issued_at,
    signature: row.signature ?? null,
  };
}

/**
 * Whether a stored signature counts as a real drawing for the gallery. Mirrors
 * the historical `LENGTH(signature_png) > 800` SQL filter — empty/near-empty
 * canvases fall below the threshold and are excluded.
 */
export function hasRealSignature(signature: string | null | undefined): boolean {
  return typeof signature === "string" && signature.length > 800;
}

export function readVisitorId(ctx: APIContext): string | null {
  return ctx.cookies.get(VISITOR_ID_COOKIE)?.value ?? null;
}

export function writeVisitorId(ctx: APIContext, id: string) {
  ctx.cookies.set(VISITOR_ID_COOKIE, id, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: import.meta.env.PROD,
  });
}

export function clearVisitorId(ctx: APIContext) {
  ctx.cookies.delete(VISITOR_ID_COOKIE, { path: "/" });
}

export function db(_ctx: APIContext): D1Database {
  if (!env?.DB) {
    throw new Error("D1 binding `DB` is not available on this request");
  }
  return env.DB;
}

/* ------------------------------------------------------------------ */
/*  Gallery stats counters                                            */
/* ------------------------------------------------------------------ */
/*
 * The gallery stats (total, per-colour, per-day) are maintained incrementally
 * in the `counters` table so reading them costs a handful of rows instead of
 * an aggregate scan over every approved card (see migrations/0008). Every
 * write path that can change a card's gallery visibility — insert, edit,
 * approve, reject/delete, report auto-hide — computes the before/after
 * visibility and applies the delta in the same D1 batch as the write.
 */

/** Columns needed to decide whether a row counts toward gallery stats. */
type GalleryVisibilityRow = {
  approved: number;
  has_signature: number;
  color: CardColor;
  issued_at: string;
};

/** Which stats buckets a row contributes to, or null if it isn't in the gallery. */
function galleryBucket(
  row: GalleryVisibilityRow | null | undefined
): { color: CardColor; day: string } | null {
  if (!row || row.approved !== 1 || row.has_signature !== 1) return null;
  return { color: row.color, day: row.issued_at.slice(0, 10) };
}

type StatsDelta = Map<string, number>;

function addBucket(delta: StatsDelta, row: GalleryVisibilityRow | null | undefined, sign: 1 | -1) {
  const b = galleryBucket(row);
  if (!b) return;
  for (const key of ["stats_total", `stats_color_${b.color}`, `stats_day_${b.day}`]) {
    delta.set(key, (delta.get(key) ?? 0) + sign);
  }
}

/** Delta for a row transitioning from `before` to `after` (either may be null). */
function galleryStatsDelta(
  before: GalleryVisibilityRow | null | undefined,
  after: GalleryVisibilityRow | null | undefined
): StatsDelta {
  const delta: StatsDelta = new Map();
  addBucket(delta, before, -1);
  addBucket(delta, after, 1);
  for (const [k, v] of delta) if (v === 0) delta.delete(k);
  return delta;
}

/** One upsert per touched counter key; clamps at zero so drift never goes negative.
 *  The delta is bound twice on purpose: `excluded.value` would see the already
 *  clamped insert value (0 for a decrement), so the update path binds it again. */
function statsDeltaStatements(d: D1Database, delta: StatsDelta): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const [key, value] of delta) {
    stmts.push(
      d
        .prepare(
          `INSERT INTO counters (key, value) VALUES (?, MAX(?, 0))
           ON CONFLICT(key) DO UPDATE SET value = MAX(counters.value + ?, 0)`
        )
        .bind(key, value, value)
    );
  }
  return stmts;
}

/** Apply a stats delta (if non-empty) and drop the cached stats snapshot. */
async function applyStatsDelta(ctx: APIContext, delta: StatsDelta): Promise<void> {
  if (delta.size === 0) return;
  const d = db(ctx);
  await d.batch(statsDeltaStatements(d, delta));
  await invalidateGalleryStatsCache(ctx);
}

/* ------------------------------------------------------------------ */
/*  Edge cache for read-mostly responses                              */
/* ------------------------------------------------------------------ */

/** How long a cached gallery stats / visitor list snapshot may be served. */
export const GALLERY_CACHE_TTL_SECONDS = 60;

function edgeCache(): Cache | null {
  try {
    // `caches` is absent in some local/dev runtimes and on workers.dev
    // subdomains; every caller must work without it. The Workers runtime adds
    // `caches.default`, which the DOM lib typing of CacheStorage lacks (the
    // project deliberately doesn't pull in @cloudflare/workers-types).
    if (typeof caches === "undefined") return null;
    return (caches as unknown as { default?: Cache }).default ?? null;
  } catch {
    return null;
  }
}

/** Synthetic same-origin cache key for a server-side computed value. */
function cacheKey(ctx: APIContext, name: string): Request {
  const origin = new URL(ctx.request.url).origin;
  return new Request(`${origin}/__cache/${name}`, { method: "GET" });
}

/**
 * Compute-through cache: return the cached JSON value for `name` if the edge
 * has a fresh copy, otherwise compute it, store it for `ttl` seconds and
 * return it. A burst of requests then costs one D1 read per colo per TTL
 * instead of one per request. Cache failures fall through to compute.
 */
export async function cachedJson<T>(
  ctx: APIContext,
  name: string,
  compute: () => Promise<T>,
  ttl = GALLERY_CACHE_TTL_SECONDS
): Promise<T> {
  const cache = edgeCache();
  const key = cache ? cacheKey(ctx, name) : null;
  if (cache && key) {
    try {
      const hit = await cache.match(key);
      if (hit) return (await hit.json()) as T;
    } catch {
      /* fall through to compute */
    }
  }
  const value = await compute();
  if (cache && key) {
    try {
      await cache.put(
        key,
        new Response(JSON.stringify(value), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": `public, max-age=${ttl}`,
          },
        })
      );
    } catch {
      /* best effort */
    }
  }
  return value;
}

/** Edge TTL for approved signature blobs served by /api/signature/:id. Browsers
 *  cache them for a day; the edge copy is shorter so a moderated/edited card
 *  stops being served within the hour even if the best-effort delete misses. */
export const SIGNATURE_CACHE_TTL_SECONDS = 60 * 60;

function signatureCacheKey(ctx: APIContext, id: string): Request {
  return cacheKey(ctx, `signature/${encodeURIComponent(id)}`);
}

/** Cached copy of an approved visitor's signature, or null on miss/no cache. */
export async function matchCachedSignature(ctx: APIContext, id: string): Promise<string | null> {
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const hit = await cache.match(signatureCacheKey(ctx, id));
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}

/** Store an approved visitor's signature at the edge (best effort). */
export async function putCachedSignature(ctx: APIContext, id: string, dataUrl: string): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(
      signatureCacheKey(ctx, id),
      new Response(dataUrl, {
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": `public, max-age=${SIGNATURE_CACHE_TTL_SECONDS}`,
        },
      })
    );
  } catch {
    /* best effort */
  }
}

/** Best-effort: drop a card's cached signature after it changes or is hidden. */
async function invalidateSignatureCache(ctx: APIContext, id: string): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.delete(signatureCacheKey(ctx, id));
  } catch {
    /* ignore */
  }
}

/** Best-effort: drops this colo's cached stats so the writer sees fresh numbers. */
async function invalidateGalleryStatsCache(ctx: APIContext): Promise<void> {
  const cache = edgeCache();
  if (!cache) return;
  try {
    await Promise.all([
      cache.delete(cacheKey(ctx, "gallery-stats")),
      cache.delete(cacheKey(ctx, "visitors-20")),
    ]);
  } catch {
    /* ignore */
  }
}

export async function getVisitorById(
  ctx: APIContext,
  id: string
): Promise<VisitorRecord | null> {
  const row = await db(ctx)
    .prepare(
      `SELECT id, number, name, color, issued_at, signature_png AS signature
       FROM visitors WHERE id = ? LIMIT 1`
    )
    .bind(id)
    .first<VisitorRow>();

  if (!row) return null;
  return rowToRecord(row);
}

export async function getCurrentVisitor(
  ctx: APIContext
): Promise<VisitorRecord | null> {
  const id = readVisitorId(ctx);
  if (!id) return null;
  return getVisitorById(ctx, id);
}

export async function createVisitor(
  ctx: APIContext,
  input: { name: string; color: CardColor; signature?: string | null }
): Promise<VisitorRecord> {
  const id = crypto.randomUUID();
  const issuedAt = new Date().toISOString();
  const signature = input.signature ?? null;
  // Auto-approve cards that kept the generator's default name and skipped
  // drawing — no user-supplied content to moderate.
  const autoApprove = signature === null && isGeneratedVisitorName(input.name);
  // Indexed gallery flag — mirrors the old `LENGTH(signature_png) > 800` filter.
  const hasSig = hasRealSignature(signature) ? 1 : 0;

  const approved = autoApprove ? 1 : 0;
  const after: GalleryVisibilityRow = {
    approved,
    has_signature: hasSig,
    color: input.color,
    issued_at: issuedAt,
  };

  // INSERT ... SELECT to atomically allocate the next number. The stats delta
  // (if the new card is gallery-visible) rides in the same batch/transaction.
  const d = db(ctx);
  const [inserted] = await d.batch([
    d
      .prepare(
        `INSERT INTO visitors (id, number, name, color, issued_at, signature_png, approved, has_signature)
         SELECT ?, COALESCE((SELECT MAX(number) FROM visitors), 0) + 1, ?, ?, ?, ?, ?, ?
         RETURNING number`
      )
      .bind(id, input.name, input.color, issuedAt, signature, approved, hasSig),
    ...statsDeltaStatements(d, galleryStatsDelta(null, after)),
  ]);
  const result = (inserted as D1Result<{ number: number }>).results[0];

  if (!result) throw new Error("Failed to insert visitor");
  if (galleryBucket(after)) await invalidateGalleryStatsCache(ctx);

  return {
    id,
    number: result.number,
    name: input.name,
    color: input.color,
    issuedAt,
    signature,
  };
}

/**
 * Update the name + color on an existing visitor. Number stays stable.
 * If `signature` is provided (including explicit null) it overwrites the
 * stored signature; if omitted, the existing signature is preserved.
 */
export async function updateVisitor(
  ctx: APIContext,
  id: string,
  input: { name: string; color: CardColor; signature?: string | null }
): Promise<VisitorRecord | null> {
  const hasSignature = Object.prototype.hasOwnProperty.call(input, "signature");
  const nameIsDefault = isGeneratedVisitorName(input.name);

  // Reset approval on edit — name/signature may have changed. Auto-approve
  // when the edited card kept the default name and has no signature (either
  // explicitly cleared this edit, or preserved-empty from before).
  const d = db(ctx);
  const stmt = hasSignature
    ? (() => {
        const autoApprove = nameIsDefault && (input.signature ?? null) === null;
        const hasSig = hasRealSignature(input.signature ?? null) ? 1 : 0;
        return d
          .prepare(
            `UPDATE visitors SET name = ?, color = ?, signature_png = ?, approved = ?, has_signature = ? WHERE id = ?
             RETURNING id, number, name, color, issued_at, signature_png AS signature, approved, has_signature`
          )
          .bind(input.name, input.color, input.signature ?? null, autoApprove ? 1 : 0, hasSig, id);
      })()
    : d
        .prepare(
          // Auto-approve only when name is default AND no existing signature.
          `UPDATE visitors SET name = ?, color = ?,
                  approved = CASE WHEN ? = 1 AND signature_png IS NULL THEN 1 ELSE 0 END
           WHERE id = ?
           RETURNING id, number, name, color, issued_at, signature_png AS signature, approved, has_signature`
        )
        .bind(input.name, input.color, nameIsDefault ? 1 : 0, id);

  // Snapshot visibility before the update (same transaction) so the stats
  // counters can be adjusted for a card leaving/changing gallery buckets.
  const [beforeRes, afterRes] = await d.batch([
    d
      .prepare(`SELECT approved, has_signature, color, issued_at FROM visitors WHERE id = ?`)
      .bind(id),
    stmt,
  ]);
  const before = (beforeRes as D1Result<GalleryVisibilityRow>).results[0] ?? null;
  const row = (afterRes as D1Result<VisitorRow & GalleryVisibilityRow>).results[0];

  if (!row) return null;
  await Promise.all([
    applyStatsDelta(ctx, galleryStatsDelta(before, row)),
    invalidateSignatureCache(ctx, id),
  ]);
  return rowToRecord(row);
}

/** Hard cap on how many full-signature rows a single call may pull. Each row
 *  carries a ~20–40 KB base64 PNG, so this is the expensive list query — the
 *  only consumer (the onboarding wallet animation) needs 20. */
export const LIST_VISITORS_MAX = 50;

/** Latest gallery cards *with* their signature blobs. Prefer listVisitorsLite
 *  anywhere the ink isn't actually rendered. */
export async function listVisitors(
  ctx: APIContext,
  limit = 20
): Promise<VisitorRecord[]> {
  const rows = await db(ctx)
    .prepare(
      `SELECT id, number, name, color, issued_at, signature_png AS signature
       FROM visitors WHERE approved = 1 AND has_signature = 1 ORDER BY number DESC LIMIT ?`
    )
    .bind(Math.min(Math.max(1, limit), LIST_VISITORS_MAX))
    .all<VisitorRow>();

  return rows.results.map(rowToRecord);
}

/** Like listVisitors but omits the (potentially large) signature_png column.
 *  Used by the gallery list view where signatures aren't visible at mini scale. */
export async function listVisitorsLite(
  ctx: APIContext,
  limit = 100,
  offset = 0
): Promise<VisitorRecord[]> {
  const rows = await db(ctx)
    .prepare(
      `SELECT id, number, name, color, issued_at, NULL AS signature
       FROM visitors WHERE approved = 1 AND has_signature = 1 ORDER BY number DESC LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<VisitorRow>();

  return rows.results.map(rowToRecord);
}

/** Total number of gallery-visible (approved + signed) visitors, from the
 *  incrementally maintained counter — one row read, no scan. */
export async function countVisitors(ctx: APIContext): Promise<number> {
  const row = await db(ctx)
    .prepare(`SELECT value FROM counters WHERE key = 'stats_total'`)
    .first<{ value: number }>();
  return row?.value ?? 0;
}

/** Fetch just the signature data URL for a single approved visitor. */
export async function getVisitorSignature(
  ctx: APIContext,
  id: string
): Promise<string | null> {
  const row = await db(ctx)
    .prepare(`SELECT signature_png FROM visitors WHERE id = ? AND approved = 1 LIMIT 1`)
    .bind(id)
    .first<{ signature_png: string | null }>();
  return row?.signature_png ?? null;
}

/** Fetch signature for the visitor's own card (no approval check). */
export async function getVisitorSignatureOwn(
  ctx: APIContext,
  id: string
): Promise<string | null> {
  const row = await db(ctx)
    .prepare(`SELECT signature_png FROM visitors WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ signature_png: string | null }>();
  return row?.signature_png ?? null;
}

export function isCardColor(value: unknown): value is CardColor {
  return typeof value === "string" && (CARD_COLORS as readonly string[]).includes(value);
}

/** The number the next visitor to sign in will receive. */
export async function peekNextVisitorNumber(ctx: APIContext): Promise<number> {
  const row = await db(ctx)
    .prepare(`SELECT COALESCE(MAX(number), 0) + 1 AS next FROM visitors`)
    .first<{ next: number }>();
  return row?.next ?? 1;
}

/* ------------------------------------------------------------------ */
/*  Gallery stats                                                     */
/* ------------------------------------------------------------------ */

export type HatKey = "bucket" | "top" | "cap" | "sprout" | "party";

export type GalleryStats = {
  colorCounts: Record<CardColor, number>;
  withSignature: number;
  firstIssuedAt: string | null;
  latestIssuedAt: string | null;
  /**
   * Signups bucketed per UTC calendar day (`YYYY-MM-DD`), ascending. Aggregated
   * server-side so we ship ~one row per active day instead of every raw
   * timestamp — near-midnight signups may land ±1 day off for non-UTC viewers,
   * which is invisible on the decorative sparkline.
   */
  signupsByDay: { day: string; count: number }[];
  /** Highest visitor number among gallery-visible (approved + signed) cards. */
  maxNumber: number;
  hatCounts: Record<HatKey, number>;
};

/**
 * Gallery stats, served from the edge cache for GALLERY_CACHE_TTL_SECONDS and
 * otherwise assembled from the `counters` table plus two single-row index
 * seeks — no aggregate scan of `visitors`.
 */
export async function getGalleryStats(ctx: APIContext): Promise<GalleryStats> {
  return cachedJson(ctx, "gallery-stats", () => readGalleryStats(ctx));
}

/** Uncached stats read. ~(active days + colours + hats) rows from `counters`
 *  plus one index seek at each end of the gallery ordering. */
export async function readGalleryStats(ctx: APIContext): Promise<GalleryStats> {
  const d = db(ctx);
  const [counterRows, newestRow, oldestRow] = await d.batch([
    d.prepare(`SELECT key, value FROM counters`),
    // Numbers are assigned in issue order, so the newest/oldest gallery card by
    // number is also the latest/first issued — a LIMIT 1 seek on
    // idx_visitors_gallery (approved, has_signature, number DESC) each way.
    d.prepare(
      `SELECT number, issued_at FROM visitors
       WHERE approved = 1 AND has_signature = 1 ORDER BY number DESC LIMIT 1`,
    ),
    d.prepare(
      `SELECT number, issued_at FROM visitors
       WHERE approved = 1 AND has_signature = 1 ORDER BY number ASC LIMIT 1`,
    ),
  ]);

  const colorCounts: Record<CardColor, number> = {
    pink: 0, teal: 0, green: 0, orange: 0, neutral: 0,
  };
  const hatCounts: Record<HatKey, number> = { bucket: 0, top: 0, cap: 0, sprout: 0, party: 0 };
  const signupsByDay: { day: string; count: number }[] = [];
  let withSignature = 0;

  for (const row of (counterRows as D1Result<{ key: string; value: number }>).results) {
    const { key, value } = row;
    if (key === "stats_total") {
      withSignature = value;
    } else if (key.startsWith("stats_color_")) {
      const color = key.slice("stats_color_".length);
      if (color in colorCounts) colorCounts[color as CardColor] = value;
    } else if (key.startsWith("stats_day_")) {
      if (value > 0) signupsByDay.push({ day: key.slice("stats_day_".length), count: value });
    } else if (key.startsWith("hat_")) {
      const hat = key.slice("hat_".length);
      if (hat in hatCounts && value > 0) hatCounts[hat as HatKey] = value;
    }
  }
  signupsByDay.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  type Edge = { number: number; issued_at: string };
  const newest = (newestRow as D1Result<Edge>).results[0];
  const oldest = (oldestRow as D1Result<Edge>).results[0];

  return {
    colorCounts,
    withSignature,
    firstIssuedAt: oldest?.issued_at ?? null,
    latestIssuedAt: newest?.issued_at ?? null,
    signupsByDay,
    maxNumber: newest?.number ?? 0,
    hatCounts,
  };
}

/**
 * Rebuild the stats counters from a full scan of `visitors` (same statements
 * as migrations/0008). Admin-only escape hatch for counter drift; costs one
 * scan of the approved rows, which is what every page view used to cost.
 */
export async function resyncGalleryStats(ctx: APIContext): Promise<GalleryStats> {
  const d = db(ctx);
  await d.batch([
    d.prepare(`DELETE FROM counters WHERE key LIKE 'stats_%'`),
    d.prepare(
      `INSERT INTO counters (key, value) VALUES
         ('stats_total', 0), ('stats_color_pink', 0), ('stats_color_teal', 0),
         ('stats_color_green', 0), ('stats_color_orange', 0), ('stats_color_neutral', 0)`,
    ),
    d.prepare(
      `INSERT OR REPLACE INTO counters (key, value)
       SELECT 'stats_total', COUNT(*) FROM visitors WHERE approved = 1 AND has_signature = 1`,
    ),
    d.prepare(
      `INSERT OR REPLACE INTO counters (key, value)
       SELECT 'stats_color_' || color, COUNT(*) FROM visitors
       WHERE approved = 1 AND has_signature = 1 GROUP BY color`,
    ),
    d.prepare(
      `INSERT OR REPLACE INTO counters (key, value)
       SELECT 'stats_day_' || substr(issued_at, 1, 10), COUNT(*) FROM visitors
       WHERE approved = 1 AND has_signature = 1 GROUP BY substr(issued_at, 1, 10)`,
    ),
  ]);
  await invalidateGalleryStatsCache(ctx);
  return readGalleryStats(ctx);
}

/* ------------------------------------------------------------------ */
/*  Moderation                                                        */
/* ------------------------------------------------------------------ */

export type PendingVisitor = VisitorRecord & { reportCount: number };

/** List visitors awaiting approval, most recent first. */
export async function listPendingVisitors(
  ctx: APIContext,
  limit = 1000
): Promise<PendingVisitor[]> {
  const rows = await db(ctx)
    .prepare(
      `SELECT v.id, v.number, v.name, v.color, v.issued_at,
              v.signature_png AS signature,
              COALESCE(r.cnt, 0) AS report_count
       FROM visitors v
       LEFT JOIN (SELECT card_id, COUNT(*) AS cnt FROM reports GROUP BY card_id) r
         ON r.card_id = v.id
       WHERE v.approved = 0
       ORDER BY v.issued_at DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<VisitorRow & { report_count: number }>();

  return rows.results.map((row) => ({
    ...rowToRecord(row),
    reportCount: row.report_count,
  }));
}

/** Approve a visitor card — makes it visible in the gallery. */
export async function approveVisitor(ctx: APIContext, id: string): Promise<boolean> {
  const d = db(ctx);
  const [beforeRes, afterRes] = await d.batch([
    d
      .prepare(`SELECT approved, has_signature, color, issued_at FROM visitors WHERE id = ?`)
      .bind(id),
    d
      .prepare(
        `UPDATE visitors SET approved = 1 WHERE id = ?
         RETURNING approved, has_signature, color, issued_at`
      )
      .bind(id),
  ]);
  const before = (beforeRes as D1Result<GalleryVisibilityRow>).results[0] ?? null;
  const after = (afterRes as D1Result<GalleryVisibilityRow>).results[0] ?? null;
  if (!after) return false;
  await applyStatsDelta(ctx, galleryStatsDelta(before, after));
  return true;
}

/** Approve all pending visitor cards at once. Returns count approved. */
export async function approveAllVisitors(ctx: APIContext): Promise<number> {
  const d = db(ctx);
  // Pending cards that will become gallery-visible — small set, indexed.
  const [pendingRes, updateRes] = await d.batch([
    d.prepare(
      `SELECT approved, has_signature, color, issued_at FROM visitors
       WHERE approved = 0 AND has_signature = 1`
    ),
    d.prepare(`UPDATE visitors SET approved = 1 WHERE approved = 0`),
  ]);
  const delta: StatsDelta = new Map();
  for (const row of (pendingRes as D1Result<GalleryVisibilityRow>).results) {
    addBucket(delta, { ...row, approved: 1 }, 1);
  }
  await applyStatsDelta(ctx, delta);
  return Number(updateRes.meta.changes ?? 0);
}

/** Reject (delete) a visitor card permanently. */
export async function rejectVisitor(ctx: APIContext, id: string): Promise<boolean> {
  const d = db(ctx);
  const [, deleted] = await d.batch([
    d.prepare(`DELETE FROM reports WHERE card_id = ?`).bind(id),
    d
      .prepare(
        `DELETE FROM visitors WHERE id = ?
         RETURNING approved, has_signature, color, issued_at`
      )
      .bind(id),
  ]);
  const before = (deleted as D1Result<GalleryVisibilityRow>).results[0] ?? null;
  if (!before) return false;
  await Promise.all([
    applyStatsDelta(ctx, galleryStatsDelta(before, null)),
    invalidateSignatureCache(ctx, id),
  ]);
  return true;
}

/** Self-delete: remove a visitor's own card, their reports, and reports on them. */
export async function deleteOwnVisitor(ctx: APIContext, id: string): Promise<boolean> {
  const d = db(ctx);
  const results = await d.batch([
    d.prepare(`DELETE FROM reports WHERE card_id = ?`).bind(id),
    d.prepare(`DELETE FROM reports WHERE reporter_id = ?`).bind(id),
    d
      .prepare(
        `DELETE FROM visitors WHERE id = ?
         RETURNING approved, has_signature, color, issued_at`
      )
      .bind(id),
  ]);
  const before = (results[2] as D1Result<GalleryVisibilityRow>).results[0] ?? null;
  if (!before) return false;
  await Promise.all([
    applyStatsDelta(ctx, galleryStatsDelta(before, null)),
    invalidateSignatureCache(ctx, id),
  ]);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Reports                                                           */
/* ------------------------------------------------------------------ */

const AUTO_HIDE_THRESHOLD = 3;

/**
 * Report a card. Returns true if the report was recorded, false if
 * the reporter already reported this card.
 * Auto-hides the card if it hits the report threshold.
 */
export async function reportCard(
  ctx: APIContext,
  cardId: string,
  reporterId: string
): Promise<{ recorded: boolean; autoHidden: boolean }> {
  try {
    await db(ctx)
      .prepare(`INSERT INTO reports (card_id, reporter_id) VALUES (?, ?)`)
      .bind(cardId, reporterId)
      .run();
  } catch (err) {
    if (String(err).includes("UNIQUE constraint")) {
      return { recorded: false, autoHidden: false };
    }
    throw err;
  }

  // Atomic: hide only if report count just reached threshold.
  const hidden = await db(ctx)
    .prepare(
      `UPDATE visitors SET approved = 0
       WHERE id = ? AND approved = 1
         AND (SELECT COUNT(*) FROM reports WHERE card_id = ?) >= ?
       RETURNING approved, has_signature, color, issued_at`
    )
    .bind(cardId, cardId, AUTO_HIDE_THRESHOLD)
    .first<GalleryVisibilityRow>();

  if (hidden) {
    // The row was approved before this statement flipped it.
    await Promise.all([
      applyStatsDelta(ctx, galleryStatsDelta({ ...hidden, approved: 1 }, hidden)),
      invalidateSignatureCache(ctx, cardId),
    ]);
  }

  return { recorded: true, autoHidden: !!hidden };
}
