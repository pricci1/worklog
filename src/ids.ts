import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type IdPrefix = "sp" | "us" | "sl";

export function randomId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

export async function allocateId(prefix: IdPrefix, dir: string): Promise<string> {
  const existing = new Set<string>();
  try {
    for (const name of await readdir(dir)) {
      const match = /^(sp|us|sl)-[0-9a-f]{6}/.exec(name);
      if (match?.[0]) existing.add(match[0]);
    }
  } catch {
    // Directory creation is handled by callers; missing directories have no collisions.
  }
  for (;;) {
    const id = randomId(prefix);
    if (!existing.has(id)) return id;
  }
}

export function idFromFilename(name: string): string | undefined {
  return /^(sp|us|sl)-[0-9a-f]{6}(?=-)/.exec(name)?.[0];
}

export function itemPath(dir: string, id: string, slug: string): string {
  return join(dir, `${id}-${slug}.md`);
}
