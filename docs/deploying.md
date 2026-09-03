# Deploying Signal

Three supported shapes: Docker, a Debian box with systemd, and Kubernetes.
All three keep the same rule in mind — **Signal has no authentication of its
own**, so it belongs on localhost, on a private network, or behind something
that authenticates for it.

---

## Docker

```bash
cp .env.example .env      # optional; the model and its key can be set in the UI
docker compose up -d      # http://localhost:3000
```

The compose file binds to `127.0.0.1` on purpose. To reach it from another
machine, put a reverse proxy with authentication in front of it, or use a VPN,
rather than changing the binding to `0.0.0.0`.

Weekly runs, if you want them inside compose:

```bash
docker compose --profile cron up -d
```

That starts a small companion container whose only job is one `curl` a week
against `/api/cron`. Set `CRON_SECRET` in `.env` first, or anything that can
reach the port can trigger a run. An external scheduler — a host crontab, a
systemd timer, an n8n node — works just as well:

```bash
0 8 * * 1 curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

State lives in the `signal-data` volume: the SQLite database and, unless you set
`SIGNAL_SECRET_KEY`, the generated key that encrypts the credentials you saved
in the UI. Back the volume up.

---

## Debian with systemd

`deploy/install.sh` installs the app under `/opt/signal` as a system user, with
a service and a weekly timer. Run it as root inside the target machine or
container:

```bash
bash deploy/install.sh
```

It is idempotent — run it again after copying new code to update. It writes
`/etc/signal.env` with a generated `CRON_SECRET` and `SIGNAL_SECRET_KEY` the
first time, and leaves them alone afterwards.

```bash
systemctl status signal              # state
journalctl -u signal -f              # live logs
systemctl list-timers 'signal-*'     # when the pipeline runs
systemctl start signal-pipeline      # run it now
```

---

## Kubernetes

`deploy/kubernetes/` is a working Kustomize example: namespace, config, PVC,
deployment, service, ingress and the weekly CronJob. Read it before applying it
— the ingress host, the ingress class and the timezone are placeholders.

```bash
# 1. Namespace
kubectl apply -f deploy/kubernetes/namespace.yaml

# 2. Secret, kept out of Git
export CRON_SECRET="a-long-secret"
export SIGNAL_SECRET_KEY="another-long-secret"
export ANTHROPIC_API_KEY="sk-ant-..."        # optional, can be pasted in the UI
bash deploy/create-secret-k3s.sh

# 3. Everything else
kubectl apply -k deploy/kubernetes
kubectl -n signal rollout status deployment/signal
```

The image is not published to a registry. Build it and make it available to the
cluster the way your cluster expects — push it to your own registry and set it
in `kustomization.yaml`, or import it into the node's container runtime for a
single-node setup.

Two constraints that are not decoration:

- **One replica, `Recreate` strategy.** SQLite on a ReadWriteOnce volume; two
  pods writing that file is data loss, and a rolling update briefly runs two.
- **The PVC is the whole state.** Digests, posts, prompts, and the encrypted
  credentials. Snapshot it or back it up.

```bash
kubectl -n signal get pods,pvc,cronjobs
kubectl -n signal logs deploy/signal
kubectl -n signal create job --from=cronjob/signal-pipeline signal-pipeline-manual
kubectl -n signal port-forward svc/signal 3000:3000
```

---

## GitOps: do not sync a public repo into your cluster

This one is worth spelling out, because it is easy to set up by accident and
hard to notice afterwards.

If Argo CD (or Flux) watches **this public repository** with automated sync:

```yaml
source:
  repoURL: https://github.com/you/signal.git
  targetRevision: main
  path: deploy/kubernetes
syncPolicy:
  automated: { prune: true, selfHeal: true }
```

…then **merging a pull request deploys it**. Anyone whose PR you merge can add a
container to the manifests, mount `signal-secrets` — your model API key, your
cron secret, the key that decrypts every credential stored in the UI — and have
it running on your hardware minutes later, without a single `kubectl` command.
Code review is the only gate, and reviewing a Kustomize diff is not the same
kind of attention as reviewing TypeScript.

`prune: true` cuts the other way as well: deleting the manifests from the
repository deletes the running application *and its PVC*.

The fix is the standard split — **application repo public, configuration repo
private**:

```
your-forge/signal          public     the app. No cluster wiring in it.
your-forge/signal-deploy   private    overlays, ingress host, Argo Application
```

They do not have to live on the same forge: a public GitHub repo and a private
GitLab project work fine together, since Argo only ever talks to the second one.

Argo watches only the private repo. A public pull request can then change the
code — which still has to be built and shipped deliberately — but it cannot
change what runs in your cluster. Point `sourceRepos` in the AppProject at the
private repo only, so an accidental reintroduction of the public URL fails
validation instead of deploying.

One detail that costs an afternoon: the `repoURL` in the Application, and the
`url` of the repository Secret that carries the deploy key, must both be the
**canonical** URL. An SSH host alias from your own `~/.ssh/config` does not
exist inside the cluster, and a mismatch between those two strings surfaces as
"repository not accessible" with no hint as to why.

If you are migrating an existing setup, the order matters: create the private
repo, give Argo a read credential for it, repoint the AppProject and then the
Application, confirm `Synced`, and only then remove the manifests from the
public repo. Doing it the other way round prunes your data.
