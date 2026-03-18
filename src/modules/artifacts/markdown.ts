export function collectHeadings(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => /^#{1,6}\s+(.+)$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1].trim());
}

export function findMissingSections(
  markdown: string,
  requiredSections: readonly string[],
): string[] {
  const headings = new Set(collectHeadings(markdown));
  return requiredSections.filter((section) => !headings.has(section));
}

export function getSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inside = false;

  for (const line of lines) {
    const match = /^#{1,6}\s+(.+)$/.exec(line.trim());

    if (match) {
      if (inside) {
        break;
      }

      inside = match[1].trim() === heading;
      continue;
    }

    if (inside) {
      output.push(line);
    }
  }

  return output.join("\n").trim();
}

export function extractBulletItems(markdown: string, heading: string): string[] {
  return getSection(markdown, heading)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

export interface ParsedAssumption {
  id: string;
  text: string;
}

export function parseAssumptions(markdown: string): ParsedAssumption[] {
  return extractBulletItems(markdown, "Active assumptions")
    .map((line) => /^`([^`]+)`: (.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({
      id: match[1],
      text: match[2],
    }));
}

export interface ParsedGlossaryTerm {
  term: string;
  definition: string;
  notes: string;
}

export function parseGlossary(markdown: string): ParsedGlossaryTerm[] {
  const sections = markdown.split(/^##\s+/m).slice(1);

  return sections
    .map((section) => {
      const lines = section.split("\n");
      const term = lines[0]?.trim();

      if (!term) {
        return null;
      }

      const bullets = new Map<string, string>();

      for (const line of lines.slice(1)) {
        const match = /^- ([^:]+): (.+)$/.exec(line.trim());

        if (match) {
          bullets.set(match[1], match[2]);
        }
      }

      return {
        term,
        definition: bullets.get("Definition") ?? "",
        notes: bullets.get("Notes / usage constraints") ?? "",
      };
    })
    .filter((item): item is ParsedGlossaryTerm => item !== null);
}
