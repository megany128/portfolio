import type { APIContext } from "astro";
import { listVisitors } from "../../lib/visitor-server";

export const prerender = false;

export async function GET(ctx: APIContext) {
  const url = new URL(ctx.request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
  const visitors = await listVisitors(ctx, limit);
  return Response.json({ visitors, total: visitors.length });
}
