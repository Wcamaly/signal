export type SeedSource = {
  name: string;
  url: string;
  kind: "rss" | "hn" | "arxiv" | "github";
  category: string;
  weight: number;
};

/** Fuentes por defecto. Todas públicas y sin API key. */
export const SEED_SOURCES: SeedSource[] = [
  // Labs y compañías
  { name: "Anthropic — News", url: "https://www.anthropic.com/news/rss.xml", kind: "rss", category: "labs", weight: 1.4 },
  { name: "OpenAI — Blog", url: "https://openai.com/news/rss.xml", kind: "rss", category: "labs", weight: 1.3 },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", kind: "rss", category: "labs", weight: 1.2 },
  { name: "Meta AI", url: "https://ai.meta.com/blog/rss/", kind: "rss", category: "labs", weight: 1.1 },
  { name: "Mistral AI", url: "https://mistral.ai/news/feed.xml", kind: "rss", category: "labs", weight: 1.1 },
  { name: "Hugging Face — Blog", url: "https://huggingface.co/blog/feed.xml", kind: "rss", category: "product", weight: 1.0 },

  // Análisis y prensa técnica
  { name: "Import AI (Jack Clark)", url: "https://importai.substack.com/feed", kind: "rss", category: "analysis", weight: 1.3 },
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", kind: "rss", category: "analysis", weight: 1.2 },
  { name: "The Batch (DeepLearning.AI)", url: "https://www.deeplearning.ai/the-batch/rss/", kind: "rss", category: "analysis", weight: 1.0 },
  { name: "Ars Technica — AI", url: "https://arstechnica.com/ai/feed/", kind: "rss", category: "press", weight: 0.9 },
  { name: "MIT Tech Review — AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", kind: "rss", category: "press", weight: 0.9 },
  { name: "VentureBeat — AI", url: "https://venturebeat.com/category/ai/feed/", kind: "rss", category: "business", weight: 0.8 },

  // Regulación / enterprise (clave para tu posicionamiento)
  { name: "EU AI Act Newsroom", url: "https://artificialintelligenceact.eu/feed/", kind: "rss", category: "regulation", weight: 1.3 },
  { name: "NIST — AI", url: "https://www.nist.gov/news-events/news/rss.xml", kind: "rss", category: "regulation", weight: 0.9 },

  // Comunidad y research
  { name: "Hacker News — AI (score > 100)", url: "hn:ai", kind: "hn", category: "community", weight: 1.0 },
  { name: "Hacker News — LLM agents", url: "hn:agents", kind: "hn", category: "community", weight: 1.0 },
  { name: "arXiv cs.AI (últimos)", url: "arxiv:cs.AI", kind: "arxiv", category: "research", weight: 0.8 },
  { name: "arXiv cs.CL (NLP/LLM)", url: "arxiv:cs.CL", kind: "arxiv", category: "research", weight: 0.8 },
];
