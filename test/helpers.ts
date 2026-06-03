import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cli } from "../src/cli";

export async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wl-test-"));
  await mkdir(join(dir, ".work"));
  return dir;
}

export function story(id = "us-a11111", statement = "Receive order notifications"): string {
  return [
    "---",
    `id: ${id}`,
    "kind: story",
    "status: active",
    `statement: ${JSON.stringify(statement)}`,
    "tags: [orders]",
    "---",
    `# ${statement}`,
    "",
    "## Acceptance",
    "",
    "- business outcome",
    "",
  ].join("\n");
}

export function slice(id = "sl-b22222", covers = ["us-a11111"], depends_on: string[] = [], status = "open"): string {
  return [
    "---",
    `id: ${id}`,
    "kind: slice",
    `status: ${status}`,
    "mode: AFK",
    `covers: [${covers.join(", ")}]`,
    `depends_on: [${depends_on.join(", ")}]`,
    "tags: [orders, telegram]",
    "---",
    `# Slice ${id}`,
    "",
    "## Goal",
    "",
    "implementation detail",
    "",
  ].join("\n");
}

export async function put(repo: string, name: string, text: string): Promise<string> {
  const path = join(repo, ".work", name);
  await writeFile(path, text, "utf8");
  return path;
}

export async function read(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export async function run(repo: string, argv: string[], env: Record<string, string | undefined> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await cli(argv, {
    cwd: repo,
    env: { ...process.env, ...env },
    stdout: (text) => { stdout += text; },
    stderr: (text) => { stderr += text; },
  });
  return { code, stdout, stderr };
}
