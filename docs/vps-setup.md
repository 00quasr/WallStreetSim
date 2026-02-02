# 🖥️ WallStreetSim — VPS Setup Checklist

## Quick Reference

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| **RAM** | 2 GB | 4+ GB |
| **Storage** | 20 GB | 50+ GB SSD |
| **CPU** | 1 vCPU | 2+ vCPU |

---

## 📋 Setup Checklist

### Phase 1: System Basics

- [ ] **Update system**
```bash
sudo apt update && sudo apt upgrade -y
```

- [ ] **Install essential tools**
```bash
sudo apt install -y git curl wget jq htop tmux unzip
```

- [ ] **Install build essentials**
```bash
sudo apt install -y build-essential python3 python3-pip
```

---

### Phase 2: Node.js & Package Managers

- [ ] **Install Node.js 20+**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should show v20.x.x
```

- [ ] **Install pnpm**
```bash
npm install -g pnpm
pnpm --version
```

- [ ] **Install Bun (optional, faster)**
```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

---

### Phase 3: Docker Installation

> ⚠️ **Use official Docker repo** — Ubuntu mirrors often have issues

- [ ] **Remove old Docker versions**
```bash
sudo apt remove -y docker.io containerd runc 2>/dev/null || true
```

- [ ] **Install prerequisites**
```bash
sudo apt install -y ca-certificates curl gnupg
```

- [ ] **Add Docker GPG key**
```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

- [ ] **Add Docker repository**
```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

- [ ] **Install Docker**
```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

- [ ] **Configure Docker for non-root user**
```bash
sudo usermod -aG docker $USER
newgrp docker  # Or log out and back in
```

- [ ] **Start Docker & enable on boot**
```bash
sudo systemctl enable docker
sudo systemctl start docker
```

- [ ] **Verify Docker works**
```bash
docker run hello-world
docker compose version
```

---

### Phase 4: Database Clients

- [ ] **PostgreSQL client**
```bash
sudo apt install -y postgresql-client
psql --version
```

- [ ] **Redis CLI**
```bash
sudo apt install -y redis-tools
redis-cli --version
```

---

### Phase 5: Project Directory Setup

- [ ] **Create project directory**
```bash
mkdir -p ~/wallstreetsim
cd ~/wallstreetsim
```

- [ ] **Initialize Git**
```bash
git init
```

- [ ] **Create .gitignore**
```bash
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
dist/
.next/
.turbo/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
npm-debug.log*

# Docker volumes (if local)
postgres_data/
redis_data/
clickhouse_data/
EOF
```

---

### Phase 6: Docker Compose for Databases

- [ ] **Create docker-compose.db.yml**
```bash
cat > docker-compose.db.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: wss_postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: wallstreetsim
      POSTGRES_USER: wss_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-SuperSecure123!}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wss_user -d wallstreetsim"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: wss_redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-RedisSecure123!}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD:-RedisSecure123!}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  clickhouse:
    image: clickhouse/clickhouse-server:latest
    container_name: wss_clickhouse
    restart: unless-stopped
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    environment:
      CLICKHOUSE_DB: wallstreetsim
      CLICKHOUSE_USER: wss_user
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:-ClickSecure123!}
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

volumes:
  postgres_data:
  redis_data:
  clickhouse_data:
EOF
```

- [ ] **Start databases**
```bash
docker compose -f docker-compose.db.yml up -d
```

- [ ] **Verify databases are running**
```bash
docker ps

# Should show:
# wss_postgres   running   0.0.0.0:5432->5432/tcp
# wss_redis      running   0.0.0.0:6379->6379/tcp
# wss_clickhouse running   0.0.0.0:8123->8123/tcp
```

- [ ] **Test PostgreSQL connection**
```bash
psql -h localhost -U wss_user -d wallstreetsim -c "SELECT version();"
# Enter password: SuperSecure123!
```

- [ ] **Test Redis connection**
```bash
redis-cli -a RedisSecure123! ping
# Should return: PONG
```

---

### Phase 7: Environment Variables

- [ ] **Create .env file**
```bash
cat > .env << 'EOF'
# ===========================================
# WallStreetSim Environment Configuration
# ===========================================

