# faddyjeros.github.io

Monorepo containing:
- **Portfolio site** (`/src`, `astro.config.ts`) — Astro/React, deployed to GitHub Pages via `.github/workflows/deploy.yml`
- **Finance app** (`/finance-app`) — FastAPI backend + React/Vite frontend, deployed to Azure Container Apps

## Deploy Configuration (configured by /setup-deploy)

- Platform: Azure Container Apps
- Production URL: https://finance.faddyjeros.com
- Deploy workflow: .github/workflows/deploy-finance.yml (auto-deploy on push to main when finance-app/** changes)
- Deploy status command: az containerapp show --name finance-frontend --resource-group finance-rg --query "properties.runningStatus"
- Merge method: squash
- Project type: web app (FastAPI + React)
- Post-deploy health check: https://finance.faddyjeros.com

### Custom deploy hooks

- Pre-merge: none
- Deploy trigger: automatic on push to main (paths: finance-app/**)
- Deploy status: az containerapp show --name finance-frontend --resource-group finance-rg
- Health check: https://finance.faddyjeros.com

### Azure Resources

- Resource Group: finance-rg (westeurope)
- Container Registry: financeregistry<random>.azurecr.io
- Container Apps Environment: finance-env
- Backend Container App: finance-backend (internal ingress, port 8000)
- Frontend Container App: finance-frontend (external ingress, port 80)
- Storage: Azure Files share `finance-data` mounted at /data (SQLite persistence)

### GitHub Secrets required

- AZURE_CREDENTIALS — service principal JSON (from azure-setup.sh output)
- AZURE_RESOURCE_GROUP — finance-rg
- ACR_LOGIN_SERVER — <registry>.azurecr.io
- ACR_USERNAME / ACR_PASSWORD — from azure-setup.sh output
- ANTHROPIC_API_KEY — Anthropic API key
- FINANCE_AUTH_USER / FINANCE_AUTH_PASS — HTTP basic auth credentials

### Local dev

```bash
# Terminal 1
cd finance-app/backend && uvicorn main:app --reload --port 8000

# Terminal 2
cd finance-app/frontend && npm run dev

# Or via Docker (no auth in dev)
cd finance-app && docker-compose up --build
```

### First deploy checklist

1. Run `finance-app/azure-setup.sh` (requires Azure CLI + az login)
2. Add all printed values as GitHub Secrets
3. Point `finance.faddyjeros.com` CNAME → Azure frontend FQDN
4. Push to main — GitHub Actions builds + deploys automatically

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
