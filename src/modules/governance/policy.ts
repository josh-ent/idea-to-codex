export const reviewTriggers = [
  "Review at tranche end.",
  "Review after architecture-affecting decisions.",
  "Review after glossary or data dictionary changes.",
  "Review after five durable artefact mutations unless a review happened sooner.",
] as const;

export const reviewDriftSignals = {
  implementationOutpacedDocs: "implementation outpaced docs",
  docsOutpacedImplementation: "docs outpaced implementation",
  terminologyDriftDetected: "terminology drift detected",
  architectureIntentDriftDetected: "architecture intent drift detected",
  workflowContextMissingOrIncomplete: "workflow context missing or incomplete",
  workflowContextNotPropagatedIntoPackages: "workflow context not propagated into packages",
  workflowContextStillUsesPlaceholderValues: "workflow context still uses placeholder values",
  packageAlignmentDriftDetected: "package alignment drift detected",
  executionConductDriftDetected: "execution conduct drift detected",
} as const;

export const driftSignals = Object.values(reviewDriftSignals);