# ----------------- Database -----------------
POSTGRES_PASSWORD=SuperSecure123!
POSTGRES_USER=wss_user
POSTGRES_DB=wallstreetsim
DATABASE_URL=postgresql://wss_user:SuperSecure123!@localhost:5432/wallstreetsim

# ----------------- Redis -----------------
REDIS_PASSWORD=RedisSecure123!
REDIS_URL=redis://:RedisSecure123!@localhost:6379

# ----------------- ClickHouse -----------------
CLICKHOUSE_PASSWORD=ClickSecure123!
CLICKHOUSE_URL=http://wss_user:ClickSecure123!@localhost:8123

# ----------------- Auth & Security -----------------
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHAR_STRING_USE_openssl_rand_hex_32
API_SECRET=CHANGE_ME_TO_ANOTHER_RANDOM_STRING_FOR_AGENT_API_KEYS

# ----------------- External APIs (Optional) -----------------
# Get free API key from: https://finnhub.io/
FINNHUB_API_KEY=

# Get free API key from: https://alpaca.markets/
ALPACA_API_KEY=
ALPACA_SECRET=

# For AI news generation: https://platform.openai.com/
OPENAI_API_KEY=

# ----------------- Server -----------------
NODE_ENV=development
PORT=3000
API_PORT=8080
WS_PORT=8080

# ----------------- URLs -----------------
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
EOF
```

- [ ] **Generate secure secrets**
```bash
# Generate JWT_SECRET
echo "JWT_SECRET=$(openssl rand -hex 32)"

# Generate API_SECRET  
echo "API_SECRET=$(openssl rand -hex 32)"

