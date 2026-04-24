import type { APIContext } from "astro";
import { getVisitorSignature, readVisitorId, getVisitorSignatureOwn } from "../../../lib/visitor-server";

export const prerender = false;

export async function GET(ctx: APIContext) {
  const id = ctx.params.id;
  if (!id) return new Response(null, { status: 400 });

  // Allow the current visitor to see their own signature even if unapproved.
  const isOwn = readVisitorId(ctx) === id;
  const signature = isOwn
    ? await getVisitorSignatureOwn(ctx, id)
    : await getVisitorSignature(ctx, id);
  if (!signature) return new Response(null, { status: 404 });

  return new Response(signature, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
