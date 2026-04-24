/*
 * Visitor identity + persistence — server-side.
 * The visitor identity cookie (`mp_vid`) is a stable random token we use to
 * recognize a returning visitor without authentication. Card data lives in D1.
 */

import type { APIContext } from "astro";

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

export function db(ctx: APIContext): D1Database {
  const env = ctx.locals.runtime?.env;
  if (!env?.DB) {
    throw new Error("D1 binding `DB` is not available on this request");
  }
  return env.DB;
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

  // INSERT ... SELECT to atomically allocate the next number.
  const result = await db(ctx)
    .prepare(
      `INSERT INTO visitors (id, number, name, color, issued_at, signature_png)
       SELECT ?, COALESCE((SELECT MAX(number) FROM visitors), 0) + 1, ?, ?, ?, ?
       RETURNING number`
    )
    .bind(id, input.name, input.color, issuedAt, signature)
    .first<{ number: number }>();

  if (!result) throw new Error("Failed to insert visitor");

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

  // Reset approval on edit — name/signature may have changed.
  const stmt = hasSignature
    ? db(ctx)
        .prepare(
          `UPDATE visitors SET name = ?, color = ?, signature_png = ?, approved = 0 WHERE id = ?
           RETURNING id, number, name, color, issued_at, signature_png AS signature`
        )
        .bind(input.name, input.color, input.signature ?? null, id)
    : db(ctx)
        .prepare(
          `UPDATE visitors SET name = ?, color = ?, approved = 0 WHERE id = ?
           RETURNING id, number, name, color, issued_at, signature_png AS signature`
        )
        .bind(input.name, input.color, id);

  const row = await stmt.first<VisitorRow>();

  if (!row) return null;
  return rowToRecord(row);
}

export async function listVisitors(
  ctx: APIContext,
  limit = 100
): Promise<VisitorRecord[]> {
  const rows = await db(ctx)
    .prepare(
      `SELECT id, number, name, color, issued_at, signature_png AS signature
       FROM visitors WHERE approved = 1 ORDER BY number DESC LIMIT ?`
    )
    .bind(limit)
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
       FROM visitors WHERE approved = 1 ORDER BY number DESC LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<VisitorRow>();

  return rows.results.map(rowToRecord);
}

/** Total number of approved visitors in the DB. */
export async function countVisitors(ctx: APIContext): Promise<number> {
  const row = await db(ctx)
    .prepare(`SELECT COUNT(*) AS cnt FROM visitors WHERE approved = 1`)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
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

export type GalleryStats = {
  colorCounts: Record<CardColor, number>;
  withSignature: number;
  firstIssuedAt: string | null;
  latestIssuedAt: string | null;
  /** Raw issued_at timestamps — grouped by local day on the client. */
  signupTimestamps: string[];
};

export async function getGalleryStats(ctx: APIContext): Promise<GalleryStats> {
  const d = db(ctx);
  const [colorRows, sigRow, timeRow, dailyRows] = await d.batch([
    d.prepare(
      `SELECT color, COUNT(*) AS cnt FROM visitors WHERE approved = 1 GROUP BY color`,
    ),
    d.prepare(
      `SELECT COUNT(*) AS cnt FROM visitors WHERE approved = 1 AND signature_png IS NOT NULL`,
    ),
    d.prepare(
      `SELECT MIN(issued_at) AS first_at, MAX(issued_at) AS latest_at FROM visitors WHERE approved = 1`,
    ),
    d.prepare(
      `SELECT issued_at FROM visitors WHERE approved = 1 ORDER BY issued_at`,
    ),
  ]);

  const colorCounts: Record<CardColor, number> = {
    pink: 0, teal: 0, green: 0, orange: 0, neutral: 0,
  };
  for (const row of (colorRows as D1Result<{ color: CardColor; cnt: number }>).results) {
    if (row.color in colorCounts) colorCounts[row.color] = row.cnt;
  }

  const withSignature = (sigRow as D1Result<{ cnt: number }>).results[0]?.cnt ?? 0;
  const timeResult = (timeRow as D1Result<{ first_at: string | null; latest_at: string | null }>).results[0];

  const signupTimestamps = (dailyRows as D1Result<{ issued_at: string }>).results.map(
    (r) => r.issued_at,
  );

  return {
    colorCounts,
    withSignature,
    firstIssuedAt: timeResult?.first_at ?? null,
    latestIssuedAt: timeResult?.latest_at ?? null,
    signupTimestamps,
  };
}

/* ------------------------------------------------------------------ */
/*  Moderation                                                        */
/* ------------------------------------------------------------------ */

export type PendingVisitor = VisitorRecord & { reportCount: number };

/** List visitors awaiting approval, most recent first. */
export async function listPendingVisitors(
  ctx: APIContext,
  limit = 100
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
  const row = await db(ctx)
    .prepare(`UPDATE visitors SET approved = 1 WHERE id = ? RETURNING id`)
    .bind(id)
    .first();
  return !!row;
}

/** Reject (delete) a visitor card permanently. */
export async function rejectVisitor(ctx: APIContext, id: string): Promise<boolean> {
  await db(ctx).prepare(`DELETE FROM reports WHERE card_id = ?`).bind(id).run();
  const row = await db(ctx)
    .prepare(`DELETE FROM visitors WHERE id = ? RETURNING id`)
    .bind(id)
    .first();
  return !!row;
}

/** Self-delete: remove a visitor's own card, their reports, and reports on them. */
export async function deleteOwnVisitor(ctx: APIContext, id: string): Promise<boolean> {
  const results = await db(ctx).batch([
    db(ctx).prepare(`DELETE FROM reports WHERE card_id = ?`).bind(id),
    db(ctx).prepare(`DELETE FROM reports WHERE reporter_id = ?`).bind(id),
    db(ctx).prepare(`DELETE FROM visitors WHERE id = ? RETURNING id`).bind(id),
  ]);
  return !!(results[2]?.results?.length);
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
       RETURNING id`
    )
    .bind(cardId, cardId, AUTO_HIDE_THRESHOLD)
    .first();

  return { recorded: true, autoHidden: !!hidden };
}
