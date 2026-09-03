export type SeedSource = {
  name: string;
  url: string;
  kind: string;
  category: string;
  weight: number;
};

/**
 * Sources installed on first run. All public, none requires an API key.
 * They are a starting point, not a recommendation: the radar is only as good
 * as the sources you actually read, so replace them with yours.
 */
export const SEED_SOURCES: SeedSource[] = [
  // Labs and companies
  { name: "OpenAI — News", url: "https://openai.com/news/rss.xml", kind: "rss", category: "labs", weight: 1.3 },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", kind: "rss", category: "labs", weight: 1.2 },
  { name: "Google — AI blog", url: "https://blog.google/technology/ai/rss/", kind: "rss", category: "labs", weight: 1.0 },
  { name: "Mistral AI", url: "https://mistral.ai/rss.xml", kind: "rss", category: "labs", weight: 1.1 },
  { name: "Hugging Face — Blog", url: "https://huggingface.co/blog/feed.xml", kind: "rss", category: "product", weight: 1.0 },
  { name: "Claude Code — releases", url: "github:anthropics/claude-code", kind: "github", category: "product", weight: 0.9 },

  // Analysis and technical press
  { name: "Import AI (Jack Clark)", url: "https://importai.substack.com/feed", kind: "rss", category: "analysis", weight: 1.3 },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", kind: "rss", category: "analysis", weight: 1.2 },
  { name: "Latent Space", url: "https://www.latent.space/feed", kind: "rss", category: "analysis", weight: 1.0 },
  { name: "SemiAnalysis", url: "https://semianalysis.com/feed/", kind: "rss", category: "analysis", weight: 1.0 },
  { name: "Ars Technica — AI", url: "https://arstechnica.com/ai/feed/", kind: "rss", category: "press", weight: 0.9 },
  { name: "MIT Tech Review — AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", kind: "rss", category: "press", weight: 0.9 },
  { name: "VentureBeat — AI", url: "https://venturebeat.com/category/ai/feed/", kind: "rss", category: "business", weight: 0.8 },

  // Regulation and enterprise
  { name: "EU AI Act Newsroom", url: "https://artificialintelligenceact.eu/feed/", kind: "rss", category: "regulation", weight: 1.3 },
  { name: "NIST — News", url: "https://www.nist.gov/news-events/news/rss.xml", kind: "rss", category: "regulation", weight: 0.9 },

  // Community and research
  { name: "Hacker News — AI", url: "hn:ai", kind: "hn", category: "community", weight: 1.0 },
  { name: "Hacker News — LLM agents", url: "hn:agents", kind: "hn", category: "community", weight: 1.0 },
  { name: "r/LocalLLaMA", url: "reddit:LocalLLaMA", kind: "reddit", category: "community", weight: 0.8 },
  { name: "arXiv cs.AI", url: "arxiv:cs.AI", kind: "arxiv", category: "research", weight: 0.8 },
  { name: "arXiv cs.CL (NLP/LLM)", url: "arxiv:cs.CL", kind: "arxiv", category: "research", weight: 0.8 },
];

export const SOURCE_CATEGORIES = [
  "labs",
  "analysis",
  "press",
  "business",
  "regulation",
  "community",
  "research",
  "product",
  "general",
];
