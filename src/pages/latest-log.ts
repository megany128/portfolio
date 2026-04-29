import type { APIRoute } from "astro";

// Stale Webflow path → 410 so Google purges. The Latest Log lives on /home.
export const GET: APIRoute = () =>
  new Response("Gone. The latest log lives on /home.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
