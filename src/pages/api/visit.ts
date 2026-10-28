import type { APIContext } from "astro";
import {
  clearVisitorId,
  createVisitor,
  deleteOwnVisitor,
  getCurrentVisitor,
  isCardColor,
  takeVisitCreateSlot,
  updateVisitor,
  writeVisitorId,
} from "../../lib/visitor-server";
import { containsProfanity } from "../../lib/profanity";

export const prerender = false;

/** Max size of a submitted signature data URL, in bytes. D1 rows are small — a
 *  60KB cap keeps the inbound payload tight while still comfortably fitting
 *  a 400×130-ish PNG of line art. */
const SIGNATURE_MAX_BYTES = 60_000;
/** Quick structural check — "data:image/png;base64,..." with at least one base64 char. */
const SIGNATURE_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const SIGNATURE_DATA_URL_PREFIX = "data:image/png;base64,";
/** Max compressed PNG bytes per pixel. Line art is mostly empty canvas and
 *  compresses to almost nothing: every real card so far is ≤ 0.19 (median
 *  0.04). Random-pixel noise doesn't compress at all and lands at ~1–4. */
const SIGNATURE_MAX_BYTES_PER_PIXEL = 0.5;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read width × height from the PNG's IHDR chunk (always first, bytes 16–23). */
function pngPixelCount(base64: string): number | null {
  let header: string;
  try {
    header = atob(base64.slice(0, 32)); // 24 bytes
  } catch {
    return null;
  }
  if (header.length < 24) return null;
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (header.charCodeAt(i) !== PNG_MAGIC[i]) return null;
  }
  if (header.slice(12, 16) !== "IHDR") return null;
  const u32 = (o: number) =>
    ((header.charCodeAt(o) << 24) |
      (header.charCodeAt(o + 1) << 16) |
      (header.charCodeAt(o + 2) << 8) |
      header.charCodeAt(o + 3)) >>>
    0;
  const pixels = u32(16) * u32(20);
  return pixels > 0 ? pixels : null;
}

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
  const base64 = raw.slice(SIGNATURE_DATA_URL_PREFIX.length);
  const pixels = pngPixelCount(base64);
  if (pixels === null) {
    return { ok: false, status: 400, message: "Invalid signature format" };
  }
  // Rejects random-pixel noise, which a script submitted ~5,000 times in Oct 2026.
  const pngBytes = (base64.length * 3) / 4;
  if (pngBytes / pixels > SIGNATURE_MAX_BYTES_PER_PIXEL) {
    return { ok: false, status: 400, message: "Signature doesn't look like a drawing" };
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
  if (containsProfanity(name)) {
    return new Response("Please choose a different name", { status: 400 });
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

  if (!(await takeVisitCreateSlot(ctx))) {
    return new Response("Too many new cards from this network today — try again tomorrow", {
      status: 429,
    });
  }

  const visitor = await createVisitor(ctx, {
    name: name.trim(),
    color,
    signature: sig.signature,
  });
  writeVisitorId(ctx, visitor.id);
  return Response.json(visitor);
}

export async function DELETE(ctx: APIContext) {
  const visitor = await getCurrentVisitor(ctx);
  if (!visitor) return new Response(null, { status: 404 });

  await deleteOwnVisitor(ctx, visitor.id);
  clearVisitorId(ctx);

  return new Response(null, { status: 200 });
}
