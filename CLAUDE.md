# Portfolio — Megan Yap

## Stack
- **Astro 5** (SSR, file-based routing, View Transitions)
- **Cloudflare Workers + D1** (SQLite) — `wrangler.toml`, adapter in `astro.config.mjs`
- **Tailwind CSS v4** (via Vite plugin)
- **GSAP** for animation
- **pnpm** package manager

## Key Paths
- `src/styles/tokens.css` — design tokens (colors, type, spacing, motion)
- `src/components/ui/` — shared primitives (Button, Logo, Tag, Field…)
- `src/lib/visitor-server.ts` — D1 queries, cookie mgmt
- `src/lib/visitor.ts` — client-side visitor cache + fetch
- `src/pages/api/` — server endpoints (visit.ts, visitors.ts)
- `migrations/` — D1 schema migrations

## Conventions
- Components: `.astro`, PascalCase, props via `interface Props` in frontmatter
- Design tokens: CSS custom properties from `tokens.css` — use these, not raw values
- Colors: cream paper palette, brand colors (pink/teal/green/orange/neutral)
- Typography: Gelica (display), Source Code Pro (mono), Segoe UI (body)
- Animations: respect `prefers-reduced-motion`. Use motion tokens for durations/easing
- Data: D1 prepared statements only (no string interpolation). Visitor identity via HttpOnly cookie + localStorage fallback

## Working With Subagents
- **Delegate liberally** — use `Explore` agents for codebase questions, `general-purpose` agents for multi-step tasks, `Plan` agents for architecture decisions
- Run independent agents **in parallel** when possible
- Subagents don't share context — give them full file paths and enough background to work independently

## Figma MCP Rules
- If Figma returns localhost image/SVG source → use directly, no placeholders
- Do NOT add icon packages — all assets come from Figma payload
- Reuse components from `src/components/` over creating new ones

### Required Figma Flow
1. `get_design_context` → structured representation for exact node(s)
2. If truncated: `get_metadata` first, then re-fetch specific nodes
3. `get_screenshot` → visual reference
4. Download assets, then implement
5. Translate React+Tailwind output → project conventions (Astro components, CSS tokens)
6. Validate against Figma screenshot for 1:1 parity

### Figma Implementation
- Figma output is reference, not final code — adapt to this project's stack
- Replace Tailwind utilities with project design tokens where applicable
- Respect existing routing, state, and data-fetch patterns
- When conflicts arise: prefer design-system tokens, adjust spacing minimally
