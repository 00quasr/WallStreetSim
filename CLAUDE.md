# CLAUDE.md

## Project
**WallStreetSim** — A real-time economic simulation where AI agents compete, collude, and crash in a ruthless financial ecosystem. GTA for Wall Street.

Stack: Next.js 14, TypeScript, Fastify, Drizzle ORM, PostgreSQL, Redis, ClickHouse, Socket.io, Tailwind CSS

## Commands

```bash
# Development
pnpm dev                    # Start all services (turbo)
pnpm dev --filter=web       # Frontend only
pnpm dev --filter=api       # API only
pnpm dev --filter=engine    # Tick engine only

# Build
pnpm build                  # Build all packages
pnpm build --filter=web     # Build frontend only

# Lint & Type Check
pnpm lint                   # Lint all packages
pnpm typecheck              # Type check all packages

# Database
pnpm db:generate            # Generate migrations
pnpm db:migrate             # Run migrations
pnpm db:push                # Push schema (dev)
pnpm db:studio              # Open Drizzle Studio
pnpm db:seed                # Seed initial data

# Docker (Databases)
docker compose -f docker-compose.db.yml up -d      # Start DBs
docker compose -f docker-compose.db.yml down       # Stop DBs
docker compose -f docker-compose.db.yml logs -f    # View logs

# Production
pm2 start ecosystem.config.js     # Start all services
pm2 restart all                   # Restart all
pm2 logs                          # View logs
pm2 monit                         # Monitor dashboard
```

## Structure

```
/WallStreetSim
├── apps/
│   ├── web/                 # Next.js 14 frontend (terminal UI)
│   │   ├── app/             # App router pages
│   │   ├── components/      # React components
│   │   │   ├── ui/          # Base UI (Panel, Button, Input, etc.)
│   │   │   ├── layout/      # Shell, Nav, Footer
│   │   │   ├── market/      # StockTicker, OrderBook, Charts
│   │   │   ├── agents/      # AgentCard, AgentList
│   │   │   ├── feed/        # LiveFeed, NewsTicker
│   │   │   └── charts/      # ASCIIChart, Sparkline
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utilities, API client
│   │   └── styles/          # Global CSS
│   │
│   ├── api/                 # Fastify/Hono API server
│   │   ├── routes/          # API endpoints
│   │   │   ├── auth/        # Agent registration, API keys
│   │   │   ├── agents/      # Agent CRUD, portfolios
│   │   │   ├── market/      # Stocks, order book, history
│   │   │   ├── actions/     # Submit agent actions
│   │   │   ├── news/        # News feed
│   │   │   └── world/       # World state, tick info
│   │   ├── middleware/      # Auth, rate limiting, validation
│   │   ├── websocket/       # Socket.io handlers
│   │   └── services/        # Business logic
│   │
│   └── engine/              # Tick simulation engine
│       ├── tick-engine.ts   # Main game loop
│       ├── market-engine.ts # Order matching, price discovery
│       ├── event-generator.ts # Random events
│       ├── sec-ai.ts        # Fraud detection
│       └── news-generator.ts # LLM news generation
│
├── packages/
│   ├── db/                  # Drizzle ORM
│   │   ├── schema/          # Table definitions
│   │   ├── migrations/      # SQL migrations
│   │   └── seed/            # Seed data
│   │
│   ├── types/               # Shared TypeScript types
│   │   ├── agent.ts
│   │   ├── company.ts
│   │   ├── market.ts
│   │   ├── order.ts
│   │   └── events.ts
│   │
│   └── utils/               # Shared utilities
│       ├── validation.ts    # Zod schemas
│       ├── formatting.ts    # Price, number formatting
│       └── constants.ts     # Shared constants
│
├── docker-compose.db.yml    # PostgreSQL, Redis, ClickHouse
├── ecosystem.config.js      # PM2 configuration
├── turbo.json              # Turborepo config
├── pnpm-workspace.yaml     # pnpm workspace
├── .env                    # Environment variables (DO NOT COMMIT)
└── CLAUDE.md               # This file
```

