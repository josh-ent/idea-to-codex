export const reviewTriggers = [
  "Review at tranche end.",
  "Review after architecture-affecting decisions.",
  "Review after glossary or data dictionary changes.",
  "Review after five durable artefact mutations unless a review happened sooner.",
] as const;

export const driftSignals = [
  "implementation outpaced docs",
  "docs outpaced implementation",
  "terminology drift detected",
  "architecture intent drift detected",
] as const;
