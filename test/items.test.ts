import { describe, expect, test } from "bun:test";
import { loadItems, loadItemsWithIssues } from "../src/items";
import { put, slice, spec, story, tempRepo } from "./helpers";

describe("item loading", () => {
  test("parses discriminated items and sorts specs, stories, then slices", async () => {
    const repo = await tempRepo();
    await put(repo, "sl-b22222-demo.md", slice());
    await put(repo, "us-a11111-story.md", story());
    await put(repo, "sp-d44444-spec.md", spec());

    const items = (await loadItems(`${repo}/.work`)).map((entry) => entry.item);

    expect(items.map((item) => item.id)).toEqual(["sp-d44444", "us-a11111", "sl-b22222"]);
    expect(items[2]).toMatchObject({ kind: "slice", ready: true, blocked: false });
  });

  test("validates story spec references and spec lifecycle warnings", async () => {
    const repo = await tempRepo();
    await put(repo, "sp-d44444-spec.md", spec().replace("status: draft", "status: archived"));
    await put(repo, "us-a11111-story.md", story().replace("tags: [orders]", "spec: sp-d44444\ntags: [orders]"));
    await put(repo, "us-c33333-missing.md", story("us-c33333", "Missing parent").replace("tags: [orders]", "spec: sp-e55555\ntags: [orders]"));

    const { issues } = await loadItemsWithIssues(`${repo}/.work`);

    expect(issues.some((issue) => !issue.warning && issue.problem === "spec missing sp-e55555")).toBe(true);
    expect(issues.some((issue) => issue.warning && issue.problem.includes("archived spec has active stories"))).toBe(true);
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
