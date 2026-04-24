import type { APIRoute } from "astro";
import { db } from "../../lib/visitor-server";

export const prerender = false;

/** GET — return current global poke count. */
export const GET: APIRoute = async (ctx) => {
  const row = await db(ctx)
    .prepare(`SELECT value FROM counters WHERE key = 'pet_pokes'`)
    .first<{ value: number }>();
  return new Response(JSON.stringify({ pokes: row?.value ?? 0 }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

/** POST — increment poke count by 1, return new total. */
export const POST: APIRoute = async (ctx) => {
  const row = await db(ctx)
    .prepare(
      `INSERT INTO counters (key, value) VALUES ('pet_pokes', 1)
       ON CONFLICT(key) DO UPDATE SET value = value + 1
       RETURNING value`,
    )
    .first<{ value: number }>();
  return new Response(JSON.stringify({ pokes: row?.value ?? 0 }), {
    headers: { "content-type": "application/json" },
  });
};