## Code Style

- TypeScript strict mode, no `any`
- Named exports only
- Functional React components with hooks
- Zod for all validation (API inputs, env vars)
- Drizzle ORM for database queries
- Server components by default, `'use client'` only when needed

### Naming Conventions
```typescript
// Files: kebab-case
stock-ticker.tsx
price-engine.ts

// Components: PascalCase
export function StockTicker() {}

// Functions/variables: camelCase
const calculatePrice = () => {}

// Types/Interfaces: PascalCase
interface AgentPortfolio {}
type OrderSide = 'BUY' | 'SELL';

// Constants: SCREAMING_SNAKE_CASE
const MAX_LEVERAGE = 10;
const TICK_INTERVAL_MS = 1000;
```

### Import Order
```typescript
// 1. React/Next
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. External packages
import { z } from 'zod';
import { eq } from 'drizzle-orm';

// 3. Internal packages
import { db } from '@wallstreetsim/db';
import type { Agent } from '@wallstreetsim/types';

// 4. Relative imports
import { Panel } from '../ui/Panel';
import { formatPrice } from '../../lib/utils';
```

## Git

- Branch naming: `feature/[name]` or `fix/[name]`
- Commits: `type(scope): message`
  - `feat(api): add agent registration endpoint`
  - `fix(engine): correct margin call calculation`
  - `style(web): update terminal color scheme`
- Run `pnpm lint && pnpm typecheck` before commit
- Never commit `.env` files
- Never commit with Claude as co-author

## Gotchas

- **Docker must be running** before starting dev servers (databases)
- **Redis password** is required — check `.env` for `REDIS_URL` format
- **WebSocket connections** need sticky sessions in production (Nginx)
- **ClickHouse** uses port 8123 (HTTP) not 9000 for queries
- **Drizzle migrations** — always generate before push to production
- **PM2** — run `pm2 save` after config changes
- **Tick engine** is a singleton — only one instance should run
- **Price inflation** — prices can inflate rapidly due to compounding price changes; reset via SQL if needed
- **WSMessage format** — all Redis pub/sub messages must be wrapped in `{ type, payload, timestamp }` format

## Troubleshooting

### Frontend shows "DISCONNECTED"
1. Check services: `pm2 list` — all should show "online"
2. Check API health: `curl http://localhost:8080/health`
3. Check WebSocket: Browser console should show CONNECTED event
4. Hard refresh browser: `Ctrl+Shift+R` to clear cache

### Tick counter stuck at 0
- Engine must publish tick updates in WSMessage format:
  ```typescript
  const tickUpdateMessage = {
    type: 'TICK_UPDATE',
    payload: tickUpdate,
    timestamp: new Date().toISOString(),
  };
  await redisService.publish(CHANNELS.TICK_UPDATES, tickUpdateMessage);
  ```

### Leaderboard not updating
- Engine must publish to `channel:leaderboard` with LEADERBOARD_UPDATE type
- Frontend subscribes to 'leaderboard' room automatically

### Prices inflating to millions/billions
Reset prices via SQL:
```sql
-- Stop engine first: pm2 stop wss-engine
UPDATE companies SET
  current_price = (10 + random() * 190)::numeric(20,4),
  shares_outstanding = (1000000 + (random() * 499000000))::bigint;
UPDATE companies SET market_cap = current_price * shares_outstanding;
-- Restart: pm2 start wss-engine
```

### PM2 web service showing 0b memory
- Next.js with `wait_ready: true` in cluster mode causes issues
- Use `exec_mode: 'fork'` and `wait_ready: false` for wss-web

## Design Principles (Terminal UI)

We use a **retro terminal aesthetic** — green-on-black CRT style.

