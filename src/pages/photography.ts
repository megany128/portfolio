import type { APIRoute } from "astro";

// Stale Webflow path with no equivalent on the new portfolio.
// 410 Gone tells Google to drop it permanently.
export const GET: APIRoute = () =>
  new Response("Gone.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
