import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { put, read, run, slice, story, tempRepo } from "./helpers";

describe("CLI creation and read commands", () => {
  test("init is idempotent and new story creates a slugged markdown file", async () => {
    const repo = await tempRepo();

    expect((await run(repo, ["init"])).code).toBe(0);
    const result = await run(repo, ["new", "story", "--statement", "Árbol pedido listo", "--tags", "orders, notify"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^us-[0-9a-f]{6}\n$/);
  });

  test("new slice validates covers and query emits documented JSON shape", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());

    const created = await run(repo, ["new", "slice", "--title", "Telegram notification", "--mode", "AFK", "--covers", "us-a11111"]);
    const queried = await run(repo, ["query"]);
    const data = JSON.parse(queried.stdout);

    expect(created.code).toBe(0);
    expect(data[0]).toMatchObject({ id: "us-a11111", kind: "story", file: ".work/us-a11111-story.md" });
    expect(data[1]).toMatchObject({ kind: "slice", status: "open", mode: "AFK", covers: ["us-a11111"], ready: true, blocked: false });
  });

  test("show resolves bare suffixes and reports ambiguous suffixes", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story("us-a11111"));
    await put(repo, "sl-a11111-slice.md", slice("sl-a11111", ["us-a11111"]));

    expect((await run(repo, ["show", "us-a11111"])).stdout).toContain("# Receive order notifications");
    const ambiguous = await run(repo, ["show", "a11111"]);
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.stderr).toContain("Ambiguous");
  });

  test("list applies AND filters and supports JSON output", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-a00001-afk.md", slice("sl-a00001"));
    await put(repo, "sl-b00002-hitl.md", slice("sl-b00002").replace("mode: AFK", "mode: HITL"));

    const table = await run(repo, ["list", "--kind", "slice", "--mode", "HITL", "--tag", "telegram"]);
    const json = await run(repo, ["list", "--kind", "slice", "--mode", "AFK", "--json"]);

    expect(table.stdout).toContain("sl-b00002\tslice\topen\tHITL");
    expect(table.stdout).not.toContain("sl-a00001");
    expect(JSON.parse(json.stdout).map((item: { id: string }) => item.id)).toEqual(["sl-a00001"]);
  });

  test("commands resolve WORKLOG_DIR relative to cwd", async () => {
    const repo = await mkdtemp(join(tmpdir(), "wl-env-"));
    await mkdir(join(repo, "custom"));
    await writeFile(join(repo, "custom", "us-a11111-story.md"), story(), "utf8");

    const result = await run(repo, ["query"], { WORKLOG_DIR: "custom" });

    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)[0]).toMatchObject({ id: "us-a11111" });
  });
});

describe("CLI mutation commands", () => {
  test("status, mode, link, and unlink preserve body content", async () => {
    const repo = await tempRepo();
    const file = await put(repo, "sl-b22222-demo.md", slice());
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "us-c33333-story.md", story("us-c33333", "Second story"));

    expect((await run(repo, ["status", "sl-b22222", "doing"])).code).toBe(0);
    expect((await run(repo, ["mode", "sl-b22222", "HITL"])).code).toBe(0);
    expect((await run(repo, ["link", "sl-b22222", "--covers", "us-c33333"])).code).toBe(0);
    expect((await run(repo, ["unlink", "sl-b22222", "--covers", "us-a11111"])).code).toBe(0);

    expect(await read(file)).toContain("status: doing\nmode: HITL\ncovers: [us-c33333]\ndepends_on: []");
    expect(await read(file)).toContain("implementation detail");
  });

  test("link rejects self-dependencies and dependency cycles", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-a00001-one.md", slice("sl-a00001"));
    await put(repo, "sl-b00002-two.md", slice("sl-b00002", ["us-a11111"], ["sl-a00001"]));

    expect((await run(repo, ["link", "sl-a00001", "--depends-on", "sl-a00001"])).code).toBe(1);
    expect((await run(repo, ["link", "sl-a00001", "--depends-on", "sl-b00002"])).code).toBe(1);
  });

  test("validation errors return exit code 1", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-b22222-demo.md", slice());

    expect((await run(repo, ["new", "story"])).code).toBe(1);
    expect((await run(repo, ["new", "slice", "--title", "Bad", "--mode", "AFK", "--covers", "us-c33333"])).code).toBe(1);
    expect((await run(repo, ["status", "us-a11111", "done"])).code).toBe(1);
    expect((await run(repo, ["mode", "us-a11111", "AFK"])).code).toBe(1);
  });
});

