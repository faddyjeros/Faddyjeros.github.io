# faddyjeros.github.io

Monorepo containing:
- **Portfolio site** (`/src`, `astro.config.ts`) — Astro/React, deployed to GitHub Pages via `.github/workflows/deploy.yml`
- **Finance app** (`/finance-app`) — FastAPI backend + React/Vite frontend, deployed to Render (free tier)

## Deploy Configuration

- Platform: Render (free tier, combined Docker image)
- Production URL: https://finance-app-0ivv.onrender.com
- Database: Neon PostgreSQL (free tier, persistent)
- Deploy: auto-deploy on push to main via Render Git integration
- Merge method: squash
- Project type: web app (FastAPI + React)

### Render Environment Variables

- DATABASE_URL — Neon PostgreSQL connection string
- ANTHROPIC_API_KEY — Anthropic API key
- AUTH_USER / AUTH_PASS — HTTP basic auth credentials

### Local dev

```bash
# Terminal 1 (uses local SQLite when DATABASE_URL is not set)
cd finance-app/backend && uvicorn main:app --reload --port 8000

# Terminal 2
cd finance-app/frontend && npm run dev

# Or via Docker (no auth in dev)
cd finance-app && docker-compose up --build
```

### Database migration

To migrate local SQLite data to Neon PostgreSQL:
```bash
cd finance-app/backend
python migrate_to_postgres.py "postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require" ./finance.db
```

## Design System

The finance app design system is documented in `finance-app/DESIGN.md`. Key points:
- Dark/light mode with emerald (#10b981) accent
- Geist Sans for UI, Geist Mono for financial data
- Sidebar nav on desktop, horizontal swipeable tabs on mobile (hidden scrollbar)
- Zinc-based neutral palette (#09090b bg, #18181b surface, #27272a border)

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
