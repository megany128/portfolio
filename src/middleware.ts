import { defineMiddleware } from "astro:middleware";

/**
 * czech.meganyap.me → /czech. The subdomain is attached to this same Worker
 * as a custom domain, so only its root needs rewriting; /api/* and /_astro/*
 * assets resolve normally on either host.
 */
export const onRequest = defineMiddleware((ctx, next) => {
  if (ctx.url.hostname.startsWith("czech.") && ctx.url.pathname === "/") {
    return ctx.rewrite("/czech");
  }
  return next();
});
