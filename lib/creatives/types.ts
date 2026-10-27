export type SocialPlatform = "tiktok" | "instagram" | "facebook";

export interface CreativeMetrics {
  views: number | null;
  likes: number;
  comments: number;
  shares: number | null;
  saves: number | null;
}

export interface ScoreParts {
  breakout: number | null; // percentile 0–1 within the week's pool (views ÷ followers)
  engagement: number | null; // percentile of weighted engagement per view
  share: number | null; // percentile of (shares + saves) per view
  velocity: number | null; // percentile of interactions per day since posting
}

export interface CreativeAnalysis {
  hook: { type: string; text: string };
  angle: string;
  script: { structure: string; beats: string[] };
  funnel: string;
  contentType: string;
  formats: string[];
  whyItWorks: string;
  replicate: string;
  confidence: "high" | "medium" | "low";
}

export interface Creative {
  id: string;
  platform: SocialPlatform;
  url: string;
  author: { handle: string; name: string; followers: number | null };
  postedAt: string;
  caption: string;
  mediaType: "video" | "carousel" | "image";
  durationSec: number | null;
  language: "id" | "en" | "mixed";
  metrics: CreativeMetrics;
  ratios: { breakout: number | null; engagementRate: number | null; shareRate: number | null; perDay: number };
  score: number; // 0–100
  scoreParts: ScoreParts;
  rank: number; // within platform for the week
  seed: string; // discovery query that surfaced it (format word, not a topic)
  analysis: CreativeAnalysis | null;
  tags: string[];
}

export interface CreativeSnapshot {
  week: { start: string; end: string };
  fetchedAt: string;
  seeds: Record<SocialPlatform, string[]>;
  candidates: Record<SocialPlatform, number>;
  creatives: Creative[];
}

export interface CreativeLibraryData {
  generatedAt: string;
  snapshots: CreativeSnapshot[]; // newest first, at most 4 (28 days)
}
