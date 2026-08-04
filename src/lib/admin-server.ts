import type { APIContext } from "astro";
import { env } from "cloudflare:workers";

/** Bearer-token check shared by every /api/admin/* endpoint. */
export function isAdminAuthorized(ctx: APIContext): boolean {
  const expected = env.ADMIN_TOKEN ?? null;
  if (!expected) return false;
  const auth = ctx.request.headers.get("authorization");
  return auth === `Bearer ${expected}`;
}
