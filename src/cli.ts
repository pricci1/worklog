import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolveWorkDir, initWorkDir, writeText } from "./fs";
import { allocateId, itemPath } from "./ids";
import { slugify } from "./slug";
import { serializeStory, serializeSlice, rewriteScalar, rewriteList } from "./frontmatter";
import { loadItems, loadItemsWithIssues, resolveItem, sortItems, unresolvedDependencies, findCycles } from "./items";
import { Mode, SliceStatus, StoryStatus, type NormalizedItem, type NormalizedSlice } from "./schema";

type IO = { stdout: (text: string) => void; stderr: (text: string) => void; cwd: string; env: Record<string, string | undefined> };

const defaultIO: IO = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  env: process.env,
};

function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
}

function workDirOrError(io: IO): string | undefined {
  const dir = resolveWorkDir(io.cwd, io.env);
  if (!dir) io.stderr("No .work directory found. Run `wl init` first.\n");
  return dir;
}

function json(items: readonly NormalizedItem[]): string {
  return `${JSON.stringify(items, null, 2)}\n`;
}

function table(items: readonly NormalizedItem[]): string {
  if (items.length === 0) return "";
  return `${items.map((item) => [item.id, item.kind, item.status, item.kind === "slice" ? item.mode : "", item.kind === "story" ? item.statement : item.file].filter(Boolean).join("\t")).join("\n")}\n`;
}

function parseOptions(args: string[], options: Record<string, { type: "string" | "boolean"; multiple?: boolean }>) {
  return parseArgs({ args, options, strict: true, allowPositionals: true });
}

