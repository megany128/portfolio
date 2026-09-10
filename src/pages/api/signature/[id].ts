import type { APIContext } from "astro";
import {
  getVisitorSignature,
  getVisitorSignatureOwn,
  matchCachedSignature,
  putCachedSignature,
  readVisitorId,
} from "../../../lib/visitor-server";

export const prerender = false;

const HEADERS = {
  "Content-Type": "text/plain",
  "Cache-Control": "public, max-age=86400",
};

/**
 * Signature data URL for one card. The gallery lazy-loads this for every
 * visible card, so approved signatures are served from the edge cache: after
 * the first visitor at a colo, the same card costs no D1 round trip (which is
 * the bulk of the 250–300 ms per fetch for visitors far from the primary).
 */
export async function GET(ctx: APIContext) {
  const id = ctx.params.id;
  if (!id) return new Response(null, { status: 400 });

  // Allow the current visitor to see their own signature even if unapproved.
  // Never cached: the approval state differs from what other visitors get.
  const isOwn = readVisitorId(ctx) === id;
  if (isOwn) {
    const own = await getVisitorSignatureOwn(ctx, id);
    if (!own) return new Response(null, { status: 404 });
    return new Response(own, { headers: HEADERS });
  }

  const cached = await matchCachedSignature(ctx, id);
  if (cached) return new Response(cached, { headers: HEADERS });

  const signature = await getVisitorSignature(ctx, id);
  if (!signature) return new Response(null, { status: 404 });

  await putCachedSignature(ctx, id, signature);
  return new Response(signature, { headers: HEADERS });
}
