/**
 * Server-side profanity filter for visitor names.
 * Word list is stored as FNV-1a hashes to prevent casual inspection.
 * Handles l33t speak, spacing, and punctuation evasion.
 */

/** FNV-1a 32-bit hash. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Hashed blocked words — not human-readable in source.
// To update: hash new words with fnv1a() and add to the set.
const BLOCKED = new Set([
  3866578250, 2916843581, 2919109247, 3938945542, 2300720737,
  2824268595, 1456765026, 2090526271, 2444789715, 3114006918,
  1825958011, 2505785029, 2985822365, 2758825305, 3656079069,
  2491417249, 2460286864, 551573376, 2170560880, 2307522440,
  2816072225, 3666295138, 3017570559, 3184963045, 2233071915,
  2885938328, 2150367198, 4250961641, 2761596009, 2108761896,
  3909764211, 1356362998, 4249104160, 3646700319, 1418208120,
  2562532229, 2447652168,
]);

const MIN_WORD = 3;
const MAX_WORD = 10;

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
  "7": "t", "8": "b", "@": "a", "$": "s", "!": "i",
};

function normalize(input: string): string {
  return Array.from(input.toLowerCase())
    .map((ch) => LEET[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

/** Returns true if the name contains profanity. */
export function containsProfanity(name: string): boolean {
  const n = normalize(name);
  for (let len = MIN_WORD; len <= Math.min(MAX_WORD, n.length); len++) {
    for (let i = 0; i <= n.length - len; i++) {
      if (BLOCKED.has(fnv1a(n.slice(i, i + len)))) return true;
    }
  }
  return false;
}
