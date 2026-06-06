import { parseArgs } from "node:util";
import { mkdir } from "node:fs/promises";
import { resolveWorkDir, initWorkDir, writeText } from "./fs";
import { allocateId, itemPath } from "./ids";
import { slugify } from "./slug";
import { serializeStory, serializeSlice, rewriteScalar, rewriteList, upsertScalar } from "./frontmatter";
import { loadItems, loadItemsWithIssues, resolveItem, sortItems, unresolvedDependencies, findCycles } from "./items";
import { apiBase, createIssue, parseRepoSpec, resolveRepo, resolveToken, sliceIssuePayload, updateIssue, type GithubConfig } from "./github";
import { Mode, SliceStatus, StoryStatus, type NormalizedItem, type NormalizedSlice } from "./schema";
import { commandHelp, commandNames, mainHelp, usageLine, VERSION } from "./help";

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

function usageError(io: IO, command: string, message: string): number {
  io.stderr(`${message}\nUsage: ${usageLine(command)}\nRun \`wl ${command} --help\` for details.\n`);
  return 1;
}

async function cmdNew(args: string[], io: IO): Promise<number> {
  const sub = args[0];
  const workDir = workDirOrError(io);
  if (!workDir) return 1;
  await mkdir(workDir, { recursive: true });
  if (sub === "story") {
    const parsed = parseOptions(args.slice(1), { statement: { type: "string" }, tags: { type: "string" } });
    const statement = String(parsed.values.statement ?? "").trim();
    if (!statement) return usageError(io, "new", "--statement is required and must be non-empty");
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
    if (!title) return usageError(io, "new", "--title is required and must be non-empty");
    if (!mode.success) return usageError(io, "new", "--mode must be AFK or HITL");
    if (covers.length === 0) return usageError(io, "new", "--covers is required and must list at least one story ID");
    const loaded = await loadItems(workDir);
    const byId = new Map(loaded.map((entry) => [entry.item.id, entry.item]));
    for (const id of covers) if (byId.get(id)?.kind !== "story") { io.stderr(`Unknown story: ${id}\n`); return 1; }
    for (const id of depends_on) if (byId.get(id)?.kind !== "slice") { io.stderr(`Unknown slice: ${id}\n`); return 1; }
    const id = await allocateId("sl", workDir);
    await writeText(itemPath(workDir, id, slugify(title)), serializeSlice({ id, title, mode: mode.data, covers, depends_on, tags: parseCsv(stringValue(parsed.values.tags)) }));
    io.stdout(`${id}\n`);
    return 0;
  }
  return usageError(io, "new", sub ? `Unknown kind: ${sub} (expected story or slice)` : "Specify story or slice");
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
  if (!id) return usageError(io, "show", "<id> is required");
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
  if (!id || !status) return usageError(io, "status", "<id> and <status> are required");
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
  if (!id || !mode) return usageError(io, "mode", "<id> and AFK|HITL are required");
  const parsed = Mode.safeParse(mode);
  if (!parsed.success) return usageError(io, "mode", `Invalid mode: ${mode} (expected AFK or HITL)`);
  return await mutateResolved(id, io, (entry) => {
    if (entry.item.kind !== "slice") { io.stderr("mode applies only to slices\n"); return undefined; }
    const next = rewriteScalar(entry.text, "mode", parsed.data);
    if (!next) io.stderr("Missing mode line\n");
    return next;
  });
}

