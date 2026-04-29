import type { APIRoute } from "astro";

// Stale Webflow path. Returning 410 Gone tells Google to drop it from the
// index permanently (faster than a soft 404). Old SERP entries linking
// here would otherwise hit DNS_PROBE_FINISHED_NXDOMAIN until purge.
export const GET: APIRoute = () =>
  new Response("Gone. This page no longer exists. See /home for projects.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
