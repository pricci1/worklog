import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
type Server = ReturnType<typeof Bun.serve>;
import { parseRepoUrl, parseRepoSpec, resolveToken, sliceIssuePayload } from "../src/github";
import { upsertScalar } from "../src/frontmatter";
import type { NormalizedSlice } from "../src/schema";
import { put, read, run, slice, story, tempRepo } from "./helpers";

type Recorded = { method: string; path: string; body: unknown };

function mockGithub(handlers: { create?: number } = {}): { server: Server; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const created = handlers.create ?? 101;
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const body = req.method === "GET" ? undefined : await req.json();
      calls.push({ method: req.method, path: url.pathname, body });
      if (req.method === "POST" && url.pathname.endsWith("/issues")) {
        return Response.json({ number: created }, { status: 201 });
      }
      if (req.method === "PATCH") {
        return Response.json({ number: created }, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { server, calls };
}

let active: Server | undefined;
afterEach(() => {
  active?.stop(true);
  active = undefined;
});

function syncEnv(server: Server): Record<string, string | undefined> {
  return {
    GITHUB_API_URL: `http://localhost:${server.port}`,
    GITHUB_TOKEN: "test-token",
    GITHUB_REPOSITORY: "octo/worklog",
  };
}

describe("wl sync --push", () => {
  test("creates an issue and writes the number back to frontmatter", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    const file = await put(repo, "sl-b22222-demo.md", slice());
    const { server, calls } = mockGithub({ create: 42 });
    active = server;

    const result = await run(repo, ["sync", "--push"], syncEnv(server));

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("sl-b22222 created #42\n");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.path).toBe("/repos/octo/worklog/issues");
    expect(await read(file)).toContain("issue: 42");
    const overlay = JSON.parse(await read(file.replace(/\.md$/, ".json")));
    expect(overlay).toMatchObject({ issue: 42, repo: "octo/worklog", remote: { state: "open" } });
    expect(typeof overlay.hash).toBe("string");
    expect(await read(join(repo, ".work", ".gitignore"))).toContain("*.json");
  });

  test("skips the GitHub call when the overlay hash matches the desired state", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    const file = await put(repo, "sl-b22222-demo.md", slice("sl-b22222", ["us-a11111"]).replace("tags: [orders, telegram]", "tags: [orders, telegram]\nissue: 55"));

    const firstServer = mockGithub({ create: 55 }).server;
    const first = await run(repo, ["sync", "--push"], syncEnv(firstServer));
    firstServer.stop(true);
    expect(first.code).toBe(0);
    expect(first.stdout).toBe("sl-b22222 updated #55\n");

    const { server, calls } = mockGithub({ create: 55 });
    active = server;
    const second = await run(repo, ["sync", "--push"], syncEnv(server));
    expect(second.code).toBe(0);
    expect(second.stdout).toBe("sl-b22222 up to date #55\n");
    expect(calls).toHaveLength(0);
    expect(file).toContain("sl-b22222");
  });

  test("updates the existing issue when issue field is present and forwards state", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-b22222-demo.md", `${slice("sl-b22222", ["us-a11111"], [], "done").replace("tags: [orders, telegram]", "tags: [orders, telegram]\nissue: 77")}`);
    const { server, calls } = mockGithub();
    active = server;

    const result = await run(repo, ["sync", "--push"], syncEnv(server));

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("sl-b22222 updated #77\n");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.path).toBe("/repos/octo/worklog/issues/77");
    expect((calls[0]?.body as { state: string }).state).toBe("closed");
  });

  test("--dry-run reports planned actions without auth or network", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-a00001-new.md", slice("sl-a00001"));
    await put(repo, "sl-b00002-known.md", slice("sl-b00002", ["us-a11111"]).replace("tags: [orders, telegram]", "tags: [orders, telegram]\nissue: 9"));

    const result = await run(repo, ["sync", "--push", "--dry-run"], { GITHUB_TOKEN: undefined, GH_TOKEN: undefined, PATH: "/tmp/wl-no-gh" });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("sl-a00001 would create");
    expect(result.stdout).toContain("sl-b00002 would update #9");
  });

  test("requires --push", async () => {
    const repo = await tempRepo();
    const result = await run(repo, ["sync"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--push is required");
  });

  test("fails clearly when no token can be resolved", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-b22222-demo.md", slice());

    const result = await run(repo, ["sync", "--push"], { GITHUB_TOKEN: undefined, GH_TOKEN: undefined, PATH: "/tmp/wl-no-gh" });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("No GitHub token found");
  });

  test("fails on lint errors before calling GitHub", async () => {
    const repo = await tempRepo();
    await put(repo, "sl-a00001-dangling.md", slice("sl-a00001", ["us-c33333"]));
    const { server, calls } = mockGithub();
    active = server;

    const result = await run(repo, ["sync", "--push"], syncEnv(server));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("covers missing story");
    expect(calls).toHaveLength(0);
  });

  test("a failing GitHub call returns exit 1 with a per-slice error", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-b22222-demo.md", slice());
    const server = Bun.serve({ port: 0, fetch: () => new Response("boom", { status: 422 }) });
    active = server;

    const result = await run(repo, ["sync", "--push"], syncEnv(server));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("sl-b22222 failed");
    expect(result.stderr).toContain("422");
  });
});