### Theme
```css
--terminal-bg: #0a0a0a;
--terminal-text: #33ff33;
--terminal-dim: #1a5c1a;
--terminal-highlight: #66ff66;
--terminal-blue: #3b82f6;    /* For "your agent" indicator */
--terminal-red: #ff3333;     /* Losses, errors, danger */
--terminal-yellow: #ffff33;  /* Warnings */
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;
```

### Rules

**ALWAYS:**
- Monospace fonts everywhere
- Sharp edges, no rounded corners
- ASCII characters for UI elements (`┌─┐`, `│`, `└─┘`, `█░`, `▲▼`)
- Green monochrome palette (except blue for "you", red for losses)
- Blinking cursor on inputs
- Minimal, functional design

**NEVER:**
- Rounded corners (`rounded-*`)
- Shadows (`shadow-*`)
- Gradients
- Colors outside the terminal palette
- Decorative images or icons (use ASCII)
- Sans-serif fonts

### ASCII UI Elements
```
Progress:  ████████████░░░░░░░░ 58%
Borders:   ┌─[ TITLE ]─────────┐
           │ Content here      │
           └───────────────────┘
Sparkline: ▁▂▃▄▅▆▇█
Arrows:    ▲ ▼ ◀ ▶
Status:    ● (active) ○ (inactive) ◉ (selected)
Lists:     ├── item
           └── last item
```

### Component Patterns
```tsx
// Panel with title
<div className="border border-terminal-dim">
  <div className="border-b border-terminal-dim px-3 py-2">
    <span className="text-terminal-text">┌─[ TITLE ]</span>
  </div>
  <div className="p-3">{children}</div>
</div>

// Button
<button className="border border-terminal-text px-4 py-2 hover:bg-terminal-text hover:text-terminal-bg">
  [SUBMIT]
</button>

// Input
<div className="border border-terminal-dim flex items-center">
  <span className="text-terminal-dim pl-2">{'>'}</span>
  <input className="bg-transparent flex-1 p-2 outline-none" />
  <span className="animate-blink pr-2">_</span>
</div>
```

## UI Development: Screenshot-Driven Workflow

UI quality is validated visually.

### Requirements
- Take screenshots before/after changes
- Validate:
  - Terminal aesthetic maintained
  - Spacing & alignment (monospace grid)
  - Color palette (green/black only + exceptions)
  - ASCII borders render correctly
  - Blinking cursor works
  - Responsive at ≥2 breakpoints
  - Loading/empty/error states

### Test in Browser DevTools
```javascript
// Check for non-terminal colors
document.querySelectorAll('*').forEach(el => {
  const style = getComputedStyle(el);
  const color = style.color;
  // Should only be terminal palette colors
});
```

## Environment

```bash
# Database
DATABASE_URL=postgresql://wss_user:PASSWORD@localhost:5432/wallstreetsim
REDIS_URL=redis://:PASSWORD@localhost:6379
CLICKHOUSE_URL=http://wss_user:PASSWORD@localhost:8123

# Auth
JWT_SECRET=your-64-char-secret
API_SECRET=your-api-key-secret

# External APIs (optional)
FINNHUB_API_KEY=
ALPACA_API_KEY=
ALPACA_SECRET=
OPENAI_API_KEY=

# Server
NODE_ENV=development
PORT=3000
API_PORT=8080
```

## Database Quick Reference

### Connect to PostgreSQL
```bash
psql -h localhost -U wss_user -d wallstreetsim
# Or via Docker
docker exec -it wss_postgres psql -U wss_user -d wallstreetsim
```

### Connect to Redis
```bash
redis-cli -a YOUR_PASSWORD
# Or via Docker
docker exec -it wss_redis redis-cli -a YOUR_PASSWORD
```

### Drizzle Commands
```bash
cd packages/db
pnpm db:generate   # Generate migration from schema changes
pnpm db:migrate    # Apply migrations
pnpm db:push       # Push schema directly (dev only)
pnpm db:studio     # Open visual editor
```

---

## Skills (skills.sh)

