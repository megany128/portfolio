import type { APIContext } from "astro";
import {
  listPendingVisitors,
  approveVisitor,
  approveAllVisitors,
  rejectVisitor,
} from "../../../lib/visitor-server";

export const prerender = false;

function getAdminToken(ctx: APIContext): string | null {
  return (ctx.locals.runtime?.env as Record<string, string>)?.ADMIN_TOKEN ?? null;
}

function isAuthorized(ctx: APIContext): boolean {
  const expected = getAdminToken(ctx);
  if (!expected) return false;
  const auth = ctx.request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}

/** GET — list pending cards. */
export async function GET(ctx: APIContext) {
  if (!isAuthorized(ctx)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const pending = await listPendingVisitors(ctx);
  return Response.json({ pending });
}

/** POST — approve or reject a card. Body: { id, action: "approve"|"reject" } */
export async function POST(ctx: APIContext) {
  if (!isAuthorized(ctx)) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { id, action } = body as { id?: string; action?: string };

  if (action === "approve-all") {
    const count = await approveAllVisitors(ctx);
    return Response.json({ ok: true, count });
  }

  if (typeof id !== "string" || !["approve", "reject"].includes(action ?? "")) {
    return new Response("Invalid request", { status: 400 });
  }

  const ok =
    action === "approve"
      ? await approveVisitor(ctx, id)
      : await rejectVisitor(ctx, id);

  return Response.json({ ok });
}
