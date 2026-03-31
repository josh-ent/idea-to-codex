import {
  bootstrapRepository,
  collectValidationErrors,
  validateRepository,
} from "./modules/artifacts/repository.js";
import { generateReview } from "./modules/governance/review.js";
import { generatePackage, refreshPackageSet } from "./modules/packaging/service.js";
import {
  approveProposalDraft,
  generateIntakeProposalSet,
  generateReviewProposalSet,
  rejectProposalDraft,
} from "./modules/proposals/service.js";
import fs from "node:fs/promises";
import { type IntakeAnalysis, resolveIntakeAnalysis } from "./modules/intake/service.js";

async function main() {
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

  if (command === "intake:analyze") {
    const [requestText = ""] = args;
    const result = await analyzeIntakeForCli(process.cwd(), requestText);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "proposal:intake") {
    const [requestText = "", ...flags] = args;
    const result = await generateIntakeProposalSet(
      process.cwd(),
      requestText,
      parseAnswerFlags(flags),
      {
        analysis: await readAnalysisFlag(flags),
      },
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
    "usage: bootstrap | validate | package <plan|execution> [TRANCHE-ID] [--persist] | package:refresh [TRANCHE-ID] [--persist] | review [TRANCHE-ID] [--persist] | intake:analyze <request> | proposal:intake <request> [--answer=question_type:...] [--analysis-file=path] | proposal:review [TRANCHE-ID] | proposal:approve <PROPOSAL-ID> | proposal:reject <PROPOSAL-ID>",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});

function parseAnswerFlags(flags: string[]): Record<string, string> {
  return Object.fromEntries(
    flags
      .filter((flag) => flag.startsWith("--answer="))
      .map((flag) => flag.slice("--answer=".length))
      .map((value) => {
        const separator = value.indexOf(":");

        if (separator === -1) {
          throw new Error("usage: --answer=question_type:Your answer");
        }

        return [value.slice(0, separator), value.slice(separator + 1)];
      }),
  );
}

async function analyzeIntakeForCli(rootDir: string, requestText: string): Promise<IntakeAnalysis> {
  return resolveIntakeAnalysis(rootDir, requestText);
}

async function readAnalysisFlag(flags: string[]): Promise<IntakeAnalysis | undefined> {
  const flag = flags.find((entry) => entry.startsWith("--analysis-file="));

  if (!flag) {
    return undefined;
  }

  const filePath = flag.slice("--analysis-file=".length);

  if (!filePath) {
    throw new Error("usage: --analysis-file=/path/to/intake-analysis.json");
  }

  return JSON.parse(await fs.readFile(filePath, "utf8")) as IntakeAnalysis;
}
