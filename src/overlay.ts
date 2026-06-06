import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const Overlay = z.object({
  issue: z.number().int().positive(),
  repo: z.string(),
  url: z.string().optional(),
  hash: z.string(),
  remote: z.object({ title: z.string(), state: z.enum(["open", "closed"]) }),
  syncedAt: z.string(),
});

export type Overlay = z.infer<typeof Overlay>;

export function overlayPath(slicePath: string): string {
  return slicePath.replace(/\.md$/, ".json");
}

export function overlayHash(fields: { title: string; state: "open" | "closed" }): string {
  return Bun.hash(JSON.stringify([fields.title, fields.state])).toString(16);
}

export async function readOverlay(slicePath: string): Promise<Overlay | undefined> {
  const path = overlayPath(slicePath);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = Overlay.safeParse(JSON.parse(await readFile(path, "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function writeOverlay(slicePath: string, overlay: Overlay): Promise<void> {
  await writeFile(overlayPath(slicePath), `${JSON.stringify(overlay, null, 2)}\n`, "utf8");
}

export async function ensureOverlayGitignore(workDir: string): Promise<void> {
  const path = join(workDir, ".gitignore");
  const existing = existsSync(path) ? await readFile(path, "utf8") : "";
  if (existing.split("\n").some((line) => line.trim() === "*.json")) return;
  await writeFile(path, existing && !existing.endsWith("\n") ? `${existing}\n*.json\n` : `${existing}*.json\n`, "utf8");
}
