# Signal

Radar de tendencias de IA → resumen semanal con criterio → borradores de publicaciones para LinkedIn, X e Instagram, con una UI para revisarlos y aprobarlos uno por uno.

Nada se publica solo. El agente propone; vos editás, pedís reescrituras y aprobás.

---

## Arrancar

```bash
npm install
cp .env.example .env.local     # y pegá tu ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
```

Sin `ANTHROPIC_API_KEY` la app corre igual en **modo demo**: la ingesta de fuentes funciona
de verdad, pero la curaduría, el resumen y los posts salen con texto de relleno.

La base es SQLite y se crea sola en `./data/signal.db`. No hay servicios externos.

---

## Cómo funciona

Cuatro etapas, encadenadas. Se corren juntas desde el botón **Correr pipeline** o
sueltas si ya tenés datos de una etapa anterior.

| Etapa | Qué hace | Usa el modelo |
|---|---|---|
| **Ingesta** | Baja items de ~18 fuentes: RSS de labs y prensa, Hacker News (Algolia) y arXiv. Deduplica por `external_id`, descarta lo de más de 14 días. | no |
| **Curaduría** | Puntúa cada item de 0 a 100 según *qué tan publicable es para tu audiencia*, no según qué tan importante es la noticia. Agrupa la misma historia en un `cluster`, escribe por qué importa y propone un ángulo. Selecciona los 8 mejores, uno por cluster. | sí |
| **Resumen** | Escribe el documento semanal: la lectura de la semana, 3-5 señales con ángulo para publicar, el ruido a evitar, y tus tesis. Es tu documento de trabajo, no un boletín. | sí |
| **Redacción** | A partir del resumen escribe N posts por plataforma, cada uno sobre una señal y un ángulo distintos, con las reglas de formato y las prohibiciones de tu perfil de voz. | sí |

Todo queda registrado en la tabla `runs` con su log.

---

## Las pantallas

- **Panel** — estado de la semana, top señales, cola de aprobación, log de la última corrida.
- **Radar** — todos los items con su puntaje, el porqué y el ángulo. Podés seleccionar o descartar a mano lo que el curador no vio bien.
- **Resumen semanal** — el documento, con las señales que lo alimentaron y los posts que salieron de él.
- **Publicaciones** — la cola. Editar en línea, **pedir reescritura** con instrucciones ("más corto y más filoso", "tomá la posición contraria"), copiar, aprobar, agendar, marcar publicado.
- **Fuentes** — activar, desactivar, agregar. Muestra el último error de cada feed.
- **Voz y ajustes** — el perfil que se inyecta en cada prompt.

---

## Lo que más cambia el resultado

En **Voz y ajustes**, dos campos hacen casi toda la diferencia:

1. **Prohibiciones** — la lista de frases, muletillas y emojis que no querés ver nunca.
   Es lo que saca el olor a IA de los textos.
2. **Muestras de tu escritura** — pegá 2 o 3 posts tuyos que hayan funcionado.
   Sin esto el agente escribe correcto pero neutro; con esto empieza a sonar a vos.

El **posicionamiento** y los **pilares editoriales** además cambian qué puntúa alto el curador,
así que el radar filtra según lo que a vos te sirve decir, no según lo que es tendencia.

---

## Automatizarlo

`GET /api/cron` corre el pipeline completo. Protegelo con `CRON_SECRET` si lo exponés.
Se puede acotar por etapas: `/api/cron?stages=ingest,curate`.

En el despliegue de abajo esto queda armado como un `CronJob` de Kubernetes (lunes
08:00). Si lo corrés a mano en otro lado:

