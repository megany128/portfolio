import type { APIContext } from "astro";
import {
  cachedJson,
  GALLERY_CACHE_TTL_SECONDS,
  LIST_VISITORS_MAX,
  listVisitors,
} from "../../lib/visitor-server";

export const prerender = false;

/**
 * Latest gallery cards including signature blobs — used by the onboarding
 * wallet animation (limit=20). Every row carries a ~20–40 KB PNG, so the
 * limit is hard-capped and the result is served from the edge cache for
 * GALLERY_CACHE_TTL_SECONDS: a burst (or a crawler) costs one D1 read per
 * colo per minute instead of one per request.
 */
export async function GET(ctx: APIContext) {
  const url = new URL(ctx.request.url);
  const requested = Number(url.searchParams.get("limit") ?? 20) || 20;
  const limit = Math.min(Math.max(1, requested), LIST_VISITORS_MAX);
  const visitors = await cachedJson(ctx, `visitors-${limit}`, () => listVisitors(ctx, limit));
  return Response.json(
    { visitors, total: visitors.length },
    { headers: { "Cache-Control": `public, max-age=${GALLERY_CACHE_TTL_SECONDS}` } },
  );
}
