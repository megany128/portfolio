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

  const stmt = hasSignature
    ? db(ctx)
        .prepare(
          `UPDATE visitors SET name = ?, color = ?, signature_png = ? WHERE id = ?
           RETURNING id, number, name, color, issued_at, signature_png AS signature`
        )
        .bind(input.name, input.color, input.signature ?? null, id)
    : db(ctx)
        .prepare(
          `UPDATE visitors SET name = ?, color = ? WHERE id = ?
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
       FROM visitors ORDER BY number DESC LIMIT ?`
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
       FROM visitors ORDER BY number DESC LIMIT ? OFFSET ?`
    )
    .bind(limit, offset)
    .all<VisitorRow>();

  return rows.results.map(rowToRecord);
}

/** Total number of visitors in the DB. */
export async function countVisitors(ctx: APIContext): Promise<number> {
  const row = await db(ctx)
    .prepare(`SELECT COUNT(*) AS cnt FROM visitors`)
    .first<{ cnt: number }>();
  return row?.cnt ?? 0;
}

/** Fetch just the signature data URL for a single visitor. */
export async function getVisitorSignature(
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
