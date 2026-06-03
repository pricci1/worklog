import { describe, expect, test } from "bun:test";
import { loadItems, loadItemsWithIssues } from "../src/items";
import { put, slice, story, tempRepo } from "./helpers";

describe("item loading", () => {
  test("parses discriminated story and slice items and sorts stories first", async () => {
    const repo = await tempRepo();
    await put(repo, "sl-b22222-demo.md", slice());
    await put(repo, "us-a11111-story.md", story());

    const items = (await loadItems(`${repo}/.work`)).map((entry) => entry.item);

    expect(items.map((item) => item.id)).toEqual(["us-a11111", "sl-b22222"]);
    expect(items[1]).toMatchObject({ kind: "slice", ready: true, blocked: false });
  });

  test("rejects unknown frontmatter fields through strict schemas", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story().replace("tags: [orders]", "tags: [orders]\npriority: high"));

    const { items, issues } = await loadItemsWithIssues(`${repo}/.work`);

    expect(items).toHaveLength(0);
    expect(issues.some((issue) => issue.problem.includes("schema violation"))).toBe(true);
  });

  test("computes ready and blocked from dependency statuses", async () => {
    const repo = await tempRepo();
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sl-a00001-done.md", slice("sl-a00001", ["us-a11111"], [], "done"));
    await put(repo, "sl-b00002-ready.md", slice("sl-b00002", ["us-a11111"], ["sl-a00001"]));
    await put(repo, "sl-c00003-blocked.md", slice("sl-c00003", ["us-a11111"], ["sl-b00002"]));

    const slices = (await loadItems(`${repo}/.work`)).map((entry) => entry.item).filter((item) => item.kind === "slice");

    expect(slices.find((item) => item.id === "sl-b00002")).toMatchObject({ ready: true, blocked: false });
    expect(slices.find((item) => item.id === "sl-c00003")).toMatchObject({ ready: false, blocked: true });
  });
});
