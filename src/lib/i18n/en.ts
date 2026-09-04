/**
 * The interface strings that ship with Signal, and the shape every other
 * locale has to match. `Dictionary` is derived from this object, so a locale
 * missing a key does not compile.
 *
 * This is the language of the *interface*. What the model writes is a separate
 * setting — the working language on the voice profile, and the output language
 * per channel. See src/lib/languages.ts.
 *
 * Strings that take a value are functions rather than templates with
 * placeholders, so the argument is typed and a locale can put it wherever its
 * grammar needs it — including plurals, which no format string gets right for
 * every language.
 */
export const en = {
  /** Shown in the interface-language picker, in its own language. */
  localeLabel: "English",

  app: {
    metaTitle: "Signal — AI radar and publications",
    metaDescription:
      "Reads your sources, picks what is worth saying, writes the weekly digest and drafts the posts. You approve them.",
    tagline: "Radar → weekly digest → publications",
    noModel: "demo mode · no model",
  },

  nav: {
    configure: "Configure",
    dashboard: "Dashboard",
    radar: "Radar",
    digest: "Weekly digest",
    posts: "Publications",
    sources: "Sources",
    voice: "Voice & settings",
    channels: "Channels",
    prompts: "Prompts",
    model: "Model & keys",
  },

  common: {
    save: "Save",
    saving: "Saving…",
    saved: "Saved ✓",
    cancel: "Cancel",
    close: "Close",
    edit: "Edit",
    delete: "Delete",
    remove: "Remove",
    upload: "Upload",
    copy: "Copy",
    copied: "Copied ✓",
    error: "Error",
    all: "All",
    enabled: "Enabled",
    disabled: "disabled",
    working: "Working…",
    configuration: "Configuration",
  },

  run: {
    button: "Run pipeline",
    running: "Running…",
    title: "Run the pipeline",
    intro:
      "Each stage consumes the output of the previous one. Run them separately if you already have the earlier data.",
    notRun: "Not run.",
    start: "Run",
    starting: "Starting",
    /** e.g. "2/4 · Curate · 31s" while running. */
    progressRunning: (done: number, total: number, stage: string, seconds: number) =>
      `${done}/${total} · ${stage} · ${seconds}s`,
    progressDone: (done: number, total: number, seconds: number) =>
      `${done}/${total} stages · ${seconds}s`,
    stages: {
      ingest: {
        label: "Ingest sources",
        hint: "Downloads new items from every enabled source.",
      },
      curate: { label: "Curate", hint: "Scores, clusters and selects the signals of the week." },
      digest: {
        label: "Weekly digest",
        hint: "Writes the working document from the selected signals.",
      },
      posts: { label: "Write posts", hint: "Drafts posts for every enabled channel." },
    },
  },

  dashboard: {
    kicker: (week: string) => `Week ${week}`,
    title: "Dashboard",
    sub: "State of the radar, the digest and the publication queue.",
    demoTitle: "Demo mode",
    demoBody:
      "Ingest works either way, but curation, the digest and the posts come out as filler text. Pick a provider and paste a key under",
    stats: {
      items: "Items this week",
      selected: "Selected signals",
      drafts: "Drafts to review",
      approved: "Approved / scheduled",
      published: "Published",
      sources: "Active sources",
    },
    digestOfWeek: "Digest of this week",
    seeAll: "See all →",
    noDigest: (week: string) => `No digest for ${week} yet. Run the pipeline from the sidebar.`,
    approvalQueue: "Approval queue",
    noDrafts: "No pending drafts.",
    topSignals: "Top signals",
    noSignals: "No scored signals yet. Run ingest + curate.",
    recentRuns: "Recent runs",
  },

  radar: {
    kicker: "Radar",
    title: (week: string) => `Signals of ${week}`,
    sub: (items: number, scored: number) =>
      `${items} items · ${scored} scored by the curator. The score measures how publishable something is for your audience, not how important the news is.`,
    statuses: {
      new: "not scored",
      scored: "scored",
      selected: "selected",
      rejected: "rejected",
      used: "used",
    },
    why: "Why",
    hide: "Hide",
    select: "Select",
    reject: "Reject",
    whyItMatters: "Why it matters",
    sourceSummary: "Source summary",
    empty: "No items for this week. Run the ingest stage from the sidebar.",
    atLeast: (score: number) => `≥ ${score}`,
  },

  digestList: {
    kicker: "Archive",
    title: "Weekly digests",
    sub: "The working document every publication is derived from. It has an opinion; it is not a newsletter.",
    empty: "No digest yet. Run the pipeline from the sidebar.",
  },

  digestPage: {
    kicker: "Working document",
    title: "Weekly digest",
    sub: "The read of the week: what happened, why it matters, and the angle to publish. The posts are derived from this.",
    copyMarkdown: "Copy markdown",
    seePublications: "See publications",
    language: "Language",
    rewriteIn: (language: string) => `Rewrite in ${language}`,
    translating: "Translating…",
    languageHint:
      "Translates the document in place. It does not run the pipeline again, and it does not touch the posts already written from it.",
    signalsUsed: (n: number) => `Signals used (${n})`,
    postsWritten: (n: number) => `Posts written (${n})`,
    noPosts: "No posts yet. Run the writing stage.",
    empty: "No digest yet. Run the pipeline from the sidebar.",
  },

  posts: {
    kicker: "Publication queue",
    title: "Publications",
    sub: "Nothing goes out on its own. You review, edit or ask for a rewrite, and only then it is approved.",
    statuses: {
      draft: "Drafts",
      approved: "Approved",
      scheduled: "Scheduled",
      published: "Published",
      discarded: "Discarded",
    },
    empty: "Nothing in this state. Run the writing stage from the sidebar.",
    /** Singular, for the chip on one card. `statuses` above is the filter tab. */
    status: {
      draft: "draft",
      approved: "approved",
      scheduled: "scheduled",
      published: "published",
      discarded: "discarded",
    } as Record<string, string>,
    tabs: { edit: "Edit", preview: "Preview", template: "Template" },
    thread: (n: number) => `thread · ${n}`,
    discardChanges: "Discard changes",
    askRewrite: "Ask for a rewrite",
    rewrite: "Rewrite",
    ownInstruction: "Or write your own instruction…",
    quick: [
      "Shorter and sharper",
      "More technical, for someone who deploys this",
      "Change the hook, this one does not land",
      "Drop the sales tone",
      "Take the position against the consensus",
    ],
    approve: "Approve",
    publishVia: (publisher: string) => `Publish via ${publisher}`,
    publishing: "Publishing…",
    markPublished: "Mark published",
    discard: "Discard",
    backToDraft: "Back to draft",
    live: "live ↗",
    visualBrief: "Visual brief",
    whatGetsPublished: (channel: string) => `What gets published (${channel} template)`,
    source: (title: string) => `Source: ${title}`,
    language: "language",
    languageTitle: "Rewrite this post in another language",
    translating: "Translating…",
    image: "Image",
    imagePlaceholder: "https://… or upload one",
    useSourceImage: "Use the source image",
    downloadImage: "Download image",
    openImage: "Open image ↗",
    altPlaceholder: "Alt text — one line describing the image",
    link: "Link",
    saveAndFetch: "Save & fetch card",
    card: (title: string, withImage: boolean) => `Card: ${title}${withImage ? " · with image" : ""}`,
    storeError: "Could not store the image",
  },

  preview: {
    generic: (channelKey: string) => `Generic preview — no skin for "${channelKey}"`,
    caveat:
      "Rendered from the channel template — the same text the Copy button gives you. Where the text folds and how it is spaced are approximations: the platforms change both without notice.",
    yourName: "Your name",
    yourHeadline: "Your headline",
    instagramNoImage:
      "No image yet. Instagram shows the picture first and the caption second — add one above and this is what people will see.",
  },

  sources: {
    kicker: "Input",
    title: "Sources",
    addSource: "Add a source",
    name: "Name",
    namePlaceholder: "Someone's blog",
    type: "Type",
    category: "Category",
    urlFallback: "URL",
    add: "Add",
    restoreDefaults: "Restore default sources",
    test: "Test",
    testing: "testing…",
    testResult: (found: number, sample: string) => `${found} items · ${sample}`,
    sub: "RSS, Hacker News, arXiv, GitHub, Reddit and YouTube — none of them needs an API key. Add the ones you actually read: the radar is worth what its sources are worth.",
  },

  settings: {
    title: "Voice & settings",
    sub: "This is what separates a post that sounds like you from one that sounds like an LLM. The more specific, the better — above all the banned list and the writing samples.",
    interfaceLanguage: "Interface language",
    interfaceLanguageHint:
      "The language of Signal itself: this menu, the buttons and the labels. What the model writes is the working language below.",
    voiceProfile: "Voice profile",
    loadExample: "Load example",
    name: "Name",
    role: "Role",
    company: "Company / what you build",
    picture: "Picture",
    pictureHint:
      "Shown in the previews of the publication queue. Paste a URL or upload a file — nothing is sent anywhere, it is stored next to the database.",
    picturePlaceholder: "https://… or upload",
    positioning: "Positioning",
    positioningHint:
      "Your central thesis. It goes into every prompt: this is what makes the posts say something of yours instead of something generic.",
    audience: "Audience",
    audienceHint:
      "Who you write for. The more concrete (role, sector, what worries them), the better the curator filters.",
    tone: "Tone",
    pillars: "Editorial pillars",
    pillarsHint: "One per line. The curator scores items in these topics higher.",
    banned: "Banned",
    bannedHint:
      "One per line. Phrases, tics and emoji you never want to see. This is the setting that changes the output the most.",
    workingLanguage: "Working language",
    workingLanguageHint:
      "The language the curator and the weekly digest are written in. Each channel can write its posts in another one, under Channels.",
    cta: "Close / CTA",
    samples: "Samples of your writing",
    samplesHint:
      "Paste 2 or 3 of your own posts that worked. Without this the agent writes correct but neutral text; with it, it starts to sound like you.",
    pipeline: "Pipeline",
    signalsPerWeek: "Signals selected per week",
    signalsPerWeekHint: "How many items survive curation and feed the digest.",
    maxAge: "Ignore items older than (days)",
    maxAgeHint: "Anything published before this window is dropped at ingest.",
    perChannelNote: "How many posts each channel gets is set per channel, under",
    otherLanguage: "Other…",
    backToList: "List",
    freeLanguagePlaceholder: "Nederlands, 日本語, Català…",
  },

  channels: {
    title: "Channels",
    sub: "Every place a draft can end up: a social network, a newsletter, your blog. The format hint goes into the writer prompt, the template decides what is actually published.",
    newChannel: "New channel",
    createChannel: "Create channel",
    name: "Name",
    key: "Key",
    charLimit: "Char limit",
    colour: "Colour",
    formatHint: "Format hint (goes into the writer prompt)",
    language: "Language",
    inherit: "Inherit from the voice profile",
    languageHint:
      "The posts of this channel are written in this language. Any single post can still be changed from the queue.",
    handle: "Handle (preview only)",
    handleHint: "Shown under your name in the preview. Not sent anywhere.",
    template: "Publication template",
    publisher: "Publisher",
    postsPerRun: "Posts per run",
    secret: "Secret",
    storedHint: (hint: string) => ` · stored ${hint}`,
    keepStored: "Leave empty to keep the stored one",
    pasteToken: "Paste the token",
    credentialError: "Could not store the credential",
    summary: (charLimit: number, postsPerRun: number, language: string | null) =>
      `${charLimit} chars · ${postsPerRun} post${postsPerRun === 1 ? "" : "s"} per run${language ? ` · ${language}` : ""}`,
  },

  promptsPage: {
    title: "Prompts",
    sub: "The prompts that run the pipeline, editable here. Reset restores the version that ships with Signal, so experimenting is safe.",
    customised: "customised",
    variables: "Variables",
    systemPrompt: "System prompt",
    template: "Template",
    restore: "Restore the shipped version",
    restored: "Restored to default",
  },

  model: {
    title: "Model & keys",
    sub: "Which model writes for you, and where its key lives. Everything is stored encrypted and never sent back to the browser.",
    provider: "Provider",
    modelId: "Model id",
    baseUrl: "Base URL",
    apiKey: "API key",
    testConnection: "Test connection",
    testing: "Testing…",
    maxTokens: "Max tokens",
    temperature: "Temperature",
    model: "Model",
    active: "Active:",
    setupInstructions: "Setup instructions",
    replaceKey: "Replace key",
    saveKey: "Save key",
    unknownProvider: (id: string) => `Unknown provider "${id}"`,
    noKey: (provider: string) => `No API key for ${provider}. Add one in Model & keys.`,
    chooseModel: "Choose a model for this provider.",
  },

  /**
   * Overrides for the strings that live in the plugin registries, keyed by the
   * plugin's id. A registry entry with no translation here keeps the English it
   * ships with — the same rule as the prompts table, so a third-party source
   * kind or publisher works untranslated instead of breaking.
   */
  registry: {
    sourceKinds: {} as Record<string, { label?: string; urlLabel?: string; help?: string; fields?: Record<string, string> }>,
    publishers: {} as Record<string, { label?: string; help?: string; credentialLabel?: string; fields?: Record<string, string> }>,
    providers: {} as Record<string, { label?: string; help?: string }>,
    prompts: {} as Record<string, { label?: string; description?: string }>,
  },
};

export type Dictionary = typeof en;
