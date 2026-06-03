# PRD: Worklog CLI (`wl`)

## Summary

A small Git-native CLI for managing business User Stories and implementation Tracer Slices as Markdown files with YAML frontmatter.

The tool is optimized for humans and AI agents: readable files, deterministic metadata, no database, scriptable output, and simple validation.

## Goals

- Store work items as Markdown files in a repo.
- Support two item kinds: `story` and `slice`.
- Keep User Stories business-oriented and implementation-free.
- Allow Tracer Slices to contain implementation details.
- Let slices cover one or more stories.
- Compute ready/blocked state from dependencies.
- Expose structured data as JSON.
- Delegate complex querying to `jq`.
- Be easy for AI agents to inspect, edit, and validate.
- Strict type safety end-to-end.

## Non-Goals

- No database.
- No SQLite.
- No daemon.
- No web UI.
- No sprint/project-management system.
- No story points, velocity, roadmap, or release planning.
- No priorities, assignees, due dates, or estimates.
- No complex workflow engine.
- No hidden state outside the Markdown files.
- No graph/visualization output (defer; `wl query` + `jq` is enough).
- No template customization (templates are hardcoded for v1).

## Storage

All work items live in one directory:

```txt
.work/
  us-a3f2b1-order-notification.md
  sl-9d4e7c-telegram-notification.md
```

Directory resolution:

1. If `WORKLOG_DIR` is set, use it (relative paths resolved against `cwd`).
2. Otherwise walk upward from `cwd` until a directory named `.work/` is found.
3. If none found, commands that need it exit non-zero with a clear message suggesting `wl init`.

## File Format

Each file is Markdown with YAML frontmatter.

The YAML frontmatter is the source of truth for querying.
The Markdown body is for humans and agents.

A valid file starts with:

```md
---
<yaml>
---
<body>
```

Files without valid frontmatter are ignored by normal commands and reported by `wl lint`.

## IDs

IDs are stable, short, and **non-ordered**. They imply no hierarchy or priority.

Format: `<prefix>-<6 lowercase hex chars>`

- `us-` for stories, `sl-` for slices.
- Hex chars drawn from `0-9a-f`, generated from `crypto.getRandomValues`.
- Collision check on creation: re-roll if the ID already exists in the directory.

Examples: `us-a3f2b1`, `sl-9d4e7c`.

The frontmatter `id` is canonical. Filenames must start with `<id>-`.

### Filename slug

Filename: `<id>-<slug>.md` where `<slug>` is:

- Source: `--title` for slices, `--statement` for stories.
- Lowercase, ASCII-only (diacritics stripped via `normalize('NFKD')`).
- Non-`[a-z0-9]+` runs collapsed to `-`.
- Trimmed of leading/trailing `-`.
- Truncated to the first 6 hyphen-separated words.
- If the result is empty, slug is `untitled`.

## Item Kinds

### Story

A business-facing User Story.

Frontmatter schema:

```yaml
id: us-a3f2b1
kind: story
status: active
statement: "Como personal del local, quiero recibir una notificación inmediata cuando entra un pedido, para comenzar a gestionarlo rápidamente."
tags: [orders, notifications]
```

Rules:

- `statement` is required and non-empty.
- H1 should match `statement`.
- Must not contain slice-only fields (`mode`, `covers`, `depends_on`).
- Body should describe business context and acceptance criteria.

Template body:

```md
# {{statement}}

## Acceptance

-
```

### Slice

An implementation-facing tracer bullet slice.

Frontmatter schema:

```yaml
id: sl-9d4e7c
kind: slice
status: open
mode: AFK
covers: [us-a3f2b1]
depends_on: []
tags: [orders, telegram]
```

Rules:

- `mode` is required.
- `covers` is required and must contain at least one story ID.
- `depends_on` contains slice IDs (may be empty).
- Implementation details are allowed.
- A completed slice should be demoable or verifiable on its own.

Template body:

```md
# {{title}}

## Goal

## Verification

-
```

## Statuses

Statuses are per-kind.

**Story status** (a story is a business intent; this axis describes its triage state):

```txt
active    # wanted, eligible to be sliced now
future    # wanted eventually, parked (icebox)
dropped   # abandoned
```

**Slice status** (a slice is a unit of work; this axis describes its lifecycle):

```txt
open
doing
done
dropped
```

`ready` and `blocked` are **computed**, not stored.

A slice is **ready** when:

- `kind == slice`
- `status == open`
- every `depends_on` slice has `status == done`

A slice is **blocked** when:

- `kind == slice`
- `status == open`
- at least one `depends_on` slice is not `done`

Stories have no ready/blocked computation.

## Modes

Allowed slice modes:

```txt
AFK
HITL
```

- `AFK`: can be implemented and merged without human interaction.
- `HITL`: requires human input, review, approval, or decision.

## CLI

Binary name: `wl`.

### Commands

