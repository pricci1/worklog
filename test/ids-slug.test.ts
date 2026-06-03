import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { allocateId, randomId } from "../src/ids";
import { slugify } from "../src/slug";

describe("ID generation", () => {
  test("generates prefixed six-character lowercase hex ids", () => {
    expect(randomId("us")).toMatch(/^us-[0-9a-f]{6}$/);
    expect(randomId("sl")).toMatch(/^sl-[0-9a-f]{6}$/);
  });

  test("allocates an id not already present in the work directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wl-id-"));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "us-000000-existing.md"), "", "utf8");

    expect(await allocateId("us", dir)).toMatch(/^us-[0-9a-f]{6}$/);
    expect(await allocateId("us", dir)).not.toBe("us-000000");
  });
});

describe("slug generation", () => {
  test("folds to ASCII, collapses separators, and truncates to six words", () => {
    expect(slugify("Árbol: uno dos tres cuatro cinco seis siete"))
      .toBe("arbol-uno-dos-tres-cuatro-cinco");
  });

  test("falls back to untitled for empty slugs", () => {
    expect(slugify("??? ---")).toBe("untitled");
  });
});