```bash
0 8 * * 1 curl -sS -H "authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

---

## Desplegarlo en k3s

El despliegue usa Kustomize y Argo CD. El namespace `signal` contiene exclusivamente
los recursos de este proyecto y mantiene SQLite en un PVC. Por eso hay una sola
réplica de la aplicación y el pipeline corre como `CronJob` los lunes a las 08:00 en
`America/Argentina/Buenos_Aires`.

### 1. Construir y cargar la imagen local

Como los proyectos son privados y el nodo k3s es remoto, no usamos un registry
externo. La imagen se construye localmente, se transfiere por la API de Kubernetes y
se importa en el `containerd` del nodo:

```bash
kubectl apply -f deploy/kustomize/base/namespace.yaml
bash deploy/load-local-image-k3s.sh
```

El nodo es `k3s-master` y la imagen queda sólo en su almacenamiento local. Para varios
nodos, repetí la importación en cada nodo o usá un registry privado interno.

### 2. Crear el namespace y el Secret

El namespace se administra junto con el proyecto. Crealo una vez desde el repositorio:

```bash
kubectl apply -f deploy/kustomize/base/namespace.yaml
```

El Secret queda fuera de Git para no guardar credenciales en el repositorio.
`CRON_SECRET` es obligatorio; la API key de Anthropic es opcional:

```bash
export CRON_SECRET="un-secreto-largo"
export ANTHROPIC_API_KEY="sk-ant-..."
bash deploy/create-secret-k3s.sh
```

### 3. Registrar la Application en Argo CD

La fuente configurada es `git@github.com:Wcamaly/signal.git`. Argo necesita una
credencial SSH con acceso de lectura al repositorio. Después registrá primero el
proyecto y luego la aplicación en el namespace de Argo:

```bash
kubectl apply -f deploy/argocd/project.yaml
kubectl apply -f deploy/argocd/application.yaml
kubectl -n argocd get application signal
kubectl -n argocd wait application/signal --for=jsonpath='{.status.sync.status}'=Synced --timeout=180s
```

Argo sincroniza `deploy/kustomize/overlays/production`, incluyendo el PVC, Deployment,
Service, Ingress y `CronJob`. Para usar otra zona horaria, editá el valor en
`deploy/kustomize/base/configmap.yaml` y `deploy/kustomize/base/cronjob.yaml`.

Para publicar una actualización local, ejecutá nuevamente `load-local-image-k3s.sh`.
Argo seguirá gestionando los manifiestos, pero la imagen no se descarga desde Git ni
desde un registry.

### Operación

```bash
kubectl -n signal get pods,pvc,cronjobs
kubectl -n signal logs deploy/signal
kubectl -n signal create job --from=cronjob/signal-pipeline signal-pipeline-manual
```

Traefik publica Signal en `http://signal.192.168.1.240.nip.io`. Si tu red no resuelve
`nip.io`, agregá `192.168.1.240 signal.local` a `/etc/hosts` y cambiá el host del
Ingress a `signal.local`. La app no tiene autenticación propia y esta ruta sólo usa
HTTP dentro de la red local.

El estado está en `signal-data` (`/app/data/signal.db`). Respaldá ese PVC o usá el
mecanismo de snapshots de su StorageClass.

---

## Publicar de verdad

Hoy el flujo es copiar y pegar, a propósito: las APIs de publicación de LinkedIn e Instagram
exigen una app revisada por la plataforma, y X cobra por el nivel de acceso que hace falta.
Para una sola persona publicando 3 veces por semana, el copiar-pegar cuesta menos que el trámite.

Cuando quieras automatizarlo, el punto de enganche es `actionSetPostStatus`: ahí se marca
`published`. Un adaptador por plataforma con la misma firma alcanza.

---

## Estructura

```
src/
  lib/
    db.ts               esquema SQLite + settings
    ingest.ts           fetchers RSS / Atom / HN / arXiv
    sources.ts          fuentes por defecto
    claude.ts           cliente + extracción de JSON robusta
    agents/
      curator.ts        puntaje, clustering, ángulos
      digest.ts         resumen semanal
      writer.ts         posts por plataforma + reescritura
    pipeline.ts         orquestación y log de corridas
    actions.ts          server actions de la UI
  app/                  panel, radar, digest, posts, sources, settings, /api/cron
```
