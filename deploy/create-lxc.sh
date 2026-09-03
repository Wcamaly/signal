#!/usr/bin/env bash
# Creates the LXC container for Signal. RUN IT ON THE PROXMOX HOST, as root.
#
#   ./create-lxc.sh                      # uses the values below
#   CTID=140 STORAGE=local-zfs ./create-lxc.sh
#
# It touches nothing existing: if the CTID is already in use, it aborts.

set -euo pipefail

CTID="${CTID:-140}"
HOSTNAME="${HOSTNAME_CT:-signal}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
DISK="${DISK:-8}"          # GB
CORES="${CORES:-2}"
MEMORY="${MEMORY:-2048}"   # MB — the Next build needs ~1.5 GB; afterwards it drops to ~250 MB
BRIDGE="${BRIDGE:-vmbr0}"
IPCONFIG="${IPCONFIG:-dhcp}"   # or "192.168.1.40/24,gw=192.168.1.1"

say() { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✖\033[0m %s\n' "$*" >&2; exit 1; }

command -v pct >/dev/null || die "Run this on the Proxmox host ('pct' not found)."
[ "$(id -u)" -eq 0 ] || die "Run it as root."
pct status "$CTID" >/dev/null 2>&1 && die "CTID $CTID is already in use. Pass another one: CTID=141 $0"

# ---- newest available Debian template ---------------------------------------
say "Looking for a Debian template…"
pveam update >/dev/null 2>&1 || true

TEMPLATE=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | awk '/debian-1[0-9]-standard/ {print $1}' | sort -V | tail -1 || true)

if [ -z "$TEMPLATE" ]; then
  AVAILABLE=$(pveam available --section system | awk '/debian-1[0-9]-standard/ {print $2}' | sort -V | tail -1)
  [ -n "$AVAILABLE" ] || die "No Debian template found in the catalogue."
  say "Downloading $AVAILABLE into $TEMPLATE_STORAGE (this takes a while)…"
  pveam download "$TEMPLATE_STORAGE" "$AVAILABLE"
  TEMPLATE="${TEMPLATE_STORAGE}:vztmpl/${AVAILABLE}"
fi
say "Template: $TEMPLATE"

# ---- create -----------------------------------------------------------------
say "Creating CT $CTID ($HOSTNAME) on $STORAGE…"
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
  --description "Signal — AI radar and publications"

# ---- /dev/net/tun for Tailscale in an unprivileged container ----------------
say "Enabling /dev/net/tun (Tailscale needs it)…"
CONF="/etc/pve/lxc/${CTID}.conf"
grep -q 'dev/net/tun' "$CONF" || cat >> "$CONF" <<'EOF'
lxc.cgroup2.devices.allow: c 10:200 rwm
lxc.mount.entry: /dev/net/tun dev/net/tun none bind,create=file
EOF

say "Starting…"
pct start "$CTID"
sleep 8

IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}' || echo "?")

cat <<EOF

  Container $CTID ready. IP: ${IP}

  Next step — copy the app and install it:

    # from the host, with signal.zip in the current directory
    pct push $CTID signal.zip /root/signal.zip
    pct exec $CTID -- bash -c 'apt-get update -qq && apt-get install -y -qq unzip && \\
      unzip -q -o /root/signal.zip -d /root && bash /root/signal/deploy/install.sh'

EOF
