#!/usr/bin/env bash
# Builds signal:local and imports it into the containerd of the k3s node through kubectl.

set -euo pipefail

NAMESPACE="${NAMESPACE:-signal}"
IMAGE="${IMAGE:-signal:local}"
KUBECTL="${KUBECTL:-kubectl}"
POD="signal-image-loader"
TAR_FILE="${TMPDIR:-/tmp}/signal-image.tar"

command -v docker >/dev/null || { echo "docker not found" >&2; exit 1; }
command -v "$KUBECTL" >/dev/null || { echo "kubectl not found" >&2; exit 1; }

echo "Building $IMAGE…"
docker build -t "$IMAGE" .
docker save "$IMAGE" -o "$TAR_FILE"

cleanup() {
  "$KUBECTL" -n "$NAMESPACE" delete pod "$POD" --ignore-not-found --wait=false >/dev/null 2>&1 || true
  rm -f "$TAR_FILE"
}
trap cleanup EXIT

"$KUBECTL" -n "$NAMESPACE" delete pod "$POD" --ignore-not-found --wait=true >/dev/null
"$KUBECTL" -n "$NAMESPACE" run "$POD" \
  --image=alpine:3.22 \
  --restart=Never \
  --overrides='{"spec":{"nodeName":"k3s-master","hostPID":true,"hostNetwork":true,"containers":[{"name":"loader","image":"alpine:3.22","command":["sleep","3600"],"securityContext":{"privileged":true},"volumeMounts":[{"name":"host-root","mountPath":"/host"}]}],"volumes":[{"name":"host-root","hostPath":{"path":"/"}}]}}' \
  --image-pull-policy=IfNotPresent >/dev/null

"$KUBECTL" -n "$NAMESPACE" wait --for=condition=Ready pod/$POD --timeout=120s >/dev/null
"$KUBECTL" -n "$NAMESPACE" cp "$TAR_FILE" "$POD:/host/tmp/signal-image.tar"
"$KUBECTL" -n "$NAMESPACE" exec "$POD" -- /bin/sh -c \
  'chroot /host /usr/local/bin/k3s ctr -n k8s.io images import /tmp/signal-image.tar'

echo "Image $IMAGE imported into k3s. Restarting Signal…"
"$KUBECTL" -n "$NAMESPACE" rollout restart deployment/signal
"$KUBECTL" -n "$NAMESPACE" rollout status deployment/signal --timeout=180s