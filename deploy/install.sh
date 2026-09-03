#!/usr/bin/env bash
# Installs Signal inside a Debian container (Proxmox LXC). As root.
#
#   bash deploy/install.sh
#
# Idempotent: run it again to update the app.

set -euo pipefail

APP_DIR="/opt/signal"
APP_USER="signal"
ENV_FILE="/etc/signal.env"
NODE_MAJOR="22"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run it as root."
[ -f "$SRC_DIR/package.json" ] || die "No package.json in $SRC_DIR"

# ---- system dependencies ----------------------------------------------------
say "Installing base packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git build-essential python3 rsync

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  say "Installing Node.js ${NODE_MAJOR}…"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
say "Node $(node -v)"

# ---- timezone ---------------------------------------------------------------
# The weekly timer uses the container local time, which defaults to UTC.
if [ -n "${TZ:-}" ]; then
  say "Timezone: $TZ"
  timedatectl set-timezone "$TZ" 2>/dev/null || ln -sf "/usr/share/zoneinfo/$TZ" /etc/localtime
else
  say "Current timezone: $(cat /etc/timezone 2>/dev/null || date +%Z). To change it: TZ=Europe/Madrid bash deploy/install.sh"
fi

# ---- user and files ---------------------------------------------------------
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"

say "Copying the app to $APP_DIR…"
rsync -a --delete \
  --exclude 'node_modules' --exclude '.next' --exclude 'data' \
  --exclude '.git' --exclude '.env.local' \
  "$SRC_DIR"/ "$APP_DIR"/
mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---- configuration ----------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  say "Creating $ENV_FILE"
  CRON_SECRET="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  SECRET_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 43)"
  cat > "$ENV_FILE" <<EOF
# Optional: an LLM key can also be pasted in the UI (Settings -> Model & keys).
ANTHROPIC_API_KEY=
# Pins the key used to encrypt credentials stored from the UI. Keep it safe.
SIGNAL_SECRET_KEY=${SECRET_KEY}
CRON_SECRET=${CRON_SECRET}
NODE_ENV=production
PORT=3000
EOF
  chmod 600 "$ENV_FILE"
fi

# ---- build ------------------------------------------------------------------
say "Installing dependencies (compiles better-sqlite3, takes 1-2 min)…"
cd "$APP_DIR"
npm ci --no-audit --no-fund

say "Building…"
npm run build

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---- systemd ----------------------------------------------------------------
say "Installing systemd units…"
install -m 644 "$APP_DIR/deploy/signal.service"        /etc/systemd/system/signal.service
install -m 644 "$APP_DIR/deploy/signal-pipeline.service" /etc/systemd/system/signal-pipeline.service
install -m 644 "$APP_DIR/deploy/signal-pipeline.timer"   /etc/systemd/system/signal-pipeline.timer

systemctl daemon-reload
systemctl enable --now signal.service
systemctl enable --now signal-pipeline.timer

sleep 3
systemctl is-active --quiet signal.service || {
  journalctl -u signal.service -n 30 --no-pager
  die "The service did not start — check the log above."
}

IP=$(hostname -I | awk '{print $1}')
PORT_USED=$(grep -oP '^PORT=\K.*' "$ENV_FILE" || echo 3000)

if ! grep -qE '^ANTHROPIC_API_KEY=.+' "$ENV_FILE"; then
  KEY_WARN="ℹ  No LLM key yet: add one in the UI under Model & keys, or edit $ENV_FILE and run  systemctl restart signal"
else
  KEY_WARN=""
fi

cat <<EOF

  Signal is running at  http://${IP}:${PORT_USED}

  ${KEY_WARN}

  Commands:
    systemctl status signal             status
    journalctl -u signal -f             live logs
    systemctl list-timers 'signal-*'    when the pipeline runs
    systemctl start signal-pipeline     run it now, by hand

  Remote access without exposing anything to the internet:
    curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --ssh
  (the container already has /dev/net/tun enabled from create-lxc.sh)

  To update the app later: copy the new code and run this script again.

EOF