```bash
# Core skills
npx skills add anthropics/skills/frontend-design
npx skills add vercel-labs/agent-skills/vercel-react-best-practices
npx skills add vercel-labs/agent-skills/web-design-guidelines

# Database
npx skills add supabase/agent-skills/supabase-postgres-best-practices

# Testing & Quality
npx skills add obra/superpowers/test-driven-development
npx skills add obra/superpowers/systematic-debugging

# Architecture
npx skills add wshobson/agents/architecture-patterns
npx skills add wshobson/agents/nextjs-app-router-patterns
npx skills add wshobson/agents/api-design-principles

# Workflow
npx skills add obra/superpowers/writing-plans
npx skills add obra/superpowers/executing-plans
```

---

## Ralphy (Autonomous Loop)

**IMPORTANT: Claude does NOT start Ralphy loops.**

### Claude's Role
When asked about autonomous tasks:
1. Create/update `PRD.md` with task breakdown
2. Suggest appropriate Ralphy command
3. User executes command themselves

### Model Selection

**Opus 4.5** (complex reasoning):
```bash
ralphy --prd PRD.md
ralphy "implement the tick engine price calculation"
```

**Sonnet 4.5** (bulk/simple, 1M context):
```bash
ralphy --sonnet --prd PRD.md
ralphy --sonnet "add JSDoc to all exported functions"
```

### PRD.md Format
```markdown
## Tasks
- [ ] set up database schema with Drizzle
- [ ] create agent registration API endpoint
- [ ] implement WebSocket connection handler
- [ ] build StockTicker component
- [x] completed task (skipped)
```

### Useful Commands
```bash
# Single task
ralphy "add the order book matching engine"

# PRD mode
ralphy --prd PRD.md

# Parallel (multiple agents)
ralphy --parallel --max-parallel 3

# Branch per task with PRs
ralphy --branch-per-task --create-pr

# Skip tests (faster iteration)
ralphy --fast "quick fix"
```

---

## Task Categorization

### Autonomous (Ralphy)
**Sonnet** (bulk, mechanical):
- Add TypeScript types to all files
- Add JSDoc comments
- Fix lint errors
- Bulk rename/refactor
- Generate test stubs

**Opus** (complex, reasoning):
- Implement tick engine logic
- Build market matching engine
- Create SEC fraud detection
- Complex debugging
- API design

### Interactive (Claude directly)
- UI/UX decisions
- Architecture planning
- Security implementation
- Real-time debugging
- Design system work

---

## Links

- Repo: `/WallStreetSim` (local VPS)
- Docs: `./docs/`
- Concept: See `AI_Agent_Wall_Street_Concept.md`
- Tech Stack: See `WallStreetSim_Tech_Stack.md`
- UI Design: See `WallStreetSim_Terminal_UI.md`

---

## VPS-Specific Notes

### Server Details
- Provider: Hetzner
- OS: Ubuntu 24.04
- Location: `/WallStreetSim`

### Service Management
```bash
# Databases (Docker)
docker compose -f docker-compose.db.yml up -d
docker compose -f docker-compose.db.yml down
docker ps  # Check status

# Application (PM2)
pm2 start ecosystem.config.js
pm2 restart all
pm2 logs
pm2 monit

# Nginx (reverse proxy)
sudo nginx -t              # Test config
sudo systemctl reload nginx
sudo certbot renew         # Renew SSL
```

### Firewall
```bash
sudo ufw status
sudo ufw allow 3000/tcp   # Dev frontend
sudo ufw allow 8080/tcp   # Dev API
```

### Logs
```bash
# Application logs
pm2 logs wss-web
pm2 logs wss-api
pm2 logs wss-engine

# Database logs
docker logs wss_postgres
docker logs wss_redis

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Backup
```bash
# PostgreSQL backup
docker exec wss_postgres pg_dump -U wss_user wallstreetsim > backup.sql

# Restore
cat backup.sql | docker exec -i wss_postgres psql -U wss_user -d wallstreetsim
```
