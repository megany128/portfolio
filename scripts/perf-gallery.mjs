/*
  Visitor-gallery perf benchmark.

  Boots a headless chromium, opens /visitor-gallery against the local dev
  server, clones cards client-side up to TARGET_CARDS (default 1608) so the
  scenario matches production scale, then measures rAF frame intervals during
  scroll, mousemove, and card-hover sweeps.

  Why this exists: the gallery slowed to ~5 fps once the visitor count grew
  past a thousand, and the cause (per-card glimmer animations + layout work
  for thousands of grid cells) is hard to repro by hand without thousands of
  real DB rows. Reruns of this script verify the fixes hold after future
  changes to LibraryCard / MiniLibraryCard / Grid.

  Usage:
    pnpm dev                              # in another terminal
    pnpm perf                             # default: 1608 cards, headless
    HEADLESS=0 pnpm perf                  # show the browser
    TARGET_CARDS=500 pnpm perf            # smaller scenario
    URL_BASE=http://localhost:4322 pnpm perf
*/
import { chromium } from "playwright";

const URL_BASE = process.env.URL_BASE || "http://localhost:4321";
const HEADLESS = process.env.HEADLESS !== "0";
const TARGET_CARDS = Number(process.env.TARGET_CARDS || 1608);

async function loadAllCards(page) {
  // Click "Load more" until the button is gone or 100 iterations safety cap.
  let safety = 100;
  while (safety-- > 0) {
    const btn = await page.$("[data-gallery-load-more]");
    if (!btn) break;
    await btn.scrollIntoViewIfNeeded();
    await btn.click().catch(() => {});
    await page.waitForTimeout(120);
  }
  return page.$$eval("[data-mini-card-wrap]", (els) => els.length);
}

async function measure(page, label, action) {
  // Install a rAF frame timer + longtask observer in the page, run the
  // scenario, then read back percentile stats. Slice off the first 2 frames
  // to drop start-of-measurement noise.
  await page.evaluate(() => {
    window.__perf = { times: [], longTasks: 0 };
    let last = performance.now();
    const tick = (now) => {
      window.__perf.times.push(now - last);
      last = now;
      window.__perf.raf = requestAnimationFrame(tick);
    };
    window.__perf.raf = requestAnimationFrame(tick);
    try {
      window.__perf.po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration > 50) window.__perf.longTasks++;
        }
      });
      window.__perf.po.observe({ type: "longtask", buffered: false });
    } catch {}
  });

  await action();

  const stats = await page.evaluate(() => {
    cancelAnimationFrame(window.__perf.raf);
    try { window.__perf.po.disconnect(); } catch {}
    const t = window.__perf.times.slice(2);
    if (!t.length) return null;
    t.sort((a, b) => a - b);
    const sum = t.reduce((a, b) => a + b, 0);
    const avg = sum / t.length;
    return {
      frames: t.length,
      fps: +(1000 / avg).toFixed(1),
      p50Ms: +t[Math.floor(t.length * 0.5)].toFixed(2),
      p95Ms: +t[Math.floor(t.length * 0.95)].toFixed(2),
      p99Ms: +t[Math.floor(t.length * 0.99)].toFixed(2),
      maxMs: +t[t.length - 1].toFixed(2),
      longTasks: window.__perf.longTasks,
    };
  });
  console.log(`[${label}]`, stats);
  return stats;
}

async function scrollTest(page) {
  // Fixed 5000px scroll over 3s — comparable across DOM sizes.
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    const total = Math.min(5000, document.documentElement.scrollHeight - window.innerHeight);
    const dur = 3000;
    const start = performance.now();
    return new Promise((resolve) => {
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        window.scrollTo(0, total * t);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  });
}

async function mousemoveTest(page) {
  // Zig-zag sweep across the viewport.
  const w = await page.evaluate(() => window.innerWidth);
  const h = await page.evaluate(() => window.innerHeight);
  const steps = 60;
  for (let i = 0; i < steps; i++) {
    const x = ((i % 2 === 0 ? i : steps - i) / steps) * (w - 100) + 50;
    const y = (i / steps) * (h - 100) + 50;
    await page.mouse.move(x, y, { steps: 4 });
    await page.waitForTimeout(40);
  }
}

async function hoverCardsTest(page) {
  // Land on the first 30 cards' centers — exercises hover styles
  // (3D tilt, content-visibility flip, glimmer resume).
  const cards = await page.$$eval(
    "[data-mini-card-wrap]",
    (els) => els.slice(0, 30).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }),
  );
  for (const c of cards) {
    await page.mouse.move(c.x, c.y, { steps: 6 });
    await page.waitForTimeout(60);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${URL_BASE}/visitor-gallery`, { waitUntil: "networkidle" });

  console.log("Loading server-paginated cards...");
  const real = await loadAllCards(page);
  console.log(`Real cards in DOM: ${real}`);

  // Local DB is small (~100 cards). Clone to TARGET_CARDS so we benchmark
  // production scale.
  const total = await page.evaluate((target) => {
    const grid = document.querySelector("[data-gallery-grid]");
    if (!grid) return 0;
    const originals = Array.from(grid.querySelectorAll("[data-mini-card-wrap]"));
    if (!originals.length) return 0;
    let i = 0;
    while (grid.querySelectorAll("[data-mini-card-wrap]").length < target) {
      const clone = originals[i % originals.length].cloneNode(true);
      // Strip queue flags so the gallery's observers see the clone as new.
      clone.removeAttribute("data-sig-queued");
      clone.removeAttribute("data-scale-queued");
      grid.appendChild(clone);
      i++;
    }
    return grid.querySelectorAll("[data-mini-card-wrap]").length;
  }, TARGET_CARDS);
  console.log(`Total cards after clone: ${total}`);

  // Reproduce Grid.astro's farObserver on clones (real cards already wired).
  // Also dispatch gallery:cards-added so SitePet's ledge cache rebuilds with
  // the full DOM, matching production where it sees every visitor card.
  await page.evaluate(() => {
    const farObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.removeAttribute("data-virt-far");
        else e.target.setAttribute("data-virt-far", "");
      }
    }, { rootMargin: "600px 0px" });
    document.querySelectorAll("[data-mini-card-wrap]").forEach((el) => farObserver.observe(el));
    window.dispatchEvent(new CustomEvent("gallery:cards-added"));
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  await measure(page, `scroll (${total} cards)`, () => scrollTest(page));
  await page.waitForTimeout(300);
  await measure(page, `mousemove (${total} cards)`, () => mousemoveTest(page));
  await page.waitForTimeout(300);
  await measure(page, `hover cards (${total})`, () => hoverCardsTest(page));

  await browser.close();
})();