```sh
wl init
wl new story   --statement <text> [--tags a,b,c]
wl new slice   --title <text> --mode AFK|HITL --covers us-xxxxxx[,us-yyyyyy] [--depends-on sl-aaaaaa,sl-bbbbbb] [--tags a,b,c]
wl list        [--kind story|slice] [--status ...] [--tag <tag>] [--mode ...] [--json]
wl show <id>   [--json]
wl edit <id>
wl status <id> <status>     # slice: open|doing|done|dropped; story: active|future|dropped
wl mode   <id> AFK|HITL
wl link   <slice-id> --covers <us-id>
wl link   <slice-id> --depends-on <sl-id>
wl unlink <slice-id> --covers <us-id>
wl unlink <slice-id> --depends-on <sl-id>
wl ready       [--mode AFK|HITL] [--tag <tag>] [--json]
wl blocked     [--mode AFK|HITL] [--tag <tag>] [--json]
wl query       [jq-filter]
wl lint
```

### Command behavior

#### `wl init`

Creates `.work/` in `cwd` if missing. No-op if it exists. Idempotent.

#### `wl new story`

Generates a new story file from the template using a freshly allocated ID and slug.

Prints the new ID to stdout. Exits non-zero if `--statement` is missing or empty.

#### `wl new slice`

Generates a new slice file from the template.

Prints the new ID to stdout. Validates that all `--covers` and `--depends-on` IDs exist; exits non-zero with a clear message otherwise.

#### `wl list`

Lists items as a compact human-readable table by default. With `--json`, prints the same shape as `wl query`.

Filters are AND-combined.

#### `wl show <id>`

Prints the Markdown file for the item. With `--json`, prints the normalized item object.

ID resolution rules:

- Exact `id` match wins.
- Otherwise, a bare 6-char hex suffix (e.g. `a3f2b1`) is accepted if it uniquely identifies one item across both prefixes.
- Ambiguous matches exit non-zero and list candidates.

#### `wl edit <id>`

Resolves the ID, then `Bun.spawn`s `$EDITOR` (fallback: `vi`) on the file path. Inherits stdio.

#### `wl status <id> <status>`

Validates `<status>` against the allowed set for the item's kind (slice: `open|doing|done|dropped`; story: `active|future|dropped`) and rewrites the `status:` line in the frontmatter in place. Preserves all other lines, key order, body, and trailing whitespace.

Exits non-zero if the status is invalid for the kind or the file lacks a `status:` line (caught by `wl lint`).

#### `wl mode <id> <mode>`

Same in-place rewrite for `mode:`. Errors if the target is a story.

#### `wl link` / `wl unlink`

Mutates `covers` or `depends_on` of a slice.

- Validates the slice exists and is a slice (not a story).
- Validates the referenced ID exists and has the right kind (`us-` for `--covers`, `sl-` for `--depends-on`).
- Rejects self-dependency.
- Rejects creating a cycle in `depends_on` (run cycle check on the would-be state).
- `link` is a no-op if the ref already present; `unlink` is a no-op if absent.
- Rewrites the list in place, preserving inline (`[a, b, c]`) vs. block list style when possible. If style detection is uncertain, normalize to inline.

#### `wl ready`

Lists slices that are ready. Human table by default; `--json` for normalized objects.

#### `wl blocked`

Lists slices that are blocked, each with the list of unresolved (non-`done`) dependencies.

#### `wl query [jq-filter]`

Parses all items and emits the normalized JSON array (see below).

- With no filter: print JSON to stdout. `jq` not required.
- With a filter: `Bun.spawn` `jq` with the filter, piping our JSON to its stdin. If `jq` is not on `PATH`, exit non-zero with a clear message.

Examples:

```sh
wl query
wl query '.[] | select(.kind == "story")'
wl query '.[] | select(.kind == "slice" and .mode == "AFK" and .ready)'
```

#### `wl lint`

Validates all work items. Exits `0` if clean, `1` if any issue is found. Prints a list of issues (file, id, problem) to stderr.

Checks:

- File has valid frontmatter.
- Frontmatter passes the Zod schema for its `kind`.
- `id` format matches `^(us|sl)-[0-9a-f]{6}$`.
- File ID matches frontmatter ID (filename starts with `<id>-`).
- No duplicate IDs across the directory.
- Story has `statement`.
- Story H1 matches `statement` (warning, not error).
- Story does not contain slice-only fields.
- Slice has `mode` and non-empty `covers`.
- Slice `covers` references existing stories.
- Slice `depends_on` references existing slices.
- No `depends_on` cycles.

## Query Output Shape

`wl query` (and `--json` on read commands) emits an array of normalized items:

```json
[
  {
    "id": "us-a3f2b1",
    "kind": "story",
    "status": "open",
    "statement": "Como ...",
    "tags": ["orders"],
    "file": ".work/us-a3f2b1-order-notification.md"
  },
  {
    "id": "sl-9d4e7c",
    "kind": "slice",
    "status": "open",
    "mode": "AFK",
    "covers": ["us-a3f2b1"],
    "depends_on": [],
    "tags": ["orders", "telegram"],
    "file": ".work/sl-9d4e7c-telegram-notification.md",
    "ready": true,
    "blocked": false
  }
]
```

Sort order: stable, by `kind` (`story` before `slice`), then by `id` ascending.

## Implementation Notes

Runtime: **Bun**.

