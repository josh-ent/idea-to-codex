import {
  bootstrapRepository,
  collectValidationErrors,
  validateRepository,
} from "./modules/artifacts/repository.js";
import { initializeLogging } from "./runtime/logging.js";
import { generateReview } from "./modules/governance/review.js";
import { generatePackage, refreshPackageSet } from "./modules/packaging/service.js";
import {
  approveProposalDraft,
  generateReviewProposalSet,
  rejectProposalDraft,
} from "./modules/proposals/service.js";

async function main() {
  initializeLogging();

  const [command, ...args] = process.argv.slice(2);

  if (command === "bootstrap") {
    console.log(JSON.stringify(await bootstrapRepository(process.cwd()), null, 2));
    return;
  }

  if (command === "validate") {
    const validation = await validateRepository(process.cwd());
    const errors = collectValidationErrors(validation);

    if (errors.length > 0) {
      console.error("repository validation failed");
      for (const error of errors) {
        console.error(`- ${error}`);
      }
      process.exitCode = 1;
      return;
    }

    console.log("repository validation passed");
    return;
  }

  if (command === "package") {
    const [type, trancheId = "TRANCHE-001", ...flags] = args;

    if (type !== "plan" && type !== "execution") {
      throw new Error("usage: package <plan|execution> [TRANCHE-ID] [--persist]");
    }

    const result = await generatePackage(
      process.cwd(),
      type,
      trancheId,
      flags.includes("--persist") || !flags.includes("--no-persist"),
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "package:refresh") {
    const [trancheId = "TRANCHE-001", ...flags] = args;
    const result = await refreshPackageSet(
      process.cwd(),
      trancheId,
      flags.includes("--persist") || !flags.includes("--no-persist"),
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "review") {
    const [trancheId = "TRANCHE-001", ...flags] = args;
    const result = await generateReview(
      process.cwd(),
      trancheId,
      flags.includes("--persist") || !flags.includes("--no-persist"),
    );
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "proposal:review") {
    const [trancheId = "TRANCHE-001"] = args;
    const result = await generateReviewProposalSet(process.cwd(), trancheId);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "proposal:approve") {
    const [proposalId] = args;

    if (!proposalId) {
      throw new Error("usage: proposal:approve <PROPOSAL-ID>");
    }

    console.log(JSON.stringify(await approveProposalDraft(process.cwd(), proposalId), null, 2));
    return;
  }

  if (command === "proposal:reject") {
    const [proposalId] = args;

    if (!proposalId) {
      throw new Error("usage: proposal:reject <PROPOSAL-ID>");
    }

    console.log(JSON.stringify(await rejectProposalDraft(process.cwd(), proposalId), null, 2));
    return;
  }

  throw new Error(
    "usage: bootstrap | validate | package <plan|execution> [TRANCHE-ID] [--persist] | package:refresh [TRANCHE-ID] [--persist] | review [TRANCHE-ID] [--persist] | proposal:review [TRANCHE-ID] | proposal:approve <PROPOSAL-ID> | proposal:reject <PROPOSAL-ID>",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