async function cmdLink(args: string[], io: IO, link: boolean): Promise<number> {
  const name = link ? "link" : "unlink";
  const sliceId = args[0];
  if (!sliceId) return usageError(io, name, "<slice-id> is required");
  const parsed = parseOptions(args.slice(1), { covers: { type: "string" }, "depends-on": { type: "string" } });
  const covers = parsed.values.covers;
  const dependsOn = parsed.values["depends-on"];
  const key = covers ? "covers" : dependsOn ? "depends_on" : undefined;
  const ref = String(covers ?? dependsOn ?? "");
  const dir = workDirOrError(io);
  if (!dir) return 1;
  if (!key || !ref) return usageError(io, name, "Provide exactly one of --covers <us-id> or --depends-on <sl-id>");
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

async function cmdSync(args: string[], io: IO): Promise<number> {
  const parsed = parseOptions(args, { push: { type: "boolean" }, "dry-run": { type: "boolean" }, repo: { type: "string" } });
  if (!parsed.values.push) return usageError(io, "sync", "--push is required");
  const dir = workDirOrError(io);
  if (!dir) return 1;
  const { items, issues } = await loadItemsWithIssues(dir);
  const errors = issues.filter((issue) => !issue.warning);
  if (errors.length > 0) {
    for (const issue of errors) io.stderr(`error: ${issue.file}${issue.id ? ` ${issue.id}` : ""}: ${issue.problem}\n`);
    io.stderr("Fix lint errors before syncing.\n");
    return 1;
  }
  const slices = items.filter((entry): entry is typeof entry & { item: NormalizedSlice } => entry.item.kind === "slice");
  const dryRun = Boolean(parsed.values["dry-run"]);

  if (dryRun) {
    for (const { item } of slices) io.stdout(`${item.id} would ${item.issue ? `update #${item.issue}` : "create"}\n`);
    return 0;
  }

  const token = await resolveToken(io.env);
  if (!token) return usageError(io, "sync", "No GitHub token found. Set WORKLOG_GITHUB_TOKEN (or GH_TOKEN/GITHUB_TOKEN) or authenticate with `gh auth login`.");
  const repoSpec = stringValue(parsed.values.repo);
  const repo = repoSpec ? parseRepoSpec(repoSpec) : await resolveRepo(io.cwd, io.env);
  if (!repo) return usageError(io, "sync", "Could not determine GitHub repo. Pass --repo owner/name or set GITHUB_REPOSITORY.");
  const config: GithubConfig = { apiBase: apiBase(io.env), token, ...repo };

  let failed = 0;
  for (const { item, path, body } of slices) {
    const payload = sliceIssuePayload(item, body);
    try {
      if (item.issue) {
        await updateIssue(config, item.issue, payload);
        io.stdout(`${item.id} updated #${item.issue}\n`);
      } else {
        const number = await createIssue(config, payload);
        const next = upsertScalar(await Bun.file(path).text(), "issue", String(number));
        if (!next) {
          io.stderr(`${item.id} created #${number} but failed to write issue field: missing frontmatter\n`);
          failed += 1;
          continue;
        }
        await writeText(path, next);
        io.stdout(`${item.id} created #${number}\n`);
      }
    } catch (error) {
      io.stderr(`${item.id} failed: ${error instanceof Error ? error.message : String(error)}\n`);
      failed += 1;
    }
  }
  return failed === 0 ? 0 : 1;
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
  if (!id) return usageError(io, "edit", "<id> is required");
  const resolved = resolveItem(id, await loadItems(dir));
  if (!resolved || "candidates" in resolved) { io.stderr(`Item not found or ambiguous: ${id}\n`); return 1; }
  return await Bun.spawn([io.env.EDITOR ?? "vi", resolved.path], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited;
}

function hasHelpFlag(args: readonly string[]): boolean {
  return args.some((arg) => arg === "--help" || arg === "-h");
}

function showHelp(io: IO, command: string | undefined): number {
  const text = command ? commandHelp(command) : undefined;
  io.stdout(text ?? mainHelp());
  return 0;
}

export async function cli(argv = Bun.argv.slice(2), io: IO = defaultIO): Promise<number> {
  try {
    if (argv.length === 0) return showHelp(io, undefined);
    const [command, ...args] = argv;
    if (command === "--help" || command === "-h" || command === "help") return showHelp(io, args[0]);
    if (command === "--version" || command === "-V") { io.stdout(`${VERSION}\n`); return 0; }
    if (hasHelpFlag(args) && command !== "query") return showHelp(io, command);
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
      case "sync": return await cmdSync(args, io);
      case "lint": return await cmdLint(io);
      default:
        io.stderr(`Unknown command: ${command}\nKnown commands: ${commandNames().join(", ")}\nRun \`wl --help\` for usage.\n`);
        return 1;
    }
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
}
