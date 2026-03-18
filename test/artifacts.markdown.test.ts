import { describe, expect, it } from "vitest";

import {
  collectHeadings,
  extractBulletItems,
  findMissingSections,
  getSection,
  parseAssumptions,
  parseGlossary,
} from "../src/modules/artifacts/markdown.js";

describe("markdown helpers", () => {
  it("collects headings in order", () => {
    const markdown = [
      "# Root",
      "",
      "## Child",
      "",
      "### Grandchild",
      "",
    ].join("\n");

    expect(collectHeadings(markdown)).toEqual(["Root", "Child", "Grandchild"]);
  });

  it("reports only missing sections", () => {
    const markdown = [
      "# Context",
      "",
      "# Decision",
      "",
      "# Consequences",
      "",
    ].join("\n");

    expect(findMissingSections(markdown, ["Context", "Decision", "Follow-up actions"])).toEqual([
      "Follow-up actions",
    ]);
  });

  it("returns the exact section body and stops at the next heading", () => {
    const markdown = [
      "# Context",
      "",
      "Line one.",
      "Line two.",
      "",
      "# Decision",
      "",
      "Decision text.",
      "",
    ].join("\n");

    expect(getSection(markdown, "Context")).toBe("Line one.\nLine two.");
  });

  it("extracts only bullet items from a section", () => {
    const markdown = [
      "# Active assumptions",
      "",
      "- First item",
      "Ignored paragraph",
      "- Second item",
      "",
    ].join("\n");

    expect(extractBulletItems(markdown, "Active assumptions")).toEqual([
      "First item",
      "Second item",
    ]);
  });

  it("parses only correctly formatted assumptions", () => {
    const markdown = [
      "# Assumptions",
      "",
      "## Active assumptions",
      "",
      "- `A-001`: First assumption.",
      "- Invalid assumption",
      "- `A-002`: Second assumption.",
      "",
    ].join("\n");

    expect(parseAssumptions(markdown)).toEqual([
      { id: "A-001", text: "First assumption." },
      { id: "A-002", text: "Second assumption." },
    ]);
  });

  it("parses glossary terms and tolerates missing notes", () => {
    const markdown = [
      "# Glossary",
      "",
      "## Artefact",
      "",
      "- Definition: Repository item.",
      "- Notes / usage constraints: Keep it canonical.",
      "",
      "## Tranche",
      "",
      "- Definition: Bounded work unit.",
      "",
    ].join("\n");

    expect(parseGlossary(markdown)).toEqual([
      {
        term: "Artefact",
        definition: "Repository item.",
        notes: "Keep it canonical.",
      },
      {
        term: "Tranche",
        definition: "Bounded work unit.",
        notes: "",
      },
    ]);
  });
});
