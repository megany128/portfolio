import type { APIContext } from "astro";
import { db } from "../../../lib/visitor-server";
import { isAdminAuthorized } from "../../../lib/admin-server";
import { CZECH_TASK_IDS, isIsoDay } from "../../../lib/czech";

export const prerender = false;

/** GET ?from=YYYY-MM-DD — every check on or after `from`, as { day: taskIds[] }. */
export async function GET(ctx: APIContext) {
  const from = ctx.url.searchParams.get("from") ?? "";
  if (!isIsoDay(from)) return new Response("Invalid from", { status: 400 });

  const { results } = await db(ctx)
    .prepare(`SELECT day, task FROM czech_checks WHERE day >= ? ORDER BY day`)
    .bind(from)
    .all<{ day: string; task: string }>();

  const days: Record<string, string[]> = {};
  for (const r of results) (days[r.day] ??= []).push(r.task);
  return Response.json({ days }, { headers: { "cache-control": "no-store" } });
}

/** POST { day, task, done } — check or uncheck one task. Admin token required. */
export async function POST(ctx: APIContext) {
  if (!isAdminAuthorized(ctx)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (typeof payload !== "object" || payload === null) {
    return new Response("Invalid request", { status: 400 });
  }

  const { day, task, done } = payload as { day?: unknown; task?: unknown; done?: unknown };
  if (
    typeof day !== "string" ||
    !isIsoDay(day) ||
    typeof task !== "string" ||
    !CZECH_TASK_IDS.has(task) ||
    typeof done !== "boolean"
  ) {
    return new Response("Invalid request", { status: 400 });
  }

  const stmt = done
    ? `INSERT OR IGNORE INTO czech_checks (day, task) VALUES (?, ?)`
    : `DELETE FROM czech_checks WHERE day = ? AND task = ?`;
  await db(ctx).prepare(stmt).bind(day, task).run();
  return Response.json({ ok: true });
}
