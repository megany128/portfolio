import type { APIContext } from "astro";
import { getLogThumb } from "../../../lib/logs-server";

export const prerender = false;

/** GET — serve an uploaded log-link thumbnail as a real image response. */
export async function GET(ctx: APIContext) {
  const id = ctx.params.id ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const dataUrl = await getLogThumb(ctx, id);
  const match = dataUrl?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!match) {
    return new Response("Not found", { status: 404 });
  }

  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "content-type": match[1],
      // Thumbs are immutable — a re-upload gets a fresh UUID path.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
