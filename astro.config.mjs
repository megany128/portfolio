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
