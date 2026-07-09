---
name: managing-worklog
description: Manages Specs, User Stories, and Tracer Slices stored under .work/ via the wl CLI. Use when planning, inspecting, picking up, updating, linking, or validating work items in a repository that uses wl. Never hand-edit frontmatter — use wl commands so key order and body are preserved.
---

# Managing Worklog

This repo tracks work as Markdown files with YAML frontmatter under `.work/`, managed by the `wl` CLI.

Three kinds of items exist:

- **Spec** (`sp-xxxxxx`): context container for intent, scope, decisions, and open questions. Not executable work.
- **Story** (`us-xxxxxx`): business-facing intent. No implementation details.
- **Slice** (`sl-xxxxxx`): a tracer bullet of work. Covers ≥1 story, may depend on other slices.

The hierarchy is `spec <- story <- slice`: stories may reference one spec, and slices cover stories. Slices do not cover specs directly.

The frontmatter is the source of truth for querying. Mutate it only through `wl` commands.

Use `wl` as the issue tracker: specs hold context, stories hold desired outcomes, and slices define the executable frontier for implementation agents.

## Discovery

Always start by checking what's available; the CLI is self-documenting.

```sh
wl --help                 # top-level command list
wl <command> --help       # usage and options for a specific command
```

To inspect existing work:

```sh
wl list                   # all items, tab-separated
wl list --kind spec
wl list --kind story
wl list --kind slice --status open --mode AFK
wl show <id>              # full markdown
wl show <id> --json       # normalized object (includes computed ready/blocked for slices)
wl stories --spec <sp-id> # stories linked to a spec
wl context <id>           # specs + linked stories + covering slices
wl ready                  # slices ready to start (open + all deps done)
wl blocked                # slices blocked, with their unresolved deps
```

`<id>` accepts either the full id (`us-a3f2b1`) or the bare 6-char hex suffix (`a3f2b1`) when unambiguous.

## Picking up work

When asked "what should I work on?", filter ready slices by mode:

```sh
wl ready --mode AFK --json   # slices safe to implement autonomously
wl ready --mode HITL --json  # slices needing human input
```

Show a candidate's full context before starting:

```sh
wl context <slice-id>
```

Mark progress as you go — do not edit the file:

```sh
wl status <slice-id> doing
wl status <slice-id> done
```

## Workflow: synthesize a spec and stories

When asked to turn a conversation, plan, or rough idea into tracked work, synthesize from the context you already have. Do not interview the user unless a missing decision would materially change scope, story boundaries, or safety.

1. Explore only enough code/docs to understand the current vocabulary, existing seams, and prior work.
2. Draft a spec that captures problem, solution, scope, decisions, testing notes, open questions, and links to related work. The spec is a context container, not executable work.
3. Draft business-facing stories at the same time. Stories are separate `us-*` items linked to the spec; do not list full stories inside the spec body.
4. Before publishing many items, show the user the proposed spec title plus numbered story statements and ask whether the story set is right.
5. Create the spec and stories after approval, then link every story to the spec.

```sh
spec_id=$(wl new spec --title "Improve planning workflows" --tags planning,agents)
story_id=$(wl new story --statement "Agents can turn a rough idea into tracked work without losing context" --tags planning,agents)
wl link "$story_id" --spec "$spec_id"
```

After creation, it is OK to edit Markdown bodies for clarity, but never hand-edit YAML frontmatter. Keep frontmatter changes routed through `wl` commands.

### Spec body shape

Use the generated template and fill it with concise, stable context:

```md
# <title>

## Problem Statement

The user's problem, from the user's perspective.

## Solution

The intended solution, from the user's perspective.

## Scope

What this effort includes.

## Out of Scope

What this effort explicitly excludes.

## Implementation Decisions

Architecture, contracts, schema/API choices, or constraints already decided. Avoid brittle file paths unless the path itself is the decision.

## Testing Decisions

Highest useful verification seam, existing prior-art tests, and what behavior proves completion.

## Open Questions

Questions that block approval or require human input.

## Related Work

Links to the linked `us-*` stories or other relevant worklog items.

## Further Notes
```

### Story body shape

Stories capture business intent only:

```md
# <statement>

## Context

Who wants this and why.

## Acceptance Criteria

- [ ] Observable outcome, free of implementation detail.

## Notes

Business constraints only. Move implementation detail to slices.
```

Approve the spec only after the user agrees it is ready to guide slicing:

```sh
wl status <spec-id> approved
```

## Workflow: turn stories into tracer slices

Slicing is generally a separate step from spec/story creation. When asked to break down a spec or story into work, use tracer bullets: each slice should deliver a narrow, complete, independently verifiable path through the system. Prefer a small prefactor slice first if it makes later work easier.

1. Read the relevant context:

   ```sh
   wl context <spec-or-story-id>
   ```

2. Draft slices before creating them. For each proposed slice, show:

   - **Title**: short implementation-facing name.
   - **Covers**: linked story IDs.
   - **Blocked by**: slice titles or IDs that genuinely gate it, or none.
   - **Mode**: `AFK` if an agent can complete it autonomously, `HITL` if it needs human input/review/approval/decision.
   - **What it delivers**: end-to-end behavior, not a layer-by-layer task list.

3. Ask the user whether the granularity, dependency edges, and AFK/HITL modes are right. Do not create a batch of slices until the breakdown is approved.
4. Create approved slices in dependency order so blockers already have IDs.
5. Fill each slice body with enough context for a fresh agent to implement it in one context window.

