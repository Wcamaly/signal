#!/usr/bin/env bash
# Crea el contenedor LXC para Signal. SE CORRE EN EL HOST PROXMOX, como root.
#
#   ./create-lxc.sh                      # usa los valores de abajo
#   CTID=140 STORAGE=local-zfs ./create-lxc.sh
#
# No toca nada existente: si el CTID ya está en uso, aborta.

set -euo pipefail

CTID="${CTID:-140}"
HOSTNAME="${HOSTNAME_CT:-signal}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
DISK="${DISK:-8}"          # GB
CORES="${CORES:-2}"
MEMORY="${MEMORY:-2048}"   # MB — el build de Next necesita ~1.5 GB; después baja a ~250 MB
BRIDGE="${BRIDGE:-vmbr0}"
IPCONFIG="${IPCONFIG:-dhcp}"   # o "192.168.1.40/24,gw=192.168.1.1"

say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

command -v pct >/dev/null || die "Esto se corre en el host Proxmox (no encuentro 'pct')."
[ "$(id -u)" -eq 0 ] || die "Corrélo como root."
pct status "$CTID" >/dev/null 2>&1 && die "El CTID $CTID ya está en uso. Pasá otro: CTID=141 $0"

# ---- template Debian más nueva disponible ----------------------------------
say "Buscando template de Debian…"
pveam update >/dev/null 2>&1 || true

TEMPLATE=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '/debian-1[0-9]-standard/ {print $1}' | sort -V | tail -1 || true)

if [ -z "$TEMPLATE" ]; then
  AVAILABLE=$(pveam available --section system | awk '/debian-1[0-9]-standard/ {print $2}' | sort -V | tail -1)
  [ -n "$AVAILABLE" ] || die "No encontré ninguna template de Debian en el catálogo."
  say "Descargando $AVAILABLE en $TEMPLATE_STORAGE (esto tarda un poco)…"
  pveam download "$TEMPLATE_STORAGE" "$AVAILABLE"
  TEMPLATE="${TEMPLATE_STORAGE}:vztmpl/${AVAILABLE}"
fi
say "Template: $TEMPLATE"

# ---- crear ------------------------------------------------------------------
say "Creando CT $CTID ($HOSTNAME) en $STORAGE…"
pct create "$CTID" "$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" \
  --memory "$MEMORY" \
  --swap 512 \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=${IPCONFIG},firewall=1" \
  --features nesting=1 \
  --unprivileged 1 \
  --onboot 1 \
  --description "Signal — radar de IA y publicaciones"

# ---- /dev/net/tun para Tailscale en contenedor unprivileged -----------------
say "Habilitando /dev/net/tun (lo necesita Tailscale)…"
CONF="/etc/pve/lxc/${CTID}.conf"
grep -q 'dev/net/tun' "$CONF" || cat >> "$CONF" <<'EOF'
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF

say "Arrancando…"
pct start "$CTID"
sleep 8

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "?")

cat <<EOF

  Contenedor $CTID listo. IP: ${IP}

  Siguiente paso — copiar la app e instalarla:

    # desde el host, con signal.zip en el directorio actual
    pct push $CTID signal.zip /root/signal.zip
    pct exec $CTID -- bash -c 'apt-get update -qq && apt-get install -y -qq unzip && \\
      unzip -q -o /root/signal.zip -d /root && bash /root/signal/deploy/install.sh'

EOF
