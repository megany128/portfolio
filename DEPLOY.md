# Deploy

## Cloudflare Workers + D1

### One-time setup (per environment)

1. **Sync the prod D1 schema with the migrations table.** The DB was bootstrapped with raw SQL during dev, so wrangler doesn't know `0001_visitors.sql` was applied. Reset:

   ```sh
   pnpm exec wrangler d1 execute portfolio --remote --command "DROP TABLE IF EXISTS visitors;"
   pnpm exec wrangler d1 migrations apply portfolio --remote
   ```

2. **Login to Cloudflare** (browser window):

   ```sh
   pnpm exec wrangler login
   ```

### Every deploy

```sh
pnpm build
pnpm exec wrangler deploy
```

Wrangler will print a `<name>.workers.dev` URL.

### Custom domain

In the Cloudflare dashboard:

1. Workers & Pages → `portfolio` worker → **Settings → Domains & Routes → Add Custom Domain**
2. Enter your domain (e.g. `meganyap.com`).
3. If the domain is already on Cloudflare DNS, the records auto-create. If not:
   - Cloudflare → **Add Site** → enter the domain.
   - Update nameservers at your registrar to the ones Cloudflare provides.
   - Once DNS propagates (minutes to hours), the custom domain hooks up.

### Optional: silence the sessions warning

`@astrojs/cloudflare` 12.x enables sessions on a `SESSION` KV binding by default. We don't use sessions, but the warning is noisy. Either add the binding:

```sh
pnpm exec wrangler kv namespace create SESSION
# paste the returned id into wrangler.toml under [[kv_namespaces]]
```

…or disable sessions in `astro.config.mjs`:

```js
adapter: cloudflare({ platformProxy: { enabled: true }, sessions: false }),
```

### Local dev with D1

```sh
pnpm exec wrangler d1 migrations apply portfolio --local
pnpm dev
```

The Astro dev server uses the Cloudflare platform proxy, which spins up a local SQLite-backed D1 in `.wrangler/`. Migrations need to be applied locally separately from remote.

### Reset local data

```sh
pnpm exec wrangler d1 execute portfolio --local --command "DELETE FROM visitors;"
```