### Slice body shape

```md
# <title>

## What to build

End-to-end behavior this slice makes work.

## Acceptance Criteria

- [ ] Observable outcome.

## Implementation Notes

Only decisions, constraints, or known seams useful to the implementing agent.

## Verification

- [ ] Command or manual check that proves the slice works.

## Out of Scope
```

For wide mechanical refactors that cannot land as vertical slices, use expand-contract sequencing: add the new form beside the old, migrate bounded batches while keeping the repo green, then remove the old form after all callers move.

## Creating work

Specs capture synthesized intent, scope, decisions, testing notes, and open questions. They are context containers, not work items:

```sh
wl new spec --title "Improve planning workflows" --tags planning,agents
```

Stories capture business intent only — no implementation language:

```sh
wl new story --statement "Personnel receive immediate order notifications" --tags orders,notify
```

Slices describe a unit of implementation work and must cover at least one story:

```sh
wl new slice \
  --title "Telegram notification on new order" \
  --mode AFK \
  --covers us-a3f2b1 \
  --depends-on sl-9d4e7c \
  --tags orders,telegram
```

Mode semantics:

- `AFK`: can be implemented and merged without human interaction.
- `HITL`: requires human input, review, approval, or decision.

`wl new` validates all referenced IDs exist and prints the new ID to stdout on success.

## Updating work

Always go through commands so the frontmatter stays canonical:

```sh
wl status <id> <value>          # story: active|future|dropped ; slice: open|doing|done|dropped
wl mode <slice-id> AFK|HITL
wl link <story-id> --spec <sp-id>             # set a story's parent spec
wl link <slice-id> --covers <us-id>          # add a covered story
wl link <slice-id> --depends-on <sl-id>      # add a dependency
wl unlink <story-id> --spec <sp-id>
wl unlink <slice-id> --covers <us-id>
wl unlink <slice-id> --depends-on <sl-id>
```

Spec statuses are `draft|approved|archived`. Stories use `active|future|dropped`; slices use `open|doing|done|dropped`.

`link`/`unlink` reject self-dependencies and cycles. They are no-ops if the ref is already present/absent.

`ready` and `blocked` are computed from `status` and `depends_on`; never set them yourself.

## Querying with jq

`wl query` emits the full normalized array as JSON, then optionally pipes through `jq` if a filter is given:

```sh
wl query
wl query '.[] | select(.kind == "spec" and .status == "approved")'
wl query '.[] | select(.kind == "story" and .status == "active")'
wl query '.[] | select(.kind == "slice" and .ready) | .id'
wl query '[.[] | select(.kind == "slice")] | group_by(.status) | map({status: .[0].status, count: length})'
```

Use this whenever you need to answer a structural question that isn't already a built-in command.

## Syncing slices to GitHub Issues

`wl sync --push` creates or updates a GitHub issue for each slice:

```sh
wl sync --push                       # push all slices
wl sync --push --dry-run             # show planned create/update without calling GitHub
wl sync --push --repo owner/name     # override the target repo
```

- A slice with no `issue` field gets a new issue created; the number is written back into the frontmatter as `issue: <n>`.
- A slice that already has an `issue` updates that issue's title and open/closed state. `done`/`dropped` slices close the issue; others keep it open. The issue **body is only written on create**.
- Each slice `.md` has a same-named, gitignored `.json` overlay holding the last-synced remote state. Pushes that match the overlay are skipped (no API call), reported as `up to date`.

Token resolution order: `WORKLOG_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, then `gh auth token`. Repo resolution: `--repo`, else `GITHUB_REPOSITORY`, else the `origin` git remote.

Do not commit the `.json` overlays or hand-edit the `issue` field — let `wl sync` manage both.

## Validating before commit

Run `wl lint` before any commit that touches `.work/`. It checks:

- Frontmatter parses and matches the Zod schema for its kind.
- IDs are well-formed and unique.
- Filename starts with the frontmatter id.
- Story `spec` references an existing spec.
- Slice `covers` references existing stories; `depends_on` references existing slices.
- No `depends_on` cycles.
- Spec title matches H1 (warning).
- Active story has a spec (warning).
- Approved spec has at least one linked story (warning).
- Archived spec has no active stories (warning).
- Story has a `statement`; H1 matches it (warning).

Exit code 1 means there is at least one error. Fix the underlying file (or, for status/mode/links, use the corresponding `wl` command) and rerun.

## Output and exit-code conventions

- Data → stdout. Errors and warnings → stderr.
- `0` success, `1` validation/usage error, `2` internal error.
- `--json` is available on `list`, `show`, `stories`, `ready`, `blocked`. `query` is always JSON.

Parse stdout in scripts; never scrape stderr.

## What not to do

- Do not hand-edit YAML frontmatter (key order and surrounding lines are preserved by `wl`; manual edits risk breaking the format).
- Do not treat specs as executable work. Use specs for context and decisions; use slices for implementation.
- Do not put implementation details in a story. Move them into a slice that covers the story.
- Do not invent IDs. Always use `wl new` and read the printed id from stdout.
- Do not set `ready` or `blocked` in a file. They are computed.
- Do not create files directly under `.work/`. Use `wl new`.
- Do not bypass `wl lint` failures with manual edits to satisfy the checker — fix the cause.
