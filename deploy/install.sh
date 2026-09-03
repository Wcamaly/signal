#!/usr/bin/env bash
# Instala Signal dentro de un contenedor Debian (LXC de Proxmox). Como root.
#
#   bash deploy/install.sh
#
# Idempotente: se puede volver a correr para actualizar la app.

set -euo pipefail

APP_DIR="/opt/signal"
APP_USER="signal"
ENV_FILE="/etc/signal.env"
NODE_MAJOR="22"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Corrélo como root."
[ -f "$SRC_DIR/package.json" ] || die "No encuentro package.json en $SRC_DIR"

# ---- dependencias del sistema ----------------------------------------------
say "Instalando paquetes base…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git build-essential python3 rsync

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt "$NODE_MAJOR" ]; then
  say "Instalando Node.js ${NODE_MAJOR}…"
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg --yes
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi
say "Node $(node -v)"

# ---- zona horaria -----------------------------------------------------------
# El timer semanal usa la hora local del contenedor, que por defecto es UTC.
if [ -n "${TZ:-}" ]; then
  say "Zona horaria: $TZ"
  timedatectl set-timezone "$TZ" 2>/dev/null || ln -sf "/usr/share/zoneinfo/$TZ" /etc/localtime
else
  say "Zona horaria actual: $(cat /etc/timezone 2>/dev/null || date +%Z). Para cambiarla: TZ=America/Argentina/Buenos_Aires bash deploy/install.sh"
fi

# ---- usuario y archivos -----------------------------------------------------
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"

say "Copiando la app a $APP_DIR…"
rsync -a --delete \
  --exclude 'node_modules' --exclude '.next' --exclude 'data' \
  --exclude '.git' --exclude '.env.local' \
  "$SRC_DIR"/ "$APP_DIR"/
mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---- configuración ----------------------------------------------------------
if [ ! -f "$ENV_FILE" ]; then
  say "Creando $ENV_FILE"
  CRON_SECRET="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 32)"
  cat > "$ENV_FILE" <<EOF
# Pegá tu clave de la API de Claude acá y reiniciá:  systemctl restart signal
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
CRON_SECRET=${CRON_SECRET}
NODE_ENV=production
PORT=3000
EOF
  chmod 600 "$ENV_FILE"
fi

# ---- build ------------------------------------------------------------------
say "Instalando dependencias (compila better-sqlite3, tarda 1-2 min)…"
cd "$APP_DIR"
npm ci --no-audit --no-fund

say "Construyendo…"
npm run build

chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ---- systemd ----------------------------------------------------------------
say "Instalando unidades systemd…"
install -m 644 "$APP_DIR/deploy/signal.service"        /etc/systemd/system/signal.service
install -m 644 "$APP_DIR/deploy/signal-pipeline.service" /etc/systemd/system/signal-pipeline.service
install -m 644 "$APP_DIR/deploy/signal-pipeline.timer"   /etc/systemd/system/signal-pipeline.timer

systemctl daemon-reload
systemctl enable --now signal.service
systemctl enable --now signal-pipeline.timer

sleep 3
systemctl is-active --quiet signal.service || {
  journalctl -u signal.service -n 30 --no-pager
  die "El servicio no arrancó — mirá el log de arriba."
}

IP=$(hostname -I | awk '{print $1}')
PORT_USED=$(grep -oP '^PORT=\K.*' "$ENV_FILE" || echo 3000)

if ! grep -qE '^ANTHROPIC_API_KEY=.+' "$ENV_FILE"; then
  KEY_WARN="⚠  Falta la API key: editá $ENV_FILE y corré  systemctl restart signal"
else
  KEY_WARN=""
fi

cat <<EOF

  Signal andando en  http://${IP}:${PORT_USED}

  ${KEY_WARN}

  Comandos:
    systemctl status signal             estado
    journalctl -u signal -f             logs en vivo
    systemctl list-timers 'signal-*'    cuándo corre el pipeline
    systemctl start signal-pipeline     correrlo ahora a mano

  Acceso remoto sin exponer nada a internet:
    curl -fsSL https://tailscale.com/install.sh | sh
    tailscale up --ssh
  (el contenedor ya tiene /dev/net/tun habilitado desde create-lxc.sh)

  Para actualizar la app más adelante: copiá el código nuevo y volvé a correr este script.

EOF
