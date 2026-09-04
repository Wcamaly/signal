import type { Dictionary } from "./en";

/**
 * Spanish interface. Typed as `Dictionary`, so a key that goes missing here
 * fails the build rather than falling back silently to English.
 *
 * The register follows the project's own: direct, concrete, no hype, and
 * "vos" is avoided in favour of the neutral second person so the text reads
 * the same in Madrid and in Buenos Aires.
 */
export const es: Dictionary = {
  localeLabel: "Español",

  app: {
    metaTitle: "Signal — radar de IA y publicaciones",
    metaDescription:
      "Lee tus fuentes, elige lo que vale la pena decir, escribe el resumen semanal y redacta los borradores. Vos los aprobás.",
    tagline: "Radar → resumen semanal → publicaciones",
    noModel: "modo demo · sin modelo",
  },

  nav: {
    configure: "Configuración",
    dashboard: "Panel",
    radar: "Radar",
    digest: "Resumen semanal",
    posts: "Publicaciones",
    sources: "Fuentes",
    voice: "Voz y ajustes",
    channels: "Canales",
    prompts: "Prompts",
    model: "Modelo y claves",
  },

  common: {
    save: "Guardar",
    saving: "Guardando…",
    saved: "Guardado ✓",
    cancel: "Cancelar",
    close: "Cerrar",
    edit: "Editar",
    delete: "Eliminar",
    remove: "Quitar",
    upload: "Subir",
    copy: "Copiar",
    copied: "Copiado ✓",
    error: "Error",
    all: "Todos",
    enabled: "Activo",
    disabled: "desactivado",
    working: "Trabajando…",
    configuration: "Configuración",
  },

  run: {
    button: "Ejecutar pipeline",
    running: "Ejecutando…",
    title: "Ejecutar el pipeline",
    intro:
      "Cada etapa consume la salida de la anterior. Ejecutalas por separado si ya tenés los datos previos.",
    notRun: "No se ejecutó.",
    start: "Ejecutar",
    starting: "Arrancando",
    progressRunning: (done: number, total: number, stage: string, seconds: number) =>
      `${done}/${total} · ${stage} · ${seconds}s`,
    progressDone: (done: number, total: number, seconds: number) =>
      `${done}/${total} etapa${total === 1 ? "" : "s"} · ${seconds}s`,
    stages: {
      ingest: {
        label: "Leer fuentes",
        hint: "Descarga los items nuevos de cada fuente activa.",
      },
      curate: { label: "Curar", hint: "Puntúa, agrupa y selecciona las señales de la semana." },
      digest: {
        label: "Resumen semanal",
        hint: "Escribe el documento de trabajo a partir de las señales seleccionadas.",
      },
      posts: { label: "Escribir posts", hint: "Redacta borradores para cada canal activo." },
    },
  },

  dashboard: {
    kicker: (week: string) => `Semana ${week}`,
    title: "Panel",
    sub: "Estado del radar, del resumen y de la cola de publicación.",
    demoTitle: "Modo demo",
    demoBody:
      "La lectura de fuentes funciona igual, pero la curación, el resumen y los posts salen como texto de relleno. Elegí un proveedor y pegá una clave en",
    stats: {
      items: "Items esta semana",
      selected: "Señales seleccionadas",
      drafts: "Borradores por revisar",
      approved: "Aprobados / programados",
      published: "Publicados",
      sources: "Fuentes activas",
    },
    digestOfWeek: "Resumen de esta semana",
    seeAll: "Ver todos →",
    noDigest: (week: string) =>
      `Todavía no hay resumen de ${week}. Ejecutá el pipeline desde la barra lateral.`,
    approvalQueue: "Cola de aprobación",
    noDrafts: "No hay borradores pendientes.",
    topSignals: "Señales principales",
    noSignals: "Todavía no hay señales puntuadas. Ejecutá leer fuentes + curar.",
    recentRuns: "Ejecuciones recientes",
  },

  radar: {
    kicker: "Radar",
    title: (week: string) => `Señales de ${week}`,
    sub: (items: number, scored: number) =>
      `${items} items · ${scored} puntuados por el curador. El puntaje mide qué tan publicable es algo para tu audiencia, no qué tan importante es la noticia.`,
    statuses: {
      new: "sin puntuar",
      scored: "puntuado",
      selected: "seleccionado",
      rejected: "rechazado",
      used: "usado",
    },
    why: "Por qué",
    hide: "Ocultar",
    select: "Seleccionar",
    reject: "Rechazar",
    whyItMatters: "Por qué importa",
    sourceSummary: "Resumen de la fuente",
    empty: "No hay items de esta semana. Ejecutá la etapa de lectura desde la barra lateral.",
    atLeast: (score: number) => `≥ ${score}`,
  },

  digestList: {
    kicker: "Archivo",
    title: "Resúmenes semanales",
    sub: "El documento de trabajo del que sale cada publicación. Tiene opinión; no es un newsletter.",
    empty: "Todavía no hay ningún resumen. Ejecutá el pipeline desde la barra lateral.",
  },

  digestPage: {
    kicker: "Documento de trabajo",
    title: "Resumen semanal",
    sub: "La lectura de la semana: qué pasó, por qué importa y con qué ángulo publicarlo. Los posts salen de acá.",
    copyMarkdown: "Copiar markdown",
    seePublications: "Ver publicaciones",
    language: "Idioma",
    rewriteIn: (language: string) => `Reescribir en ${language}`,
    translating: "Traduciendo…",
    languageHint:
      "Traduce el documento en el lugar. No vuelve a ejecutar el pipeline y no toca los posts ya escritos a partir de él.",
    signalsUsed: (n: number) => `Señales usadas (${n})`,
    postsWritten: (n: number) => `Posts escritos (${n})`,
    noPosts: "Todavía no hay posts. Ejecutá la etapa de escritura.",
    empty: "Todavía no hay resumen. Ejecutá el pipeline desde la barra lateral.",
  },

  posts: {
    kicker: "Cola de publicación",
    title: "Publicaciones",
    sub: "Nada sale solo. Revisás, editás o pedís una reescritura, y recién entonces se aprueba.",
    statuses: {
      draft: "Borradores",
      approved: "Aprobados",
      scheduled: "Programados",
      published: "Publicados",
      discarded: "Descartados",
    },
    empty: "No hay nada en este estado. Ejecutá la etapa de escritura desde la barra lateral.",
    tabs: { edit: "Editar", preview: "Vista previa", template: "Plantilla" },
    thread: (n: number) => `hilo · ${n}`,
    discardChanges: "Descartar cambios",
    askRewrite: "Pedir una reescritura",
    rewrite: "Reescribir",
    ownInstruction: "O escribí tu propia instrucción…",
    quick: [
      "Más corto y más filoso",
      "Más técnico, para alguien que lo pone en producción",
      "Cambiá el gancho, este no funciona",
      "Sacale el tono de venta",
      "Tomá la posición contraria al consenso",
    ],
    approve: "Aprobar",
    publishVia: (publisher: string) => `Publicar vía ${publisher}`,
    publishing: "Publicando…",
    markPublished: "Marcar como publicado",
    discard: "Descartar",
    backToDraft: "Volver a borrador",
    live: "en vivo ↗",
    visualBrief: "Brief visual",
    whatGetsPublished: (channel: string) => `Lo que se publica (plantilla de ${channel})`,
    source: (title: string) => `Fuente: ${title}`,
    language: "idioma",
    languageTitle: "Reescribir este post en otro idioma",
    translating: "Traduciendo…",
    image: "Imagen",
    imagePlaceholder: "https://… o subí una",
    useSourceImage: "Usar la imagen de la fuente",
    downloadImage: "Descargar imagen",
    openImage: "Abrir imagen ↗",
    altPlaceholder: "Texto alternativo — una línea describiendo la imagen",
    link: "Enlace",
    saveAndFetch: "Guardar y traer ficha",
    card: (title: string, withImage: boolean) =>
      `Ficha: ${title}${withImage ? " · con imagen" : ""}`,
    storeError: "No se pudo guardar la imagen",
  },

  preview: {
    generic: (channelKey: string) => `Vista genérica — no hay skin para "${channelKey}"`,
    caveat:
      "Renderizado desde la plantilla del canal — el mismo texto que te da el botón Copiar. Dónde corta el texto y cómo se espacia son aproximaciones: las plataformas cambian ambas cosas sin avisar.",
    yourName: "Tu nombre",
    yourHeadline: "Tu titular",
    instagramNoImage:
      "Todavía no hay imagen. Instagram muestra primero la foto y después el texto — agregá una arriba y esto es lo que va a ver la gente.",
  },

  sources: {
    kicker: "Entrada",
    title: "Fuentes",
    sub: "RSS, Hacker News, arXiv, GitHub, Reddit y YouTube — ninguna necesita clave de API. Agregá las que leés de verdad: el radar vale lo que valen sus fuentes.",
  },

  settings: {
    title: "Voz y ajustes",
    sub: "Esto es lo que separa un post que suena a vos de uno que suena a un LLM. Cuanto más específico, mejor — sobre todo la lista de prohibidos y las muestras de tu escritura.",
    interfaceLanguage: "Idioma de la interfaz",
    interfaceLanguageHint:
      "El idioma de Signal en sí: este menú, los botones y las etiquetas. Lo que escribe el modelo es el idioma de trabajo, más abajo.",
    voiceProfile: "Perfil de voz",
    loadExample: "Cargar ejemplo",
    name: "Nombre",
    role: "Rol",
    company: "Empresa / qué construís",
    picture: "Foto",
    pictureHint:
      "Se muestra en las vistas previas de la cola de publicación. Pegá una URL o subí un archivo — no se envía a ningún lado, se guarda al lado de la base de datos.",
    picturePlaceholder: "https://… o subí una",
    positioning: "Posicionamiento",
    positioningHint:
      "Tu tesis central. Va en todos los prompts: es lo que hace que los posts digan algo tuyo en vez de algo genérico.",
    audience: "Audiencia",
    audienceHint:
      "Para quién escribís. Cuanto más concreto (rol, sector, qué les preocupa), mejor filtra el curador.",
    tone: "Tono",
    pillars: "Pilares editoriales",
    pillarsHint: "Uno por línea. El curador puntúa más alto los items de estos temas.",
    banned: "Prohibidos",
    bannedHint:
      "Uno por línea. Frases, muletillas y emoji que no querés ver nunca. Es el ajuste que más cambia el resultado.",
    workingLanguage: "Idioma de trabajo",
    workingLanguageHint:
      "El idioma en el que se escriben el curador y el resumen semanal. Cada canal puede escribir sus posts en otro, en Canales.",
    cta: "Cierre / CTA",
    samples: "Muestras de tu escritura",
    samplesHint:
      "Pegá 2 o 3 posts tuyos que hayan funcionado. Sin esto el agente escribe correcto pero neutro; con esto empieza a sonar a vos.",
    pipeline: "Pipeline",
    signalsPerWeek: "Señales seleccionadas por semana",
    signalsPerWeekHint: "Cuántos items sobreviven a la curación y alimentan el resumen.",
    maxAge: "Ignorar items más viejos que (días)",
    maxAgeHint: "Todo lo publicado antes de esta ventana se descarta al leer las fuentes.",
    perChannelNote: "Cuántos posts recibe cada canal se define por canal, en",
    otherLanguage: "Otro…",
    backToList: "Lista",
    freeLanguagePlaceholder: "Nederlands, 日本語, Català…",
  },

  channels: {
    title: "Canales",
    sub: "Cada lugar donde puede terminar un borrador: una red social, un newsletter, tu blog. La guía de formato va al prompt del escritor; la plantilla decide qué se publica.",
    newChannel: "Nuevo canal",
    createChannel: "Crear canal",
    name: "Nombre",
    key: "Clave",
    charLimit: "Límite de caracteres",
    colour: "Color",
    formatHint: "Guía de formato (va al prompt del escritor)",
    language: "Idioma",
    inherit: "Heredar del perfil de voz",
    languageHint:
      "Los posts de este canal se escriben en este idioma. Cualquier post individual se puede cambiar desde la cola.",
    handle: "Usuario (solo para la vista previa)",
    handleHint: "Se muestra debajo de tu nombre en la vista previa. No se envía a ningún lado.",
    template: "Plantilla de publicación",
    publisher: "Publicador",
    postsPerRun: "Posts por ejecución",
    secret: "Secreto",
    storedHint: (hint: string) => ` · guardado ${hint}`,
    keepStored: "Dejalo vacío para conservar el guardado",
    pasteToken: "Pegá el token",
    credentialError: "No se pudo guardar la credencial",
    summary: (charLimit: number, postsPerRun: number, language: string | null) =>
      `${charLimit} caracteres · ${postsPerRun} post${postsPerRun === 1 ? "" : "s"} por ejecución${language ? ` · ${language}` : ""}`,
  },

  promptsPage: {
    title: "Prompts",
    sub: "Los prompts que ejecutan el pipeline, editables acá. Restaurar vuelve a la versión que viene con Signal, así que experimentar no tiene riesgo.",
    customised: "personalizado",
    variables: "Variables",
    systemPrompt: "Prompt de sistema",
    template: "Plantilla",
    restore: "Restaurar la versión original",
    restored: "Restaurado al original",
  },

  model: {
    title: "Modelo y claves",
    sub: "Qué modelo escribe para vos y dónde vive su clave. Todo se guarda cifrado y nunca vuelve al navegador.",
    provider: "Proveedor",
    modelId: "Id del modelo",
    baseUrl: "URL base",
    apiKey: "Clave de API",
    testConnection: "Probar conexión",
    testing: "Probando…",
    maxTokens: "Tokens máximos",
    temperature: "Temperatura",
  },

  registry: {
    sourceKinds: {
      rss: {
        label: "RSS / Atom",
        urlLabel: "URL del feed",
        help: "Cualquier feed RSS 2.0 o Atom. La forma más común de agregar un blog, un laboratorio o una redacción.",
        fields: { maxItems: "Items máximos por ejecución" },
      },
      hn: {
        label: "Hacker News",
        urlLabel: "Consulta",
        help: "Historias de Hacker News por encima de un puntaje. Sin clave de API.",
        fields: { minPoints: "Puntaje mínimo", limit: "Historias a leer" },
      },
      arxiv: {
        label: "arXiv",
        urlLabel: "Categoría o consulta",
        help: "Papers nuevos de una categoría de arXiv. Útil para investigación, ruidoso para producto.",
        fields: { maxItems: "Papers máximos por ejecución" },
      },
      github: {
        label: "GitHub",
        urlLabel: "Repositorio",
        help: "Releases o commits de un repositorio. Sirve para seguir una herramienta que te importa de verdad.",
        fields: { maxItems: "Items máximos por ejecución" },
      },
      reddit: {
        label: "Reddit",
        urlLabel: "Subreddit",
        help: "Los posts top de un subreddit en una ventana de tiempo. Reddit limita el tráfico anónimo: cuando la API JSON rechaza el pedido, Signal cae al feed RSS público, que no trae puntajes.",
        fields: { minScore: "Puntaje mínimo", window: "Ventana", limit: "Posts a leer" },
      },
      youtube: {
        label: "Canal de YouTube",
        urlLabel: "Id de canal o de playlist",
        help: "Los ids de canal empiezan con UC, los de playlist con PL. El id del canal está en el código fuente de la página del canal (\"channelId\").",
        fields: { maxItems: "Videos máximos por ejecución" },
      },
    },
    publishers: {
      manual: {
        label: "Manual (copiar y pegar)",
        help: "Signal solo registra el post como publicado. Vos lo copiás y lo pegás donde vaya. Es el default más seguro y no necesita que ninguna plataforma revise una app.",
      },
      webhook: {
        label: "Webhook",
        help: "Manda el post como JSON a una URL tuya. Usalo con n8n, Make, Zapier, un programador de tareas, tu CMS o tu propio script — la salida de emergencia para cualquier plataforma que Signal no hable de forma nativa.",
        credentialLabel: "Token bearer (opcional)",
        fields: { url: "URL del endpoint" },
      },
      mastodon: {
        label: "Mastodon",
        help: "Publica un estado a través de la API de Mastodon. Creá una aplicación en Preferencias → Desarrollo de tu instancia con el scope write:statuses y pegá su token de acceso.",
        credentialLabel: "Token de acceso",
        fields: { instance: "URL de la instancia" },
      },
      bluesky: {
        label: "Bluesky",
        help: "Publica a través del protocolo AT. Usá una contraseña de aplicación (Ajustes → App Passwords), nunca la de tu cuenta. Los enlaces y las imágenes van como texto plano.",
        credentialLabel: "Contraseña de aplicación",
        fields: { handle: "Usuario", service: "URL del PDS" },
      },
    },
    providers: {},
    prompts: {
      curator: {
        label: "Curador",
        description:
          "Puntúa cada item de la semana de 0 a 100, agrupa los duplicados en una sola historia y propone un ángulo. Cambiar esto cambia lo que llega al radar.",
      },
      digest: {
        label: "Resumen semanal",
        description:
          "Escribe el documento de trabajo de la semana a partir de las señales seleccionadas. Es la materia prima de la que sale cada post.",
      },
      writer: {
        label: "Escritor",
        description:
          "Convierte el resumen en borradores para un canal. Se ejecuta una vez por canal activo, con la guía de formato de ese canal.",
      },
      refine: {
        label: "Reescritura",
        description:
          "Reescribe un borrador existente siguiendo una instrucción que escribís en la cola de publicación.",
      },
      translate: {
        label: "Traducción",
        description:
          "Reescribe un post existente o el resumen semanal en otro idioma, conservando tu voz. Lo usa el selector de idioma de la cola y del resumen — nunca regenera la pieza desde cero.",
      },
    },
  },
};