describe("github helpers", () => {
  test("parseRepoUrl handles ssh and https forms", () => {
    expect(parseRepoUrl("git@github.com:octo/worklog.git")).toEqual({ owner: "octo", repo: "worklog" });
    expect(parseRepoUrl("https://github.com/octo/worklog.git")).toEqual({ owner: "octo", repo: "worklog" });
    expect(parseRepoUrl("https://github.com/octo/worklog")).toEqual({ owner: "octo", repo: "worklog" });
    expect(parseRepoUrl("ssh://git@github.com/octo/worklog.git")).toEqual({ owner: "octo", repo: "worklog" });
    expect(parseRepoUrl("https://example.com/octo/worklog")).toBeUndefined();
  });

  test("resolveToken prefers WORKLOG_GITHUB_TOKEN over GH_TOKEN/GITHUB_TOKEN", async () => {
    expect(await resolveToken({ WORKLOG_GITHUB_TOKEN: "wl", GH_TOKEN: "gh", GITHUB_TOKEN: "gt" })).toBe("wl");
    expect(await resolveToken({ GH_TOKEN: "gh", GITHUB_TOKEN: "gt" })).toBe("gh");
    expect(await resolveToken({ GITHUB_TOKEN: "gt" })).toBe("gt");
    expect(await resolveToken({ WORKLOG_GITHUB_TOKEN: "  ", GITHUB_TOKEN: "gt" })).toBe("gt");
  });

  test("parseRepoSpec validates owner/name", () => {
    expect(parseRepoSpec("octo/worklog")).toEqual({ owner: "octo", repo: "worklog" });
    expect(parseRepoSpec("nope")).toBeUndefined();
  });

  test("sliceIssuePayload derives title, state, and marker", () => {
    const item: NormalizedSlice = { id: "sl-b22222", kind: "slice", status: "done", mode: "AFK", covers: ["us-a11111"], depends_on: [], tags: [], file: ".work/sl-b22222-demo.md", ready: false, blocked: false };
    const payload = sliceIssuePayload(item, "# Telegram notification\n\nbody text\n");
    expect(payload.title).toBe("Telegram notification");
    expect(payload.state).toBe("closed");
    expect(payload.body).toContain("body text");
    expect(payload.body).toContain("<!-- wl-id: sl-b22222 -->");
  });

  test("upsertScalar inserts a missing key before the closing delimiter", () => {
    const text = ["---", "id: sl-b22222", "kind: slice", "---", "# body", ""].join("\n");
    expect(upsertScalar(text, "issue", "12")).toBe(["---", "id: sl-b22222", "kind: slice", "issue: 12", "---", "# body", ""].join("\n"));
    expect(upsertScalar(text, "kind", "story")).toContain("kind: story");
  });
});
