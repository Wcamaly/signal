#!/usr/bin/env bash
# Crea o actualiza el Secret que Argo no debe recibir desde Git.

set -euo pipefail

NAMESPACE="${NAMESPACE:-signal}"
KUBECTL="${KUBECTL:-kubectl}"

command -v "$KUBECTL" >/dev/null || { echo "No encuentro kubectl" >&2; exit 1; }
[ -n "${CRON_SECRET:-}" ] || { echo "Definí CRON_SECRET" >&2; exit 1; }

"$KUBECTL" -n "$NAMESPACE" create secret generic signal-secrets \
  --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  --from-literal=ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-sonnet-4-5}" \
  --from-literal=CRON_SECRET="$CRON_SECRET" \
  --dry-run=client -o yaml | "$KUBECTL" apply -f -