- `Bun.file()` / `Bun.write()` for I/O.
- `Bun.YAML.parse()` for parsing frontmatter (per `node_modules/bun-types/docs/runtime/yaml.mdx`).
- `Bun.spawn()` for `$EDITOR` and `jq`.
- `import.meta.main` for the CLI entrypoint.
- `crypto.getRandomValues` for ID generation.

Bun's YAML support has no stringifier. Therefore:

- **New files**: emit YAML by a small hand-written serializer covering exactly our schema (scalars + flat string arrays). No general-purpose YAML emission.
- **Mutations** (`status`, `mode`, `link`, `unlink`): operate by line-level rewriting on the frontmatter region. Never reserialize the whole file. This preserves key order, comments, and body byte-for-byte except for the mutated line(s).

### Validation

All frontmatter validation uses **Zod v4**. Item types are derived from the schemas via `z.infer`. No hand-written interfaces for item shapes.

Sketch:

```ts
import { z } from "zod";

const Id = z.string().regex(/^(us|sl)-[0-9a-f]{6}$/);
const StoryStatus = z.enum(["active", "future", "dropped"]);
const SliceStatus = z.enum(["open", "doing", "done", "dropped"]);
const Mode = z.enum(["AFK", "HITL"]);

const Story = z.object({
  id: Id,
  kind: z.literal("story"),
  status: StoryStatus,
  statement: z.string().min(1),
  tags: z.array(z.string()).default([]),
}).strict();

const Slice = z.object({
  id: Id,
  kind: z.literal("slice"),
  status: SliceStatus,
  mode: Mode,
  covers: z.array(Id).min(1),
  depends_on: z.array(Id).default([]),
  tags: z.array(z.string()).default([]),
}).strict();

const Item = z.discriminatedUnion("kind", [Story, Slice]);

type Story = z.infer<typeof Story>;
type Slice = z.infer<typeof Slice>;
type Item  = z.infer<typeof Item>;
```

Schemas live in a single module and are the single source of truth.

### TypeScript

- `tsconfig.json` must have `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `exactOptionalPropertyTypes: true`.
- No `any`. No non-null assertions outside of test helpers.
- All external boundaries (file contents, CLI args, jq output) validated with Zod before crossing into typed code.

### CLI argument parsing

Use Bun's built-in `parseArgs` (Node-compatible `util.parseArgs`). No external CLI framework.

### Module layout

```
src/
  schema.ts        # zod schemas + inferred types
  ids.ts           # generate, validate, parse IDs
  slug.ts          # slug generation
  fs.ts            # resolve .work/, read/write files
  frontmatter.ts   # parse, serialize (new), line-rewrite (mutate)
  items.ts         # load all items, sort, normalize, compute ready/blocked
  commands/
    init.ts new.ts list.ts show.ts edit.ts
    status.ts mode.ts link.ts unlink.ts
    ready.ts blocked.ts query.ts lint.ts
  cli.ts           # parseArgs dispatch
index.ts           # if (import.meta.main) cli()
```

## Testing

`bun test` is required. Tests must cover at minimum:

- Frontmatter parse: valid, invalid, missing delimiters, trailing whitespace.
- ID generation: format, uniqueness against an existing directory.
- Slug generation: ASCII fold, truncation, empty input fallback.
- Item loader: discriminated parsing, rejection of unknown fields.
- Ready/blocked computation: empty deps, partial deps, all-done deps.
- Lint: detects each documented failure mode (duplicate IDs, dangling refs, cycles, schema violations, filename/id mismatch).
- Mutations preserve body and key order: status, mode, link/unlink round-trips.
- `query` without `jq` emits valid JSON matching the documented shape.
- `query` with `jq` invokes the binary and forwards its exit code (use a fake binary on `PATH` in tests when needed).
- Each command's exit code: `0` on success, `1` on validation/usage error, `2` on internal error.

Tests run against temporary directories created per test; no shared state.

## Agent Guidance

A repo using this tool should include this in `AGENTS.md` or equivalent:

```md
This project uses `wl` for work management.
Run `wl list`, `wl ready`, `wl blocked`, and `wl show <id>` to inspect work.
User Stories are business-facing and must not include implementation details.
Tracer Slices may include implementation details and may cover multiple User Stories.
Use `wl status <id> doing|done` to update progress; do not hand-edit frontmatter.
Use `wl link` / `wl unlink` to change `covers` / `depends_on`.
Run `wl lint` before committing.
```

## MVP Acceptance Criteria

- Can initialize `.work/`.
- Can create stories and slices with random IDs and slugged filenames.
- Can list and show items (table + `--json`).
- Can compute ready and blocked slices.
- Can mutate `status`, `mode`, `covers`, `depends_on` via commands without losing body or key order.
- Can emit JSON for all items.
- Can delegate filters to `jq` when present, error clearly when not.
- Can lint schema, references, cycles, and file/ID consistency, with non-zero exit on failure.
- Works without a database.
- All state is stored in Markdown files.
- All frontmatter shapes are defined as Zod v4 schemas; types are inferred, not duplicated.
- `bun test` passes; coverage includes every check listed in **Testing**.