function stringValue(value: string | boolean | Array<string | boolean> | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

async function cmdInit(io: IO): Promise<number> {
  await initWorkDir(io.cwd);
  return 0;
}

async function cmdNew(args: string[], io: IO): Promise<number> {
  const sub = args[0];
  const workDir = workDirOrError(io);
  if (!workDir) return 1;
  await mkdir(workDir, { recursive: true });
  if (sub === "story") {
    const parsed = parseOptions(args.slice(1), { statement: { type: "string" }, tags: { type: "string" } });
    const statement = String(parsed.values.statement ?? "").trim();
    if (!statement) {
      io.stderr("--statement is required\n");
      return 1;
    }
    const id = await allocateId("us", workDir);
    await writeText(itemPath(workDir, id, slugify(statement)), serializeStory({ id, statement, tags: parseCsv(stringValue(parsed.values.tags)) }));
    io.stdout(`${id}\n`);
    return 0;
  }
  if (sub === "slice") {
    const parsed = parseOptions(args.slice(1), { title: { type: "string" }, mode: { type: "string" }, covers: { type: "string" }, "depends-on": { type: "string" }, tags: { type: "string" } });
    const title = String(parsed.values.title ?? "").trim();
    const mode = Mode.safeParse(parsed.values.mode);
    const covers = parseCsv(stringValue(parsed.values.covers));
    const depends_on = parseCsv(stringValue(parsed.values["depends-on"]));
    if (!title || !mode.success || covers.length === 0) {
      io.stderr("--title, --mode AFK|HITL, and --covers are required\n");
      return 1;
    }
    const loaded = await loadItems(workDir);
    const byId = new Map(loaded.map((entry) => [entry.item.id, entry.item]));
    for (const id of covers) if (byId.get(id)?.kind !== "story") { io.stderr(`Unknown story ${id}\n`); return 1; }
    for (const id of depends_on) if (byId.get(id)?.kind !== "slice") { io.stderr(`Unknown slice ${id}\n`); return 1; }
    const id = await allocateId("sl", workDir);
    await writeText(itemPath(workDir, id, slugify(title)), serializeSlice({ id, title, mode: mode.data, covers, depends_on, tags: parseCsv(stringValue(parsed.values.tags)) }));
    io.stdout(`${id}\n`);
    return 0;
  }
  io.stderr("Usage: wl new story|slice ...\n");
  return 1;
}

async function filteredItems(args: string[], io: IO): Promise<{ items: NormalizedItem[]; json: boolean } | undefined> {
  const dir = workDirOrError(io);
  if (!dir) return undefined;
  const parsed = parseOptions(args, { kind: { type: "string" }, status: { type: "string" }, tag: { type: "string" }, mode: { type: "string" }, json: { type: "boolean" } });
  let items = (await loadItems(dir)).map((entry) => entry.item);
  if (parsed.values.kind) items = items.filter((item) => item.kind === parsed.values.kind);
  if (parsed.values.status) items = items.filter((item) => item.status === parsed.values.status);
  if (parsed.values.tag) items = items.filter((item) => item.tags.includes(String(parsed.values.tag)));
  if (parsed.values.mode) items = items.filter((item) => item.kind === "slice" && item.mode === parsed.values.mode);
  return { items: sortItems(items), json: Boolean(parsed.values.json) };
}

async function cmdList(args: string[], io: IO): Promise<number> {
  const result = await filteredItems(args, io);
  if (!result) return 1;
  io.stdout(result.json ? json(result.items) : table(result.items));
  return 0;
}

async function cmdShow(args: string[], io: IO): Promise<number> {
  const dir = workDirOrError(io);
  if (!dir) return 1;
  const parsed = parseOptions(args, { json: { type: "boolean" } });
  const id = parsed.positionals[0];
  if (!id) { io.stderr("Usage: wl show <id> [--json]\n"); return 1; }
  const resolved = resolveItem(id, await loadItems(dir));
  if (!resolved) { io.stderr(`Item not found: ${id}\n`); return 1; }
  if ("candidates" in resolved) { io.stderr(`Ambiguous id ${id}: ${resolved.candidates.map((entry) => entry.item.id).join(", ")}\n`); return 1; }
  io.stdout(parsed.values.json ? `${JSON.stringify(resolved.item, null, 2)}\n` : resolved.text);
  return 0;
}

async function mutateResolved(id: string, io: IO, mutate: (entry: Awaited<ReturnType<typeof loadItems>>[number]) => string | undefined): Promise<number> {
  const dir = workDirOrError(io);
  if (!dir) return 1;
  const resolved = resolveItem(id, await loadItems(dir));
  if (!resolved) { io.stderr(`Item not found: ${id}\n`); return 1; }
  if ("candidates" in resolved) { io.stderr(`Ambiguous id ${id}: ${resolved.candidates.map((entry) => entry.item.id).join(", ")}\n`); return 1; }
  const next = mutate(resolved);
  if (!next) return 1;
  await writeText(resolved.path, next);
  return 0;
}

async function cmdStatus(args: string[], io: IO): Promise<number> {
  const [id, status] = args;
  if (!id || !status) { io.stderr("Usage: wl status <id> <status>\n"); return 1; }
  return await mutateResolved(id, io, (entry) => {
    const ok = entry.item.kind === "story" ? StoryStatus.safeParse(status).success : SliceStatus.safeParse(status).success;
    if (!ok) { io.stderr(`Invalid status for ${entry.item.kind}: ${status}\n`); return undefined; }
    const next = rewriteScalar(entry.text, "status", status);
    if (!next) io.stderr("Missing status line\n");
    return next;
  });
}

async function cmdMode(args: string[], io: IO): Promise<number> {
  const [id, mode] = args;
  if (!id || !mode) { io.stderr("Usage: wl mode <id> AFK|HITL\n"); return 1; }
  const parsed = Mode.safeParse(mode);
  if (!parsed.success) { io.stderr(`Invalid mode: ${mode}\n`); return 1; }
  return await mutateResolved(id, io, (entry) => {
    if (entry.item.kind !== "slice") { io.stderr("mode applies only to slices\n"); return undefined; }
    const next = rewriteScalar(entry.text, "mode", parsed.data);
    if (!next) io.stderr("Missing mode line\n");
    return next;
  });
}

async function cmdLink(args: string[], io: IO, link: boolean): Promise<number> {
  const sliceId = args[0];
  if (!sliceId) { io.stderr(`Usage: wl ${link ? "link" : "unlink"} <slice-id> --covers <us-id> | --depends-on <sl-id>\n`); return 1; }
  const parsed = parseOptions(args.slice(1), { covers: { type: "string" }, "depends-on": { type: "string" } });
  const covers = parsed.values.covers;
  const dependsOn = parsed.values["depends-on"];
  const key = covers ? "covers" : dependsOn ? "depends_on" : undefined;
  const ref = String(covers ?? dependsOn ?? "");
  const dir = workDirOrError(io);
  if (!dir || !key || !ref) { io.stderr("Provide exactly one of --covers or --depends-on\n"); return 1; }
  const loaded = await loadItems(dir);
  const target = resolveItem(sliceId, loaded);
  if (!target || "candidates" in target || target.item.kind !== "slice") { io.stderr(`Slice not found: ${sliceId}\n`); return 1; }
  const byId = new Map(loaded.map((entry) => [entry.item.id, entry.item]));
  if (key === "covers" && byId.get(ref)?.kind !== "story") { io.stderr(`Story not found: ${ref}\n`); return 1; }
  if (key === "depends_on" && byId.get(ref)?.kind !== "slice") { io.stderr(`Slice not found: ${ref}\n`); return 1; }
  if (key === "depends_on" && ref === target.item.id) { io.stderr("Self-dependency is not allowed\n"); return 1; }
  const current = key === "covers" ? target.item.covers : target.item.depends_on;
  const nextValues = link ? [...new Set([...current, ref])] : current.filter((value) => value !== ref);
  if (key === "depends_on") {
    const slices = loaded.map((entry) => entry.item).filter((item): item is NormalizedSlice => item.kind === "slice").map((slice) => slice.id === target.item.id ? { ...slice, depends_on: nextValues } : slice);
    if (findCycles(slices).length > 0) { io.stderr("depends_on cycle rejected\n"); return 1; }
  }
  const next = rewriteList(target.text, key, nextValues);
  if (!next) { io.stderr(`Missing ${key} line\n`); return 1; }
  await writeText(target.path, next);
  return 0;
}

async function cmdReadyBlocked(args: string[], io: IO, blocked: boolean): Promise<number> {
  const result = await filteredItems(args, io);
  if (!result) return 1;
  let items = result.items.filter((item): item is NormalizedSlice => item.kind === "slice" && (blocked ? item.blocked : item.ready));
  if (blocked && !result.json) {
    const all = result.items;
    io.stdout(`${items.map((item) => `${item.id}\t${unresolvedDependencies(item, all).join(",")}`).join("\n")}${items.length ? "\n" : ""}`);
  } else {
    io.stdout(result.json ? json(items) : table(items));
  }
  return 0;
}

async function cmdQuery(args: string[], io: IO): Promise<number> {
  const dir = workDirOrError(io);
  if (!dir) return 1;
  const data = json((await loadItems(dir)).map((entry) => entry.item));
  const filter = args.join(" ").trim();
  if (!filter) { io.stdout(data); return 0; }
  const jq = io.env.PATH === undefined ? Bun.which("jq") : Bun.which("jq", { PATH: io.env.PATH });
  if (!jq) {
    io.stderr("jq not found on PATH\n");
    return 1;
  }
  const proc = Bun.spawn([jq, filter], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: io.env });
  proc.stdin.write(data);
  proc.stdin.end();
  io.stdout(await new Response(proc.stdout).text());
  io.stderr(await new Response(proc.stderr).text());
  return await proc.exited;
}

