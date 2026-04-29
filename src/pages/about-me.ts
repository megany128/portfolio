import type { APIRoute } from "astro";

// Stale Webflow path → 410 so Google purges. New equivalent: /about.
export const GET: APIRoute = () =>
  new Response("Gone. See /about.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