describe("ready, blocked, query, and lint", () => {
  test("ready and blocked support JSON output", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-a00001-ready.md", slice("sl-a00001"));
    await put(repo, "sl-b00002-blocked.md", slice("sl-b00002", ["us-a11111"], ["sl-a00001"]));

    expect(JSON.parse((await run(repo, ["ready", "--json"])).stdout).map((item: { id: string }) => item.id)).toEqual(["sl-a00001"]);
    expect(JSON.parse((await run(repo, ["blocked", "--json"])).stdout).map((item: { id: string }) => item.id)).toEqual(["sl-b00002"]);
  });

  test("query delegates to jq on PATH and forwards its exit code", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    const bin = join(repo, "bin");
    await mkdir(bin);
    const jq = join(bin, "jq");
    await writeFile(jq, "#!/usr/bin/env bun\nawait Bun.stdin.text(); console.log('jq-output'); process.exit(7);\n", "utf8");
    await chmod(jq, 0o755);

    const result = await run(repo, ["query", ".[]"], { PATH: `${bin}:${process.env.PATH ?? ""}` });

    expect(result.code).toBe(7);
    expect(result.stdout).toBe("jq-output\n");
  });

  test("query with a filter fails clearly when jq is absent", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());

    const result = await run(repo, ["query", ".[]"], { PATH: "/tmp/wl-no-jq" });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("jq not found on PATH");
  });

  test("lint reports duplicate ids, dangling refs, cycles, schema failures, and filename mismatches", async () => {
    const repo = await tempRepo();
    await put(repo, "wrong-name.md", story("us-a11111"));
    await put(repo, "us-a11111-duplicate.md", story("us-a11111"));
    await put(repo, "us-b22222-bad.md", story("us-b22222").replace("tags: [orders]", "tags: [orders]\nmode: AFK"));
    await put(repo, "sl-a00001-one.md", slice("sl-a00001", ["us-c33333"], ["sl-b00002"]));
    await put(repo, "sl-b00002-two.md", slice("sl-b00002", ["us-a11111"], ["sl-a00001"]));

    const result = await run(repo, ["lint"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("duplicate id");
    expect(result.stderr).toContain("filename does not start");
    expect(result.stderr).toContain("schema violation");
    expect(result.stderr).toContain("covers missing story");
    expect(result.stderr).toContain("depends_on cycle");
  });

  test("package exposes the wl binary entrypoint", async () => {
    const pkg = JSON.parse(await readFile(join(import.meta.dir, "..", "package.json"), "utf8"));

    expect(pkg.bin).toEqual({ wl: "./index.ts" });
  });

  test("binary entrypoint has a Bun shebang", async () => {
    const index = await readFile(join(import.meta.dir, "..", "index.ts"), "utf8");

    expect(index.startsWith("#!/usr/bin/env bun\n")).toBe(true);
  });
});

describe("help and version", () => {
  test("bare invocation prints main help to stdout and exits 0", async () => {
    const repo = await tempRepo();
    const result = await run(repo, []);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("USAGE");
    expect(result.stdout).toContain("wl <command>");
    expect(result.stdout).toContain("ITEM KINDS");
  });

  test("--help, -h, and help all print main help", async () => {
    const repo = await tempRepo();
    for (const argv of [["--help"], ["-h"], ["help"]]) {
      const result = await run(repo, argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("COMMANDS");
    }
  });

  test("--version and -V print the package version", async () => {
    const repo = await tempRepo();
    const pkg = JSON.parse(await readFile(join(import.meta.dir, "..", "package.json"), "utf8"));
    for (const argv of [["--version"], ["-V"]]) {
      const result = await run(repo, argv);
      expect(result.code).toBe(0);
      expect(result.stdout).toBe(`${pkg.version}\n`);
    }
  });

  test("command --help prints command-specific usage", async () => {
    const repo = await tempRepo();
    const newHelp = await run(repo, ["new", "--help"]);
    expect(newHelp.code).toBe(0);
    expect(newHelp.stdout).toContain("wl new story");
    expect(newHelp.stdout).toContain("wl new slice");
    expect(newHelp.stdout).toContain("--mode AFK|HITL");

    const linkHelp = await run(repo, ["help", "link"]);
    expect(linkHelp.code).toBe(0);
    expect(linkHelp.stdout).toContain("wl link <slice-id> --covers <us-id>");
  });

  test("unknown command lists known commands and exits 1", async () => {
    const repo = await tempRepo();
    const result = await run(repo, ["frobnicate"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Unknown command: frobnicate");
    expect(result.stderr).toContain("Known commands:");
  });

  test("usage errors point to --help", async () => {
    const repo = await tempRepo();
    const result = await run(repo, ["new", "story"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--statement is required");
    expect(result.stderr).toContain("wl new --help");
  });

  test("query --help is treated as a jq filter, not help (so jq can use -h)", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    const result = await run(repo, ["query", "--help"], { PATH: "/tmp/wl-no-jq" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("jq not found on PATH");
  });
});
