# deploy/

| Path | What it is |
|---|---|
| `kubernetes/` | Kustomize example: namespace, config, PVC, deployment, service, ingress, weekly CronJob. Placeholders inside — read before applying. |
| `create-secret-k3s.sh` | Creates the `signal-secrets` Secret from environment variables, so it never lands in Git. |
| `install.sh` | Installs the app on a Debian box under systemd, with a weekly timer. |
| `signal.service`, `signal-pipeline.{service,timer}` | The units that script installs. |

Docker is the shortest path and lives in [`docker-compose.yml`](../docker-compose.yml)
at the repository root.

Full guide, including why you should not let Argo CD sync a public repository
into your cluster: **[docs/deploying.md](../docs/deploying.md)**.
