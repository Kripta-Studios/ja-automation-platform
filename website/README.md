# J&A Automation Website

This repository contains the Next.js 16 (App Router) website for J&A Automation LLC.

## Tech Stack

- **Framework**: Next.js 16.3.1 (React 19)
- **Styling**: Tailwind CSS v4 + Tailwind UI / shadcn patterns
- **Language**: TypeScript (Strict Mode)
- **Internationalization**: `next-intl` (en, pt, es)
- **Fonts**: Manrope (Primary) & IBM Plex Mono (Metadata)
- **Runtime**: Node 24.19.0
- **Package Manager**: pnpm 11.22.0

## Getting Started

Run the commands from the repository root.

1. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

2. Start the public website:

   ```bash
   pnpm dev:site
   ```

3. Open [http://localhost:5173/j-aautomation/en](http://localhost:5173/j-aautomation/en).

## Project Structure

- `/app` - Next.js App Router (Layouts, Pages, Error boundaries)
- `/components` - Reusable React components (UI, Navigation, Layout)
- `/content` - Statically typed data sources (Projects, Services, Industries)
- `/lib` - Utilities (i18n routing, cn, etc.)
- `/public` - Static assets (Images, Fonts, Logos)

See `docs/CONTENT_GUIDE.md` for content management and `docs/DEPLOYMENT.md` for the production
release procedure.

The public website is released with the private portal from the repository-level Compose deployment.
The portal showcase entry point is `/j-aautomation/app/login`; its synthetic role access and owner
identity are documented in `../docs/SHOWCASE_ACCESS.md`. The public site remains browser-safe and
does not import the portal database or private authentication boundary.
