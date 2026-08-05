/*
 * Log entries — server-side. Bodies are plain text with markdown-style
 * links ([text](https://url)); renderLogHtml escapes everything else, so the
 * admin textbox can't inject markup beyond the anchors we generate.
 */

import type { APIContext } from "astro";
import { db } from "./visitor-server";

export type LogRecord = {
  id: number;
  body: string;
  createdAt: string;
};

type LogRow = {
  id: number;
  body: string;
  created_at: string;
};

/** Hosts that get the mini browser-window hover preview on /home. */
const PREVIEW_SITES: Record<string, string> = {
  "lingofable.com": "/images/projects/lingofable.png",
  "sklonuj.com": "/images/projects/sklonuj.png",
};

/** Shown if the logs table is empty or unreachable, so /home never blanks. */
export const FALLBACK_LOG: LogRecord = {
  id: 0,
  body: "[@Simon Ilincev](https://simonilincev.com/) and I have just launched [Lingofable](https://lingofable.com), a language learning app based on comprehensible input! Currently, I'm also building [Skloňuj](https://sklonuj.com), a tool for Czech learners to practice noun declension — it's being piloted by four universities.",
  createdAt: "2026-04-12T12:00:00Z",
};

function rowToRecord(row: LogRow): LogRecord {
  return { id: row.id, body: row.body, createdAt: row.created_at };
}

export async function getLatestLog(ctx: APIContext): Promise<LogRecord | null> {
  try {
    const row = await db(ctx)
      .prepare(`SELECT id, body, created_at FROM logs ORDER BY created_at DESC, id DESC LIMIT 1`)
      .first<LogRow>();
    return row ? rowToRecord(row) : null;
  } catch {
    return null;
  }
}

export async function listLogs(ctx: APIContext): Promise<LogRecord[]> {
  try {
    const result = await db(ctx)
      .prepare(`SELECT id, body, created_at FROM logs ORDER BY created_at DESC, id DESC`)
      .all<LogRow>();
    return (result.results ?? []).map(rowToRecord);
  } catch {
    return [];
  }
}

export async function createLog(ctx: APIContext, body: string): Promise<LogRecord> {
  const createdAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const row = await db(ctx)
    .prepare(`INSERT INTO logs (body, created_at) VALUES (?, ?) RETURNING id, body, created_at`)
    .bind(body, createdAt)
    .first<LogRow>();
  if (!row) throw new Error("Failed to insert log");
  return rowToRecord(row);
}

export async function deleteLog(ctx: APIContext, id: number): Promise<boolean> {
  const row = await db(ctx)
    .prepare(`DELETE FROM logs WHERE id = ? RETURNING id`)
    .bind(id)
    .first<{ id: number }>();
  return row !== null;
}

/** Store an uploaded thumbnail data URL; returns its public path. */
export async function createLogThumb(ctx: APIContext, dataUrl: string): Promise<string> {
  const id = crypto.randomUUID();
  await db(ctx)
    .prepare(`INSERT INTO log_thumbs (id, data_url) VALUES (?, ?)`)
    .bind(id, dataUrl)
    .run();
  return `/api/log-thumb/${id}`;
}

export async function getLogThumb(ctx: APIContext, id: string): Promise<string | null> {
  const row = await db(ctx)
    .prepare(`SELECT data_url FROM log_thumbs WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<{ data_url: string }>();
  return row?.data_url ?? null;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function previewSpan(host: string, image: string): string {
  return (
    `<span class="latest-log__preview" aria-hidden="true">` +
    `<span class="site-preview__chrome">` +
    `<span class="site-preview__dots"><i></i><i></i><i></i></span>` +
    `<span class="site-preview__url">${host}</span>` +
    `</span>` +
    `<span class="site-preview__thumb" style="background-image: url(${image});"></span>` +
    `</span>`
  );
}

/**
 * Escape a log body and convert [text](https://url) into styled anchors.
 * With `previews`, links get the hover-preview chip markup that /home's
 * global styles + wireSitePreviews() pick up. The thumbnail comes from
 * `[text](https://url | /images/thumb.png)` syntax, falling back to
 * PREVIEW_SITES for known project hosts.
 */
export function renderLogHtml(body: string, opts: { previews?: boolean } = {}): string {
  const linked = escapeHtml(body).replace(
    // Forgiving link syntax: optional space between ] and (, and the scheme
    // may be omitted for domain-looking URLs ("lingofable.com").
    /\[([^\]]+)\]\s*\(\s*((?:https?:\/\/)?[^\s)|]+\.[^\s)|]+)(?:\s*\|\s*([^)]+?)\s*)?\)/g,
    (_match, text: string, rawUrl: string, thumb: string | undefined) => {
      const url = /^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      let host = "";
      try {
        host = new URL(url.replace(/&amp;/g, "&")).hostname.replace(/^www\./, "");
      } catch {
        return text;
      }
      const image = opts.previews ? (thumb ?? PREVIEW_SITES[host]) : undefined;
      const attrs = image ? " data-site-preview" : "";
      const chip = image ? previewSpan(host, image) : "";
      return (
        `<a href="${url}" target="_blank" rel="noopener noreferrer"${attrs}` +
        ` class="latest-log__site-link">${text}${chip}</a>`
      );
    },
  );
  return linked.replace(/\n/g, "<br />");
}

/** "2026-04-12T12:00:00Z" → "Apr 12, 2026".
 * Timestamps are stored in UTC; formatting in UTC showed the next day for
 * evening posts. Renders in the viewer's timezone when known (Cloudflare's
 * `cf.timezone` per request), falling back to Eastern. */
export function formatLogDate(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const opts = { month: "short", day: "numeric", year: "numeric" } as const;
  try {
    return d.toLocaleDateString("en-US", { ...opts, timeZone: timeZone || "America/New_York" });
  } catch {
    // Unrecognized timezone string — fall back rather than 500 the page.
    return d.toLocaleDateString("en-US", { ...opts, timeZone: "America/New_York" });
  }
}

/** The viewer's IANA timezone from Cloudflare's request geo, if present. */
export function viewerTimeZone(ctx: APIContext): string | undefined {
  return (ctx.locals as any)?.runtime?.cf?.timezone as string | undefined;
}
