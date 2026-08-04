import type { APIContext } from "astro";
import { isAdminAuthorized } from "../../../lib/admin-server";
import {
  listLogs,
  createLog,
  deleteLog,
  renderLogHtml,
  formatLogDate,
} from "../../../lib/logs-server";

export const prerender = false;

const MAX_BODY_LENGTH = 4000;

/** GET — all log entries, newest first. */
export async function GET(ctx: APIContext) {
  if (!isAdminAuthorized(ctx)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const logs = await listLogs(ctx);
  return Response.json({ logs });
}

/**
 * POST — publish a new log, or render a preview without saving.
 * Body: { body: string, preview?: boolean }
 * Preview responses return { html, date } produced by the same renderer
 * /home uses, so what you see is exactly what ships.
 */
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

  const body = typeof (payload as { body?: unknown }).body === "string"
    ? ((payload as { body: string }).body).trim()
    : "";
  if (!body || body.length > MAX_BODY_LENGTH) {
    return new Response("Invalid request", { status: 400 });
  }

  if ((payload as { preview?: unknown }).preview === true) {
    return Response.json({
      html: renderLogHtml(body, { previews: true }),
      date: formatLogDate(new Date().toISOString()),
    });
  }

  const log = await createLog(ctx, body);
  return Response.json({ log });
}

/** DELETE — remove a log. Body: { id: number } */
export async function DELETE(ctx: APIContext) {
  if (!isAdminAuthorized(ctx)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const id = (payload as { id?: unknown }).id;
  if (typeof id !== "number" || !Number.isInteger(id)) {
    return new Response("Invalid request", { status: 400 });
  }

  const ok = await deleteLog(ctx, id);
  return Response.json({ ok });
}
