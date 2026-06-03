import { describe, expect, test } from "bun:test";
import { parseFrontmatter, rewriteList, rewriteScalar } from "../src/frontmatter";

describe("frontmatter parsing", () => {
  test("parses valid YAML frontmatter and preserves trailing body whitespace", () => {
    const parsed = parseFrontmatter("---\nid: us-a11111\nkind: story\n---\n# Title\n\n");

    expect(parsed?.yaml).toEqual({ id: "us-a11111", kind: "story" });
    expect(parsed?.body).toBe("# Title\n\n");
  });

  test("rejects missing delimiters and invalid YAML", () => {
    expect(parseFrontmatter("id: us-a11111\n---\nbody")).toBeUndefined();
    expect(parseFrontmatter("---\ntags: [\n---\nbody")).toBeUndefined();
  });
});

describe("frontmatter mutation", () => {
  test("rewrites scalar fields without changing key order or body", () => {
    const text = "---\nid: sl-b22222\nkind: slice\nstatus: open\nmode: AFK\n---\n# Body\nkeep me\n";

    expect(rewriteScalar(text, "status", "doing")).toBe("---\nid: sl-b22222\nkind: slice\nstatus: doing\nmode: AFK\n---\n# Body\nkeep me\n");
  });

  test("rewrites inline lists for link and unlink operations", () => {
    const text = "---\nid: sl-b22222\nkind: slice\ncovers: [us-a11111]\ndepends_on: []\n---\n# Body\n";

    expect(rewriteList(text, "covers", ["us-a11111", "us-c33333"]))
      .toContain("covers: [us-a11111, us-c33333]");
  });

  test("preserves block list style when rewriting lists", () => {
    const text = "---\nid: sl-b22222\nkind: slice\ncovers:\n  - us-a11111\n  - us-c33333\ndepends_on: []\n---\n# Body\n";

    expect(rewriteList(text, "covers", ["us-c33333"])).toBe("---\nid: sl-b22222\nkind: slice\ncovers:\n  - us-c33333\ndepends_on: []\n---\n# Body\n");
  });
});
