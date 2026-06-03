import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export async function initWorkDir(cwd: string): Promise<string> {
  const dir = join(cwd, ".work");
  await mkdir(dir, { recursive: true });
  return dir;
}

export function resolveWorkDir(cwd: string, env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.WORKLOG_DIR && env.WORKLOG_DIR.trim() !== "") return resolve(cwd, env.WORKLOG_DIR);
  let current = resolve(cwd);
  for (;;) {
    const candidate = join(current, ".work");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function listMarkdownFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names.filter((name) => name.endsWith(".md")).map((name) => join(dir, name));
}

export async function readText(file: string): Promise<string> {
  return await readFile(file, "utf8");
}

export async function writeText(file: string, text: string): Promise<void> {
  await writeFile(file, text, "utf8");
}
