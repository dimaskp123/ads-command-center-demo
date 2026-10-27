// Creative Library tag taxonomy. Tags are stored as "group:value" strings.
// The analysis step may only use values listed here, so every tag page is
// meaningful and comparable week to week.

export type TagGroup = "hook" | "angle" | "script" | "funnel" | "content" | "format" | "length" | "language" | "platform";

export const TAG_GROUPS: { key: TagGroup; label: string; help: string }[] = [
  { key: "hook", label: "Hook", help: "What stops the scroll in the first 1–3 seconds." },
  { key: "angle", label: "Angle", help: "The persuasion lever the creative leans on." },
  { key: "script", label: "Script", help: "How the creative is structured from start to finish." },
  { key: "format", label: "Format", help: "How it is produced and shot." },
  { key: "content", label: "Content type", help: "What kind of content it is." },
  { key: "funnel", label: "Funnel", help: "Which stage of the funnel it serves best." },
  { key: "length", label: "Length", help: "Video duration bucket." },
  { key: "language", label: "Language", help: "Caption / spoken language." },
  { key: "platform", label: "Platform", help: "Where it was posted." },
];

export const TAGS: Record<TagGroup, Record<string, string>> = {
  hook: {
    "negative-warning": "Negative / warning hook",
    question: "Question hook",
    pov: "POV hook",
    "before-after": "Before–after hook",
    "bold-claim": "Bold claim",
    "curiosity-gap": "Curiosity gap",
    "shock-stat": "Shocking number / price",
    "relatable-pain": "Relatable pain",
    "social-proof": "Social-proof hook",
    controversy: "Controversial / hot take",
    "direct-callout": "Direct call-out (\"kamu yang…\")",
    "storytime-opener": "Storytime opener",
    "list-teaser": "List teaser (\"3 hal…\")",
    "visual-interrupt": "Visual pattern interrupt",
    "trend-sound": "Trending sound / meme",
  },
  angle: {
    "pain-point": "Pain point",
    aspiration: "Aspiration",
    "social-proof": "Social proof",
    education: "Education",
    "price-value": "Price / value",
    authority: "Authority / expert",
    entertainment: "Entertainment",
    "fomo-scarcity": "FOMO / scarcity",
    comparison: "Comparison",
    transformation: "Transformation",
    honesty: "Honest / no-filter",
  },
  script: {
    "problem-agitate-solve": "Problem → agitate → solve",
    listicle: "Listicle",
    "story-arc": "Story arc",
    "demo-showcase": "Demo / showcase",
    "review-verdict": "Review → verdict",
    "tutorial-steps": "Step-by-step tutorial",
    comparison: "Side-by-side comparison",
    reaction: "Reaction",
    skit: "Skit / sketch",
    "day-in-life": "Day in the life",
    reveal: "Build-up → reveal",
    "q-and-a": "Q&A / reply to comment",
  },
  format: {
    "talking-head": "Talking head",
    "voiceover-broll": "Voice-over + B-roll",
    "skit-acting": "Acted skit",
    "hands-demo": "Hands-only demo",
    unboxing: "Unboxing",
    carousel: "Carousel / slideshow",
    "static-image": "Static image",
    "green-screen": "Green screen",
    "duet-stitch": "Duet / stitch",
    "live-clip": "Live clip",
    montage: "Montage / edit",
    "text-overlay": "Text-overlay heavy",
    ugc: "UGC-style (phone, casual)",
  },
  content: {
    educational: "Educational",
    entertaining: "Entertaining",
    "testimonial-review": "Testimonial / review",
    promotional: "Promotional / sales",
    "behind-the-scenes": "Behind the scenes",
    inspirational: "Inspirational",
    commentary: "News / commentary",
  },
  funnel: {
    awareness: "Awareness",
    consideration: "Consideration",
    conversion: "Conversion / sales",
  },
  length: {
    "under-15s": "< 15 s",
    "15-30s": "15–30 s",
    "30-60s": "30–60 s",
    "over-60s": "> 60 s",
    image: "Image / carousel",
  },
  language: { id: "Bahasa Indonesia", en: "English", mixed: "Mixed ID/EN" },
  platform: { tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" },
};

export function tagLabel(tag: string): string {
  const [g, v] = tag.split(":") as [TagGroup, string];
  return TAGS[g]?.[v] ?? v;
}

export function tagGroup(tag: string): TagGroup {
  return tag.split(":")[0] as TagGroup;
}

export function isKnownTag(tag: string): boolean {
  const [g, v] = tag.split(":") as [TagGroup, string];
  return !!TAGS[g]?.[v];
}
