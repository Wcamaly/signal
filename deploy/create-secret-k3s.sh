#!/usr/bin/env bash
# Creates or updates the Secret that Argo must not receive from Git.

set -euo pipefail

NAMESPACE="${NAMESPACE:-signal}"
KUBECTL="${KUBECTL:-kubectl}"

command -v "$KUBECTL" >/dev/null || { echo "kubectl not found" >&2; exit 1; }
[ -n "${CRON_SECRET:-}" ] || { echo "Set CRON_SECRET" >&2; exit 1; }
[ -n "${SIGNAL_SECRET_KEY:-}" ] || { echo "Set SIGNAL_SECRET_KEY (encrypts credentials stored from the UI)" >&2; exit 1; }

"$KUBECTL" -n "$NAMESPACE" create secret generic signal-secrets \
  --from-literal=ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
  --from-literal=SIGNAL_SECRET_KEY="$SIGNAL_SECRET_KEY" \
  --from-literal=CRON_SECRET="$CRON_SECRET" \
  --dry-run=client -o yaml | "$KUBECTL" apply -f -