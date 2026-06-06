import { z } from "zod";
import type { NormalizedSlice } from "./schema";

export type Env = Record<string, string | undefined>;
export type Repo = { owner: string; repo: string };
export type GithubConfig = Repo & { apiBase: string; token: string };

const IssueResponse = z.object({ number: z.number().int().positive() });

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

export async function createIssue(config: GithubConfig, payload: IssuePayload): Promise<number> {
  const body = await ghFetch(config, "/issues", { method: "POST", body: JSON.stringify(payload) });
  return IssueResponse.parse(body).number;
}

export async function updateIssue(config: GithubConfig, issue: number, payload: IssuePayload): Promise<void> {
  await ghFetch(config, `/issues/${issue}`, { method: "PATCH", body: JSON.stringify(payload) });
}
