/*
 * Client-side visitor helpers. The cookie that proves identity (`mp_vid`) is
 * HttpOnly and managed by the server — clients can't read it directly. Instead
 * we cache the visitor card in localStorage for instant render on returns and
 * fall back to GET /api/visit when missing.
 */

const VISITOR_CACHE_KEY = "mp_visitor";

export type CardColor = "pink" | "teal" | "green" | "orange" | "neutral";

export type VisitorCard = {
  id: string;
  number: number;
  name: string;
  color: CardColor;
  issuedAt: string;
  /** PNG data URL of the drawn signature, or null if the visitor skipped drawing. */
  signature: string | null;
};

export function readCachedCard(): VisitorCard | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(VISITOR_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VisitorCard>;
    // Older cached shapes didn't carry `signature`; normalize to null.
    return {
      id: parsed.id!,
      number: parsed.number!,
      name: parsed.name!,
      color: parsed.color!,
      issuedAt: parsed.issuedAt!,
      signature: parsed.signature ?? null,
    };
  } catch {
    return null;
  }
}

export function writeCachedCard(card: VisitorCard) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(VISITOR_CACHE_KEY, JSON.stringify(card));
  }
}

export function clearCachedCard() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(VISITOR_CACHE_KEY);
  }
}

export async function fetchCurrentCard(): Promise<VisitorCard | null> {
  try {
    const res = await fetch("/api/visit", { credentials: "same-origin" });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const card = (await res.json()) as VisitorCard;
    writeCachedCard(card);
    return card;
  } catch {
    return null;
  }
}

export async function submitCard(input: {
  name: string;
  color: CardColor;
  signature?: string | null;
}): Promise<VisitorCard> {
  const res = await fetch("/api/visit", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      color: input.color,
      signature: input.signature ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to submit visitor card (${res.status})`);
  }
  const card = (await res.json()) as VisitorCard;
  writeCachedCard(card);
  return card;
}
