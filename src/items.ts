import { basename } from "node:path";
import { Item, type NormalizedItem, type NormalizedSlice } from "./schema";
import { parseFrontmatter, displayFile } from "./frontmatter";
import { idFromFilename } from "./ids";
import { listMarkdownFiles, readText } from "./fs";

export type LoadedItem = {
  item: NormalizedItem;
  path: string;
  body: string;
  text: string;
};

export type LoadIssue = { file: string; id?: string; problem: string; warning?: boolean };

function issue(input: { file: string; id?: string | undefined; problem: string; warning?: boolean }): LoadIssue {
  return input.id === undefined
    ? { file: input.file, problem: input.problem, ...(input.warning === undefined ? {} : { warning: input.warning }) }
    : { file: input.file, id: input.id, problem: input.problem, ...(input.warning === undefined ? {} : { warning: input.warning }) };
}

function kindRank(item: NormalizedItem): number {
  return item.kind === "story" ? 0 : 1;
}

export function sortItems<T extends NormalizedItem>(items: T[]): T[] {
  return items.sort((a, b) => kindRank(a) - kindRank(b) || a.id.localeCompare(b.id));
}

function sortLoadedItems(items: LoadedItem[]): LoadedItem[] {
  return items.sort((a, b) => kindRank(a.item) - kindRank(b.item) || a.item.id.localeCompare(b.item.id));
}

export async function loadItems(workDir: string): Promise<LoadedItem[]> {
  return (await loadItemsWithIssues(workDir)).items;
}

export async function loadItemsWithIssues(workDir: string): Promise<{ items: LoadedItem[]; issues: LoadIssue[] }> {
  const files = await listMarkdownFiles(workDir);
  const raw: Array<{ parsed: LoadedItem; depends: string[] }> = [];
  const issues: LoadIssue[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const text = await readText(file);
    const parsed = parseFrontmatter(text);
    if (!parsed) {
      issues.push({ file, problem: "missing or invalid frontmatter" });
      continue;
    }
    const result = Item.safeParse(parsed.yaml);
    if (!result.success) {
      issues.push({ file, problem: `schema violation: ${result.error.issues.map((issue) => issue.path.join(".") || issue.message).join(", ")}` });
      continue;
    }
    const frontmatterId = result.data.id;
    const fileId = idFromFilename(basename(file));
    if (fileId !== frontmatterId) issues.push({ file, id: frontmatterId, problem: "filename does not start with frontmatter id" });
    const duplicate = seen.get(frontmatterId);
    if (duplicate) issues.push({ file, id: frontmatterId, problem: `duplicate id also in ${duplicate}` });
    seen.set(frontmatterId, file);

    if (result.data.kind === "story") {
      const firstLine = parsed.body.split("\n")[0] ?? "";
      if (firstLine !== `# ${result.data.statement}`) issues.push({ file, id: frontmatterId, problem: "story H1 does not match statement", warning: true });
      raw.push({ parsed: { item: { ...result.data, file: displayFile(workDir, file) }, path: file, body: parsed.body, text }, depends: [] });
    } else {
      raw.push({ parsed: { item: { ...result.data, file: displayFile(workDir, file), ready: false, blocked: false }, path: file, body: parsed.body, text }, depends: result.data.depends_on });
    }
  }

  const byId = new Map(raw.map(({ parsed }) => [parsed.item.id, parsed.item]));
  for (const { parsed } of raw) {
    if (parsed.item.kind !== "slice") continue;
    for (const storyId of parsed.item.covers) {
      if (byId.get(storyId)?.kind !== "story") issues.push({ file: parsed.path, id: parsed.item.id, problem: `covers missing story ${storyId}` });
    }
    for (const sliceId of parsed.item.depends_on) {
      if (byId.get(sliceId)?.kind !== "slice") issues.push({ file: parsed.path, id: parsed.item.id, problem: `depends_on missing slice ${sliceId}` });
    }
  }

  for (const { parsed } of raw) {
    if (parsed.item.kind !== "slice") continue;
    const unresolved = parsed.item.depends_on.filter((id) => {
      const dependency = byId.get(id);
      return dependency?.kind !== "slice" || dependency.status !== "done";
    });
    parsed.item.ready = parsed.item.status === "open" && unresolved.length === 0;
    parsed.item.blocked = parsed.item.status === "open" && unresolved.length > 0;
  }

  for (const cycle of findCycles(raw.map(({ parsed }) => parsed.item).filter((item): item is NormalizedSlice => item.kind === "slice"))) {
    issues.push(issue({ file: seen.get(cycle[0] ?? "") ?? workDir, id: cycle[0], problem: `depends_on cycle: ${cycle.join(" -> ")}` }));
  }

  return { items: sortLoadedItems(raw.map(({ parsed }) => parsed)), issues };
}

export function findCycles(slices: readonly NormalizedSlice[]): string[][] {
  const deps = new Map(slices.map((slice) => [slice.id, slice.depends_on]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];
  const visit = (id: string, path: string[]): void => {
    if (visiting.has(id)) {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) if (deps.has(dep)) visit(dep, [...path, dep]);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of deps.keys()) visit(id, [id]);
  return cycles;
}

export function unresolvedDependencies(slice: NormalizedSlice, items: readonly NormalizedItem[]): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return slice.depends_on.filter((id) => byId.get(id)?.kind !== "slice" || byId.get(id)?.status !== "done");
}

export function resolveItem(input: string, items: readonly LoadedItem[]): LoadedItem | { candidates: LoadedItem[] } | undefined {
  const exact = items.find((entry) => entry.item.id === input);
  if (exact) return exact;
  if (/^[0-9a-f]{6}$/.test(input)) {
    const candidates = items.filter((entry) => entry.item.id.endsWith(input));
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) return { candidates };
  }
  return undefined;
}