async function cmdLint(io: IO): Promise<number> {
  const dir = workDirOrError(io);
  if (!dir) return 1;
  const { issues } = await loadItemsWithIssues(dir);
  const errors = issues.filter((issue) => !issue.warning);
  for (const issue of issues) io.stderr(`${issue.warning ? "warning" : "error"}: ${issue.file}${issue.id ? ` ${issue.id}` : ""}: ${issue.problem}\n`);
  return errors.length === 0 ? 0 : 1;
}

async function cmdEdit(args: string[], io: IO): Promise<number> {
  const dir = workDirOrError(io);
  if (!dir) return 1;
  const id = args[0];
  if (!id) { io.stderr("Usage: wl edit <id>\n"); return 1; }
  const resolved = resolveItem(id, await loadItems(dir));
  if (!resolved || "candidates" in resolved) { io.stderr(`Item not found or ambiguous: ${id}\n`); return 1; }
  return await Bun.spawn([io.env.EDITOR ?? "vi", resolved.path], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited;
}

export async function cli(argv = Bun.argv.slice(2), io: IO = defaultIO): Promise<number> {
  try {
    const [command, ...args] = argv;
    switch (command) {
      case "init": return await cmdInit(io);
      case "new": return await cmdNew(args, io);
      case "list": return await cmdList(args, io);
      case "show": return await cmdShow(args, io);
      case "edit": return await cmdEdit(args, io);
      case "status": return await cmdStatus(args, io);
      case "mode": return await cmdMode(args, io);
      case "link": return await cmdLink(args, io, true);
      case "unlink": return await cmdLink(args, io, false);
      case "ready": return await cmdReadyBlocked(args, io, false);
      case "blocked": return await cmdReadyBlocked(args, io, true);
      case "query": return await cmdQuery(args, io);
      case "lint": return await cmdLint(io);
      default:
        io.stderr("Usage: wl <command>\n");
        return 1;
    }
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
