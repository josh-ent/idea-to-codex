import fs from "node:fs/promises";
import path from "node:path";

import { sectionContent, type RepositoryValidation } from "../artifacts/repository.js";
import { generatePackage } from "../packaging/service.js";
import { workflowContextLines, type WorkflowContext } from "./workflow.js";

type PackageRecord = RepositoryValidation["planPackages"][number];

export function findPackagesMissingWorkflowContext(
  records: PackageRecord[],
  workflowContext: WorkflowContext,
): PackageRecord[] {
  return records.filter((record) => !packageContainsWorkflowContext(record.content, workflowContext));
}

export async function findPackageAlignmentDrift(
  rootDir: string,
  trancheId: string,
  validation: RepositoryValidation,
): Promise<string[]> {
  const drifts: string[] = [];
  const expectedContentByType = new Map<"plan" | "execution", string>();

  for (const type of ["plan", "execution"] as const) {
    const linkedPackages = packageRecordsForType(validation, type).filter(
      (record) =>
        record.frontmatter?.source_tranche === trancheId &&
        record.errors.length === 0,
    );

    if (linkedPackages.length === 0) {
      continue;
    }

    if (!expectedContentByType.has(type)) {
      expectedContentByType.set(
        type,
        (await generatePackage(rootDir, type, trancheId, false)).content.trim(),
      );
    }

    const expectedContent = expectedContentByType.get(type)!;

    for (const record of linkedPackages) {
      const persistedContent = await fs.readFile(path.join(rootDir, record.path), "utf8");

      if (persistedContent.trim() !== expectedContent) {
        drifts.push(record.frontmatter?.id ?? record.path);
      }
    }
  }

  return drifts;
}

function packageContainsWorkflowContext(
  markdown: string,
  workflowContext: WorkflowContext,
): boolean {
  const workflowSection = sectionContent(markdown, "Workflow Context");

  if (!workflowSection) {
    return false;
  }

  return workflowContextLines(workflowContext).every((line) => workflowSection.includes(line));
}

function packageRecordsForType(
  validation: RepositoryValidation,
  type: "plan" | "execution",
): PackageRecord[] {
  return type === "plan" ? validation.planPackages : validation.executionPackages;
}
