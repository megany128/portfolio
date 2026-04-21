# meganyap.me

My personal portfolio — a design-focused, interactive site built with Astro and deployed on Cloudflare Workers.

## Features

- Animated starfield, shooting stars, and interactive particle sandbox
- Work case studies with detailed project breakdowns
- Visitor tracking system with an onboarding experience and gallery
- Custom cursor, signature pad, color picker, and other playful interactions
- Responsive design with motion-safe animations

## Tech Stack

- **Astro 5** — SSR with file-based routing and View Transitions
- **Cloudflare Workers + D1** — edge hosting with SQLite for visitor data
- **Tailwind CSS v4** — styling via Vite plugin
- **GSAP** — animation
- **TypeScript**

## Getting Started

```bash
pnpm install
pnpm dev
```

Other scripts:

```bash
pnpm build      # build for Cloudflare Workers
pnpm preview    # preview production build
pnpm check      # TypeScript checking
```

## Project Structure

```
src/
├── components/    # 35+ components organized by feature
│   ├── home/      # starfield, project cards, hero
│   ├── about/     # community cards, favorites shelf, stickers
│   ├── gallery/   # visitor gallery
│   ├── onboarding/# visitor onboarding flow
│   ├── scenery/   # shooting stars, spark bursts, particles
│   └── ui/        # shared primitives (Button, Tag, Field…)
├── layouts/       # base page layout
├── lib/           # visitor tracking, utilities
├── pages/         # file-based routes + API endpoints
└── styles/        # design tokens (colors, type, spacing, motion)
```