# Update .env with these values!
```

- [ ] **Secure the .env file**
```bash
chmod 600 .env
```

---

### Phase 8: Project Structure

- [ ] **Create monorepo structure**
```bash
mkdir -p apps/web apps/api apps/engine packages/db packages/types packages/utils
```

- [ ] **Initialize pnpm workspace**
```bash
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF
```

- [ ] **Create root package.json**
```bash
cat > package.json << 'EOF'
{
  "name": "wallstreetsim",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "start": "turbo start",
    "lint": "turbo lint",
    "clean": "turbo clean && rm -rf node_modules",
    "db:migrate": "pnpm --filter @wallstreetsim/db migrate",
    "db:push": "pnpm --filter @wallstreetsim/db push",
    "db:studio": "pnpm --filter @wallstreetsim/db studio",
    "db:seed": "pnpm --filter @wallstreetsim/db seed"
  },
  "devDependencies": {
    "turbo": "^2.0.0",
    "typescript": "^5.4.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF
```

- [ ] **Create turbo.json**
```bash
cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "globalEnv": [
    "NODE_ENV",
    "DATABASE_URL",
    "REDIS_URL"
  ],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "build/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "start": {
      "dependsOn": ["build"]
    },
    "lint": {
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
EOF
```

- [ ] **Install dependencies**
```bash
pnpm install
```

---

### Phase 9: Process Manager (PM2)

- [ ] **Install PM2**
```bash
npm install -g pm2
```

- [ ] **Create ecosystem config**
```bash
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'wss-web',
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'wss-api',
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'wss-engine',
      cwd: './apps/engine',
      script: 'pnpm',
      args: 'start',
      env: {
        NODE_ENV: 'production'
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
EOF
```

- [ ] **Setup PM2 startup script**
```bash
pm2 startup
# Follow the instructions it prints
```

---

### Phase 10: Nginx Reverse Proxy (Production)

- [ ] **Install Nginx**
```bash
sudo apt install -y nginx
```

- [ ] **Create site config**
```bash
sudo cat > /etc/nginx/sites-available/wallstreetsim << 'EOF'
upstream web {
    server 127.0.0.1:3000;
}

upstream api {
    server 127.0.0.1:8080;
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Frontend
    location / {
        proxy_pass http://web;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket
    location /ws {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
EOF
```

- [ ] **Enable site**
```bash
sudo ln -s /etc/nginx/sites-available/wallstreetsim /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default  # Remove default site
sudo nginx -t  # Test config
sudo systemctl reload nginx
```

- [ ] **Install SSL certificate (Certbot)**
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

- [ ] **Configure SSL auto-renewal cron job**
```bash
# Create renewal hook to reload nginx after certificate renewal
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null << 'EOF'
#!/bin/bash
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Create cron job for auto-renewal (runs twice daily)
sudo tee /etc/cron.d/certbot-renew > /dev/null << 'EOF'
# Certbot auto-renewal - runs twice daily
0 */12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'
EOF
sudo chmod 644 /etc/cron.d/certbot-renew

# Alternatively, enable the systemd timer (preferred on modern Ubuntu)
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

- [ ] **Verify auto-renewal is configured**
```bash
# Test the renewal process (dry run)
sudo certbot renew --dry-run

# Check cron job exists
cat /etc/cron.d/certbot-renew

# Check systemd timer status
systemctl status certbot.timer
```

---

### Phase 11: Firewall Setup

- [ ] **Configure UFW firewall**
```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

---

### Phase 12: MCP Servers (For AI Agent Development)

- [ ] **Install MCP servers**
```bash
npm install -g @anthropic/mcp-server-filesystem
npm install -g @anthropic/mcp-server-git
```

- [ ] **Create Claude Desktop config** (on your local machine)

Create/edit `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "wallstreetsim-fs": {
      "command": "ssh",
      "args": ["-t", "your-vps-user@your-vps-ip", "mcp-server-filesystem", "/home/your-user/wallstreetsim"]
    },
    "wallstreetsim-git": {
      "command": "ssh", 
      "args": ["-t", "your-vps-user@your-vps-ip", "mcp-server-git", "--repository", "/home/your-user/wallstreetsim"]
    }
  }
}
```

---

## 🔍 Verification Commands

Run these to verify everything is working:

```bash
# System
echo "=== System ===" && uname -a

# Node
echo "=== Node ===" && node --version && pnpm --version

# Docker
echo "=== Docker ===" && docker --version && docker compose version

# Containers
echo "=== Containers ===" && docker ps

# PostgreSQL
echo "=== PostgreSQL ===" && psql -h localhost -U wss_user -d wallstreetsim -c "SELECT 'Connected!' as status;" 2>/dev/null || echo "Not connected"

# Redis
echo "=== Redis ===" && redis-cli -a RedisSecure123! ping 2>/dev/null || echo "Not connected"

# PM2
echo "=== PM2 ===" && pm2 --version

# Nginx
echo "=== Nginx ===" && nginx -v

# Disk space
echo "=== Disk ===" && df -h /
```

---

## 📁 Final Directory Structure

```
~/wallstreetsim/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # Fastify/Hono API
│   └── engine/           # Tick simulation engine
├── packages/
│   ├── db/               # Drizzle ORM schemas
│   ├── types/            # Shared TypeScript types
│   └── utils/            # Shared utilities
├── docker-compose.db.yml # Database containers
├── ecosystem.config.js   # PM2 config
├── turbo.json           # Turborepo config
├── pnpm-workspace.yaml  # pnpm workspace
├── package.json         # Root package.json
├── .env                 # Environment variables
└── .gitignore           # Git ignore rules
```

---

## 🚨 Troubleshooting

### Docker permission denied
```bash
sudo chmod 666 /var/run/docker.sock
# Or log out and back in after usermod
```

### PostgreSQL connection refused
```bash
# Check if container is running
docker ps | grep postgres

# Check logs
docker logs wss_postgres

# Restart container
docker restart wss_postgres
```

### Port already in use
```bash
# Find what's using the port
sudo lsof -i :5432
sudo lsof -i :6379

# Kill the process
sudo kill -9 <PID>
```

### Redis AUTH failed
```bash
# Connect without password first
docker exec -it wss_redis redis-cli

# Then AUTH
AUTH RedisSecure123!
```

---

## ✅ Ready to Build!

Once all checkboxes are complete, your VPS is ready for WallStreetSim development.

**Next steps:**
1. Start building the database schema (`packages/db`)
2. Create the API endpoints (`apps/api`)
3. Build the frontend (`apps/web`)
4. Implement the tick engine (`apps/engine`)

---

*Last updated: February 2026*
