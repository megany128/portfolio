/*
 * Client-side helpers for the visitor-card on the onboarding scene.
 *
 *   rippleColor    — expand a circular mask of the new card color from a
 *                    chosen origin, swap the card's data-color once the
 *                    wash has covered the card, then fade the overlay out.
 *                    Also cross-fades the per-color tints/accents so labels
 *                    and the ASCII flower don't snap.
 *
 *   dissolveText   — replace text content with a two-phase char animation:
 *                    each existing char drifts away + fades, then the new
 *                    chars stream in on a tight stagger.
 */

import type { CardColor } from "./visitor";

const COLOR_BG: Record<CardColor, string> = {
  pink: "var(--color-pink)",
  teal: "var(--color-teal)",
  green: "var(--color-green)",
  orange: "var(--color-orange)",
  neutral: "var(--color-bg-neutral-2)",
};

export function rippleColor(
  card: HTMLElement,
  nextColor: CardColor,
  origin: { x: number; y: number } = { x: 0.5, y: 0.5 }
) {
  if (card.dataset.color === nextColor) return;

  // If a previous ripple is still in flight, clear it first so we don't stack.
  card.querySelectorAll<HTMLElement>("[data-ripple-overlay], [data-ripple-flare]").forEach((n) => n.remove());

  const originX = `${(origin.x * 100).toFixed(2)}%`;
  const originY = `${(origin.y * 100).toFixed(2)}%`;

  // Main color wash — wider and slower for drama.
  const overlay = document.createElement("div");
  overlay.dataset.rippleOverlay = "";
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: ${COLOR_BG[nextColor]};
    clip-path: circle(0% at ${originX} ${originY});
    transition: clip-path 1.05s cubic-bezier(0.22, 1, 0.36, 1),
                opacity 0.32s ease-out;
    opacity: 1;
    z-index: 0;
    border-radius: inherit;
  `;

  // A bright flare at the origin that rides with the wash and fades as it
  // grows. Gives the ripple a distinct "ignition point" feel.
  const flare = document.createElement("div");
  flare.dataset.rippleFlare = "";
  flare.style.cssText = `
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(circle at ${originX} ${originY},
      rgba(255,255,255,0.55), rgba(255,255,255,0.22) 22%, transparent 55%);
    opacity: 0;
    transition: opacity 0.45s cubic-bezier(0.22, 1, 0.36, 1);
    mix-blend-mode: soft-light;
    z-index: 0;
    border-radius: inherit;
  `;

  card.prepend(flare);
  card.prepend(overlay);

  // A subtle breath: card inhales slightly and settles back.
  const prevTransform = card.style.transform;
  card.style.transition = "transform 1.1s cubic-bezier(0.22, 1, 0.36, 1)";
  requestAnimationFrame(() => {
    // Flip data-color on the same frame the clip-path starts expanding. The
    // card's CSS `transition: background-color, color` then cross-fades the
    // base card + labels + flower to the new tint in parallel with the wash —
    // no inline-background pin needed, which is what was causing the old
    // color to flash back when the overlay faded out.
    card.setAttribute("data-color", nextColor);
    overlay.style.clipPath = `circle(180% at ${originX} ${originY})`;
    flare.style.opacity = "1";
    card.style.transform = `${prevTransform} scale(1.015)`.trim();
  });

  // Flare fades as the wash approaches the far edge.
  window.setTimeout(() => {
    flare.style.opacity = "0";
  }, 520);

  // Settle the breath + fade the overlay once the wash has covered the card.
  window.setTimeout(() => {
    card.style.transform = prevTransform;
  }, 760);

  window.setTimeout(() => {
    overlay.style.opacity = "0";
  }, 960);

  window.setTimeout(() => {
    overlay.remove();
    flare.remove();
    card.style.transition = "";
  }, 1320);
}

export function dissolveText(el: HTMLElement, nextText: string) {
  const prev = (el.textContent ?? "").trim();
  if (prev === nextText) return;

  // Split current text into chars.
  const prevChars = Array.from(prev);
  el.textContent = "";
  for (const ch of prevChars) {
    const span = document.createElement("span");
    span.textContent = ch === " " ? "\u00a0" : ch;
    span.style.cssText = `
      display: inline-block;
      transition: transform 0.42s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity 0.42s ease-out,
                  filter 0.42s ease-out;
      will-change: transform, opacity, filter;
    `;
    el.appendChild(span);
  }

  // Next frame: animate current chars away in random directions.
  requestAnimationFrame(() => {
    const spans = el.querySelectorAll<HTMLSpanElement>("span");
    spans.forEach((s) => {
      const dx = (Math.random() - 0.5) * 24;
      const dy = (Math.random() - 0.8) * 14; // bias upward for a rising fall-apart
      const rot = (Math.random() - 0.5) * 18;
      s.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
      s.style.opacity = "0";
      s.style.filter = "blur(4px)";
    });
  });

  // After the dissolve, stream the new chars in.
  window.setTimeout(() => {
    el.textContent = "";
    const nextChars = Array.from(nextText);
    nextChars.forEach((ch, i) => {
      const span = document.createElement("span");
      span.textContent = ch === " " ? "\u00a0" : ch;
      span.style.cssText = `
        display: inline-block;
        opacity: 0;
        transform: translateY(6px);
        filter: blur(3px);
        transition: transform 0.32s cubic-bezier(0.22, 1, 0.36, 1) ${i * 22}ms,
                    opacity 0.32s ease-out ${i * 22}ms,
                    filter 0.32s ease-out ${i * 22}ms;
      `;
      el.appendChild(span);
    });
    requestAnimationFrame(() => {
      el.querySelectorAll<HTMLSpanElement>("span").forEach((s) => {
        s.style.transform = "translateY(0)";
        s.style.opacity = "1";
        s.style.filter = "blur(0)";
      });
    });
  }, 460);
}

/**
 * When the user types into the name field we want a live, responsive update,
 * NOT a dissolve. This helper sets the text without any animation and clears
 * out any lingering per-char spans from a previous dissolve.
 */
export function setTextPlain(el: HTMLElement, nextText: string) {
  el.textContent = nextText;
}
