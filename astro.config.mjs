// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://meganyap.me",
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  // 301 redirects for stale Webflow URLs that Google still has indexed.
  // Each entry maps an old slug to its closest equivalent on the new portfolio
  // so SEO signals consolidate instead of leaking into 404s. Update the
  // /cu-reviews and /gcal-wrapped destinations once the matching /work pages
  // ship (currently they fall back to /home).
  redirects: {
    "/lingofable": { status: 301, destination: "/work/lingofable" },
    "/splunk-case-study": { status: 301, destination: "/work/splunk" },
    "/microsoft-copilot": {
      status: 301,
      destination: "https://www.behance.net/gallery/229681695/Microsoft-x-DCC-SP25",
    },
    "/play": { status: 301, destination: "/playground" },
    "/cu-reviews": { status: 301, destination: "/home" },
    "/gcal-wrapped": { status: 301, destination: "/home" },
  },
  vite: {
    plugins: [/** @type {any} */ (tailwindcss())],
    server: {
      // Miniflare (platformProxy) churns SQLite WAL/SHM files under
      // .wrangler/state on every D1 read. Without this, each /onboarding
      // SSR hits D1 → WAL writes → Vite HMR full-reload → next SSR, in an
      // ~10s loop that re-rolls the visitor name on its own.
      watch: {
        ignored: [
          (/** @type {string} */ p) => p.includes(".wrangler"),
          "**/dist/**",
        ],
      },
    },
  },
});
