import type { APIContext } from "astro";
import {
  createVisitor,
  getCurrentVisitor,
  isCardColor,
  updateVisitor,
  writeVisitorId,
} from "../../lib/visitor-server";

export const prerender = false;

/** Max size of a submitted signature data URL, in bytes. D1 rows are small — a
 *  60KB cap keeps the inbound payload tight while still comfortably fitting
 *  a 400×130-ish PNG of line art. */
const SIGNATURE_MAX_BYTES = 60_000;
/** Quick structural check — "data:image/png;base64,..." with at least one base64 char. */
const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

type SignatureValidation =
  | { ok: true; signature: string | null }
  | { ok: false; status: number; message: string };

function validateSignature(raw: unknown): SignatureValidation {
  if (raw === null || raw === undefined) return { ok: true, signature: null };
  if (typeof raw !== "string") {
    return { ok: false, status: 400, message: "Invalid signature" };
  }
  // Byte length for utf-8 data URL is equivalent to string length in practice
  // (all chars are ASCII), but use TextEncoder to be precise.
  const bytes = new TextEncoder().encode(raw).byteLength;
  if (bytes > SIGNATURE_MAX_BYTES) {
    return { ok: false, status: 413, message: "Signature too large" };
  }
  if (!SIGNATURE_DATA_URL_RE.test(raw)) {
    return { ok: false, status: 400, message: "Invalid signature format" };
  }
  return { ok: true, signature: raw };
}

export async function GET(ctx: APIContext) {
  const visitor = await getCurrentVisitor(ctx);
  if (!visitor) return new Response(null, { status: 404 });
  return Response.json(visitor);
}

export async function POST(ctx: APIContext) {
  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return new Response("Body must be an object", { status: 400 });
  }
  const { name, color, signature } = body as {
    name?: unknown;
    color?: unknown;
    signature?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0 || name.length > 60) {
    return new Response("Invalid name", { status: 400 });
  }
  if (!isCardColor(color)) {
    return new Response("Invalid color", { status: 400 });
  }

  const sig = validateSignature(signature);
  if (!sig.ok) {
    return new Response(sig.message, { status: sig.status });
  }

  // If a visitor already exists for this cookie, treat the submit as a
  // re-issue: keep their number/issued date but accept their new name + color.
  const existing = await getCurrentVisitor(ctx);
  if (existing) {
    const updated = await updateVisitor(ctx, existing.id, {
      name: name.trim(),
      color,
      signature: sig.signature,
    });
    return Response.json(updated ?? existing);
  }

  const visitor = await createVisitor(ctx, {
    name: name.trim(),
    color,
    signature: sig.signature,
  });
  writeVisitorId(ctx, visitor.id);
  return Response.json(visitor);
}
