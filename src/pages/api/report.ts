import type { APIContext } from "astro";
import { readVisitorId, reportCard } from "../../lib/visitor-server";

export const prerender = false;

/** POST — report a card. Body: { cardId } */
export async function POST(ctx: APIContext) {
  const reporterId = readVisitorId(ctx);
  if (!reporterId) {
    return new Response("Must be signed in to report", { status: 401 });
  }

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { cardId } = body as { cardId?: string };
  if (typeof cardId !== "string") {
    return new Response("Invalid cardId", { status: 400 });
  }
  if (cardId === reporterId) {
    return new Response("Cannot report your own card", { status: 400 });
  }

  const result = await reportCard(ctx, cardId, reporterId);
  return Response.json(result);
}
