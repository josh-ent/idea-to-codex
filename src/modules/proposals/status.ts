import type {
  ProposalDraftFrontmatter,
  ProposalSetFrontmatter,
} from "../artifacts/schemas.js";

export function deriveProposalSetStatus(
  statuses: ProposalDraftFrontmatter["status"][],
): ProposalSetFrontmatter["status"] {
  if (statuses.length === 0) {
    return "draft";
  }

  if (statuses.every((status) => status === "approved")) {
    return "approved";
  }

  if (statuses.every((status) => status === "rejected")) {
    return "rejected";
  }

  if (statuses.some((status) => status === "approved")) {
    return "partially_approved";
  }

  return "draft";
}
