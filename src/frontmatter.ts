import { basename } from "node:path";

export type ParsedFrontmatter = {
  yaml: unknown;
  body: string;
  frontmatter: string;
  startLine: number;
  endLine: number;
};

export function parseFrontmatter(text: string): ParsedFrontmatter | undefined {
  if (!text.startsWith("---\n") && text !== "---") return undefined;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return undefined;
  const afterMarker = end + 4;
  const bodyStart = text[afterMarker] === "\n" ? afterMarker + 1 : afterMarker;
  const frontmatter = text.slice(4, end);
  try {
    return {
      yaml: Bun.YAML.parse(frontmatter),
      body: text.slice(bodyStart),
      frontmatter,
      startLine: 0,
      endLine: text.slice(0, end).split("\n").length,
    };
  } catch {
    return undefined;
  }
}

function scalar(value: string): string {
  return JSON.stringify(value);
}

function array(values: readonly string[]): string {
  return `[${values.join(", ")}]`;
}

export function serializeStory(input: { id: string; statement: string; tags: readonly string[] }): string {
  return [
    "---",
    `id: ${input.id}`,
    "kind: story",
    "status: active",
    `statement: ${scalar(input.statement)}`,
    `tags: ${array(input.tags)}`,
    "---",
    `# ${input.statement}`,
    "",
    "## Acceptance",
    "",
    "-",
    "",
  ].join("\n");
}

export function serializeSlice(input: { id: string; title: string; mode: string; covers: readonly string[]; depends_on: readonly string[]; tags: readonly string[] }): string {
  return [
    "---",
    `id: ${input.id}`,
    "kind: slice",
    "status: open",
    `mode: ${input.mode}`,
    `covers: ${array(input.covers)}`,
    `depends_on: ${array(input.depends_on)}`,
    `tags: ${array(input.tags)}`,
    "---",
    `# ${input.title}`,
    "",
    "## Goal",
    "",
    "## Verification",
    "",
    "-",
    "",
  ].join("\n");
}

export function rewriteScalar(text: string, key: string, value: string): string | undefined {
  const parsed = parseFrontmatter(text);
  if (!parsed) return undefined;
  const lines = text.split("\n");
  for (let index = 1; index < parsed.endLine; index += 1) {
    if (lines[index]?.match(new RegExp(`^${key}:`))) {
      lines[index] = `${key}: ${value}`;
      return lines.join("\n");
    }
  }
  return undefined;
}

export function upsertScalar(text: string, key: string, value: string): string | undefined {
  const rewritten = rewriteScalar(text, key, value);
  if (rewritten) return rewritten;
  const parsed = parseFrontmatter(text);
  if (!parsed) return undefined;
  const lines = text.split("\n");
  lines.splice(parsed.endLine, 0, `${key}: ${value}`);
  return lines.join("\n");
}

export function rewriteList(text: string, key: string, values: readonly string[]): string | undefined {
  const parsed = parseFrontmatter(text);
  if (!parsed) return undefined;
  const lines = text.split("\n");
  for (let index = 1; index < parsed.endLine; index += 1) {
    const line = lines[index];
    if (line?.match(new RegExp(`^${key}:`))) {
      const isBlockList = line.trim() === `${key}:` && lines[index + 1]?.match(/^\s+-\s/);
      if (isBlockList && values.length > 0) {
        const indent = /^\s*/.exec(lines[index + 1] ?? "")?.[0] ?? "  ";
        let end = index + 1;
        while (end < parsed.endLine && lines[end]?.match(/^\s+-\s/)) end += 1;
        lines.splice(index + 1, end - index - 1, ...values.map((value) => `${indent}- ${value}`));
        return lines.join("\n");
      }
      lines[index] = `${key}: ${array(values)}`;
      return lines.join("\n");
    }
  }
  return undefined;
}

export function displayFile(workDir: string, file: string): string {
  return `.work/${basename(file)}`;
}
