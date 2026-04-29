import type { APIRoute } from "astro";

// Stale Webflow path with no equivalent on the new portfolio.
export const GET: APIRoute = () =>
  new Response("Gone.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
