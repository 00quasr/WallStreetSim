#!/bin/bash
# =============================================================================
# WallStreetSim VPS Setup Script
# Ubuntu 22.04/24.04 LTS
# =============================================================================

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         WALLSTREETSIM - VPS DEVELOPMENT SETUP                 ║"
echo "╚═══════════════════════════════════════════════════════════════╝"

# -----------------------------------------------------------------------------
# 1. System Update & Basic Tools
# -----------------------------------------------------------------------------
echo "[1/10] Updating system..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
    curl \
    wget \
    git \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    unzip \
    jq \
    htop \
    tmux \
    vim \
    nano

# -----------------------------------------------------------------------------
# 2. Create dev user (if running as root)
# -----------------------------------------------------------------------------
echo "[2/10] Setting up dev user..."
if [ "$USER" = "root" ]; then
    if ! id "dev" &>/dev/null; then
        useradd -m -s /bin/bash dev
        usermod -aG sudo dev
        echo "dev ALL=(ALL) NOPASSWD:ALL" | sudo tee /etc/sudoers.d/dev
        echo "Created 'dev' user. Set password with: passwd dev"
    fi
fi

# -----------------------------------------------------------------------------
# 3. Install Node.js (v22 LTS via nvm)
# -----------------------------------------------------------------------------
echo "[3/10] Installing Node.js..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 22
nvm use 22
nvm alias default 22

# Verify
node --version
npm --version

# -----------------------------------------------------------------------------
# 4. Install pnpm
# -----------------------------------------------------------------------------
echo "[4/10] Installing pnpm..."
npm install -g pnpm
pnpm --version

# -----------------------------------------------------------------------------
# 5. Install Docker & Docker Compose
# -----------------------------------------------------------------------------
echo "[5/10] Installing Docker..."
# Remove old versions
sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
sudo usermod -aG docker dev 2>/dev/null || true

# Start Docker
sudo systemctl enable docker
sudo systemctl start docker

# Verify
docker --version
docker compose version

# -----------------------------------------------------------------------------
# 6. Install PM2 (Process Manager)
# -----------------------------------------------------------------------------
echo "[6/10] Installing PM2..."
npm install -g pm2
pm2 --version

# -----------------------------------------------------------------------------
# 7. Install GitHub CLI
# -----------------------------------------------------------------------------
echo "[7/10] Installing GitHub CLI..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install -y gh

# -----------------------------------------------------------------------------
# 8. Install Claude Code CLI
# -----------------------------------------------------------------------------
echo "[8/10] Installing Claude Code..."
npm install -g @anthropic-ai/claude-code

# -----------------------------------------------------------------------------
# 9. Install Ralphy (Autonomous Agent Loop)
# -----------------------------------------------------------------------------
echo "[9/10] Installing Ralphy..."
npm install -g ralphy

# -----------------------------------------------------------------------------
# 10. Install additional dev tools
# -----------------------------------------------------------------------------
echo "[10/10] Installing additional tools..."

# Playwright browsers (for agent-browser)
npx playwright install --with-deps chromium

# Turbo (monorepo build system)
npm install -g turbo

# TypeScript
npm install -g typescript tsx

# -----------------------------------------------------------------------------
# Firewall Setup (optional)
# -----------------------------------------------------------------------------
echo "Setting up firewall..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 3000/tcp  # Next.js dev
sudo ufw allow 8080/tcp  # API dev
sudo ufw --force enable

# -----------------------------------------------------------------------------
# SSL Certificate Auto-Renewal (Certbot)
# -----------------------------------------------------------------------------
echo "Configuring SSL certificate auto-renewal..."

# Install certbot if not already installed
if ! command -v certbot &> /dev/null; then
    sudo apt install -y certbot python3-certbot-nginx
fi

# Create certbot renewal hook to reload nginx after certificate renewal
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh > /dev/null << 'EOF'
#!/bin/bash
# Reload nginx after certificate renewal
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Set up cron job for automatic certificate renewal
# Runs twice daily at random minute (recommended by Let's Encrypt)
CRON_JOB="0 */12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'"
CRON_FILE="/etc/cron.d/certbot-renew"

# Only add if not already present
if [ ! -f "$CRON_FILE" ]; then
    echo "# Certbot auto-renewal - runs twice daily" | sudo tee "$CRON_FILE" > /dev/null
    echo "$CRON_JOB" | sudo tee -a "$CRON_FILE" > /dev/null
    sudo chmod 644 "$CRON_FILE"
    echo "Certbot auto-renewal cron job configured"
else
    echo "Certbot cron job already exists at $CRON_FILE"
fi

# Enable and start the certbot timer (systemd alternative)
if systemctl list-unit-files | grep -q certbot.timer; then
    sudo systemctl enable certbot.timer
    sudo systemctl start certbot.timer
    echo "Certbot systemd timer enabled"
fi

# -----------------------------------------------------------------------------
# Print Summary
# -----------------------------------------------------------------------------
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    SETUP COMPLETE!                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "Installed:"
echo "  • Node.js $(node --version)"
echo "  • pnpm $(pnpm --version)"
echo "  • Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo "  • PM2 $(pm2 --version)"
echo "  • GitHub CLI $(gh --version | head -1)"
echo "  • Claude Code CLI"
echo "  • Ralphy"
echo "  • Turbo, TypeScript, tsx"
echo "  • Playwright (Chromium)"
echo ""
echo "Next steps:"
echo "  1. Log out and back in (for docker group)"
echo "  2. Run: gh auth login"
echo "  3. Run: claude  (to authenticate Claude Code)"
echo "  4. Clone your repo: git clone https://github.com/00quasr/WallStreetSim"
echo "  5. cd WallStreetSim && pnpm install"
echo "  6. Copy .env.example to .env and configure"
echo "  7. docker compose -f docker-compose.db.yml up -d"
echo "  8. pnpm db:push && pnpm db:seed"
echo "  9. pnpm dev"
echo ""
