import type { APIContext } from "astro";
import { getVisitorSignature } from "../../../lib/visitor-server";

export const prerender = false;

export async function GET(ctx: APIContext) {
  const id = ctx.params.id;
  if (!id) return new Response(null, { status: 400 });

  const signature = await getVisitorSignature(ctx, id);
  if (!signature) return new Response(null, { status: 404 });

  return new Response(signature, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
