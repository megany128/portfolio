import type { APIRoute } from "astro";
import { db } from "../../lib/visitor-server";

export const prerender = false;

const HAT_KEYS = ["bucket", "top", "cap", "sprout", "party"] as const;
type HatKey = (typeof HAT_KEYS)[number];

function isHatKey(v: unknown): v is HatKey {
  return typeof v === "string" && (HAT_KEYS as readonly string[]).includes(v);
}

/** GET — return hat pick counts. */
export const GET: APIRoute = async (ctx) => {
  const rows = await db(ctx)
    .prepare(
      `SELECT key, value FROM counters WHERE key LIKE 'hat_%'`,
    )
    .all<{ key: string; value: number }>();

  const counts: Record<string, number> = {};
  for (const r of rows.results) {
    const hat = r.key.replace("hat_", "");
    counts[hat] = r.value;
  }
  return new Response(JSON.stringify({ counts }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

/** POST — switch hat. Body: { from?: string, to: string } */
export const POST: APIRoute = async (ctx) => {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { from, to } = body as { from?: string; to?: string };
  if (!to || (!isHatKey(to) && to !== "none")) {
    return new Response("Invalid hat", { status: 400 });
  }

  const d = db(ctx);
  const stmts: D1PreparedStatement[] = [];

  // Decrement old hat (if it was a real hat, not "none")
  if (from && isHatKey(from)) {
    stmts.push(
      d.prepare(
        `UPDATE counters SET value = MAX(value - 1, 0) WHERE key = ?`,
      ).bind(`hat_${from}`),
    );
  }

  // Increment new hat (if it's a real hat, not "none")
  if (isHatKey(to)) {
    stmts.push(
      d.prepare(
        `INSERT INTO counters (key, value) VALUES (?, 1)
         ON CONFLICT(key) DO UPDATE SET value = value + 1`,
      ).bind(`hat_${to}`),
    );
  }

  if (stmts.length) await d.batch(stmts);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
};
