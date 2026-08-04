import type { APIContext } from "astro";
import { isAdminAuthorized } from "../../../lib/admin-server";
import { createLogThumb } from "../../../lib/logs-server";

export const prerender = false;

// Client resizes to ≤640px JPEG before upload; this is a generous ceiling
// that still keeps rows well under D1's per-row limits.
const MAX_DATA_URL_LENGTH = 500_000;

/** POST — upload a hover-preview thumbnail. Body: { dataUrl } → { path } */
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

  const dataUrl = (payload as { dataUrl?: unknown }).dataUrl;
  if (
    typeof dataUrl !== "string" ||
    !/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl) ||
    dataUrl.length > MAX_DATA_URL_LENGTH
  ) {
    return new Response("Invalid request", { status: 400 });
  }

  const path = await createLogThumb(ctx, dataUrl);
  return Response.json({ path });
}
