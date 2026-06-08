import { z } from "zod";
import type { NormalizedSlice } from "./schema";

export type Env = Record<string, string | undefined>;
export type Repo = { owner: string; repo: string };
export type GithubConfig = Repo & { apiBase: string; token: string };

const IssueState = z.preprocess((value) => typeof value === "string" ? value.toLowerCase() : value, z.enum(["open", "closed"]));
const LabelResponse = z.object({ name: z.string() });
const IssueResponse = z.object({ number: z.number().int().positive(), html_url: z.string().optional() });
const IssueSnapshotResponse = IssueResponse.extend({ title: z.string(), state: IssueState });
const IssueListItemResponse = IssueSnapshotResponse.extend({ labels: z.array(LabelResponse), pull_request: z.unknown().optional() });

export function apiBase(env: Env): string {
  return (env.GITHUB_API_URL?.trim() || "https://api.github.com").replace(/\/+$/, "");
}

export async function resolveToken(env: Env): Promise<string | undefined> {
  const fromEnv = [env.WORKLOG_GITHUB_TOKEN, env.GH_TOKEN, env.GITHUB_TOKEN].map((value) => value?.trim()).find((value) => value);
  if (fromEnv) return fromEnv;
  const gh = env.PATH === undefined ? Bun.which("gh") : Bun.which("gh", { PATH: env.PATH });
  if (!gh) return undefined;
  try {
    const proc = Bun.spawn([gh, "auth", "token"], { stdout: "pipe", stderr: "pipe", env });
    const out = (await new Response(proc.stdout).text()).trim();
    if ((await proc.exited) === 0 && out) return out;
  } catch {
    // fall through to undefined
  }
  return undefined;
}

export function parseRepoSpec(spec: string): Repo | undefined {
  const match = /^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/.exec(spec.trim());
  return match?.[1] && match[2] ? { owner: match[1], repo: match[2] } : undefined;
}

export function parseRepoUrl(url: string): Repo | undefined {
  const match = /github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(url.trim());
  return match?.[1] && match[2] ? { owner: match[1], repo: match[2] } : undefined;
}

export async function resolveRepo(cwd: string, env: Env): Promise<Repo | undefined> {
  const fromEnv = env.GITHUB_REPOSITORY?.trim();
  if (fromEnv) return parseRepoSpec(fromEnv);
  const git = env.PATH === undefined ? Bun.which("git") : Bun.which("git", { PATH: env.PATH });
  if (!git) return undefined;
  try {
    const proc = Bun.spawn([git, "-C", cwd, "remote", "get-url", "origin"], { stdout: "pipe", stderr: "pipe", env });
    const url = (await new Response(proc.stdout).text()).trim();
    if ((await proc.exited) === 0 && url) return parseRepoUrl(url);
  } catch {
    // fall through to undefined
  }
  return undefined;
}

export type IssuePayload = { title: string; body: string; state: "open" | "closed" };
export type IssueUpdate = { title: string; state: "open" | "closed" };
export type CreatedIssue = { number: number; url?: string };
export type IssueSnapshot = { number: number; title: string; state: "open" | "closed"; url?: string };
export type ReconcileIssue = IssueSnapshot & { labels: string[] };

function firstH1(body: string): string | undefined {
  for (const line of body.split("\n")) {
    const match = /^#\s+(.+)$/.exec(line.trim());
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function sliceIssuePayload(slice: NormalizedSlice, body: string): IssuePayload {
  const footer = [
    "---",
    "",
    "Managed by `wl sync --push`.",
    "",
    `- id: \`${slice.id}\``,
    `- mode: \`${slice.mode}\``,
    `- status: \`${slice.status}\``,
    `- covers: ${slice.covers.join(", ")}`,
    `- depends_on: ${slice.depends_on.length ? slice.depends_on.join(", ") : "—"}`,
    "",
    `<!-- wl-id: ${slice.id} -->`,
    "",
  ].join("\n");
  return {
    title: firstH1(body) ?? slice.id,
    body: `${body.replace(/\s*$/, "")}\n\n${footer}`,
    state: slice.status === "done" || slice.status === "dropped" ? "closed" : "open",
  };
}

async function ghFetch(config: GithubConfig, path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`${config.apiBase}/repos/${config.owner}/${config.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "wl",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText} ${detail}`.trim());
  }
  return res.json();
}

export async function createIssue(config: GithubConfig, payload: IssuePayload): Promise<CreatedIssue> {
  const body = await ghFetch(config, "/issues", { method: "POST", body: JSON.stringify(payload) });
  const parsed = IssueResponse.parse(body);
  return parsed.html_url === undefined ? { number: parsed.number } : { number: parsed.number, url: parsed.html_url };
}

export async function getIssue(config: GithubConfig, issue: number): Promise<IssueSnapshot> {
  const body = await ghFetch(config, `/issues/${issue}`, { method: "GET" });
  const parsed = IssueSnapshotResponse.parse(body);
  const snapshot = { number: parsed.number, title: parsed.title, state: parsed.state };
  return parsed.html_url === undefined ? snapshot : { ...snapshot, url: parsed.html_url };
}

export async function listWorklogSliceIssues(config: GithubConfig): Promise<ReconcileIssue[]> {
  const issues: ReconcileIssue[] = [];
  for (let page = 1; ; page += 1) {
    const body = await ghFetch(config, `/issues?state=all&labels=${encodeURIComponent("worklog,kind:slice")}&per_page=100&page=${page}`, { method: "GET" });
    const parsed = z.array(IssueListItemResponse).parse(body);
    for (const issue of parsed) {
      if (issue.pull_request !== undefined) continue;
      const labels = issue.labels.map((label) => label.name);
      if (!labels.includes("worklog") || !labels.includes("kind:slice")) continue;
      const snapshot = { number: issue.number, title: issue.title, state: issue.state, labels };
      issues.push(issue.html_url === undefined ? snapshot : { ...snapshot, url: issue.html_url });
    }
    if (parsed.length < 100) break;
  }
  return issues;
}

export async function updateIssue(config: GithubConfig, issue: number, payload: IssueUpdate): Promise<void> {
  await ghFetch(config, `/issues/${issue}`, { method: "PATCH", body: JSON.stringify(payload) });
}
