---
name: managing-worklog
description: Manages Specs, User Stories, and Tracer Slices stored under .work/ via the wl CLI. Use when planning, inspecting, picking up, updating, linking, syncing, or validating work items in a repository that uses wl. Never hand-edit frontmatter — use wl commands so key order and body are preserved.
---

# Managing Worklog

This repo tracks work as Markdown files with YAML frontmatter under `.work/`, managed by the `wl` CLI.

Three kinds of items exist:

- **Spec** (`sp-xxxxxx`): context container for intent, scope, decisions, and open questions. Not executable work.
- **Story** (`us-xxxxxx`): business-facing intent. No implementation details.
- **Slice** (`sl-xxxxxx`): a tracer bullet of work. Covers at least one story and may depend on other slices.

The hierarchy is `spec <- story <- slice`: stories may reference one spec, slices cover stories, and slices do not cover specs directly. Specs hold context, stories hold desired outcomes, and slices define the executable frontier for implementation agents.

The frontmatter is the source of truth for querying. Mutate it only through `wl` commands. Markdown bodies may be edited directly after an item is created.

Consult [`WL_CLI_REFERENCE.md`](WL_CLI_REFERENCE.md) when command syntax is uncertain, when answering a structural query without a built-in command, when syncing GitHub Issues, or when diagnosing lint and scripting behavior.

## Inspecting work

Use the narrowest built-in query that answers the question:

```sh
wl list
wl show <id>
wl show <id> --json
wl stories --spec <sp-id>
wl context <id>
wl ready
wl blocked
```

## Picking up work

When asked "what should I work on?", filter ready slices by mode:

```sh
wl ready --mode AFK --json
wl ready --mode HITL --json
```

Show a candidate's full context before starting, then mark progress through the CLI:

```sh
wl context <slice-id>
wl status <slice-id> doing
# implement and verify the slice
wl status <slice-id> done
```

## Synthesize a spec and stories

When asked to turn a conversation, plan, or rough idea into tracked work, synthesize from the context already available. Ask the user only when a missing decision would materially change scope, story boundaries, or safety.

1. Explore enough code and documentation to understand current vocabulary, existing seams, and prior work.
2. Read the spec and story shapes in [`WORK_ITEM_TEMPLATES.md`](WORK_ITEM_TEMPLATES.md), then draft a spec covering the problem, solution, scope, decisions, testing, open questions, and related work.
3. Draft business-facing stories at the same time. Keep them as separate `us-*` items linked to the spec rather than reproducing full stories in the spec body.
4. Before publishing many items, show the proposed spec title and numbered story statements. Ask whether the story set is right.
5. After approval, create the spec and stories and link every story to the spec.

```sh
spec_id=$(wl new spec --title "Improve planning workflows" --tags planning,agents)
story_id=$(wl new story --statement "Agents can turn a rough idea into tracked work without losing context" --tags planning,agents)
wl link "$story_id" --spec "$spec_id"
```

Approve the spec only after the user agrees it is ready to guide slicing:

```sh
wl status <spec-id> approved
```

## Turn stories into tracer slices

Slicing is generally separate from spec and story creation. Each tracer slice should deliver a narrow, complete, independently verifiable path through the system. Prefer a small prefactor slice first when it makes later work easier.

1. Read the relevant context:

   ```sh
   wl context <spec-or-story-id>
   ```

2. Draft slices before creating them. For each proposed slice, show:

   - **Title**: short implementation-facing name.
   - **Covers**: linked story IDs.
   - **Blocked by**: slice titles or IDs that genuinely gate it, or none.
   - **Mode**: `AFK` if an agent can complete it autonomously; `HITL` if it needs human input, review, approval, or a decision.
   - **What it delivers**: end-to-end behavior, not a layer-by-layer task list.

3. Ask whether the granularity, dependency edges, and modes are right. Do not create a batch until the breakdown is approved.
4. Create approved slices in dependency order so blockers already have IDs.
5. Read the slice shape in [`WORK_ITEM_TEMPLATES.md`](WORK_ITEM_TEMPLATES.md), then fill each body with enough context for a fresh agent to implement it in one context window.

```sh
wl new slice \
  --title "Telegram notification on new order" \
  --mode AFK \
  --covers us-a3f2b1 \
  --depends-on sl-9d4e7c \
  --tags orders,telegram
```

For wide mechanical refactors that cannot land as vertical slices, use expand-contract sequencing: add the new form beside the old, migrate bounded batches while keeping the repo green, then remove the old form after all callers move.

## Updating work

Always route frontmatter changes through commands:

```sh
wl status <id> <value>
wl mode <slice-id> AFK|HITL
wl link <story-id> --spec <sp-id>
wl link <slice-id> --covers <us-id>
wl link <slice-id> --depends-on <sl-id>
wl unlink <story-id> --spec <sp-id>
wl unlink <slice-id> --covers <us-id>
wl unlink <slice-id> --depends-on <sl-id>
```

`ready` and `blocked` are computed from status and dependencies; never set them in a file. Use [`WL_CLI_REFERENCE.md`](WL_CLI_REFERENCE.md) for status values, mode semantics, query examples, and sync behavior.

## Validating changes

Run `wl lint` before any commit that touches `.work/`. Fix the cause of every error and rerun until it exits successfully. The full checks and exit-code conventions are in [`WL_CLI_REFERENCE.md`](WL_CLI_REFERENCE.md).

## What not to do

- Do not hand-edit YAML frontmatter; use `wl` commands.
- Do not treat specs as executable work; use slices.
- Do not put implementation details in stories; put them in covering slices.
- Do not invent IDs or create item files directly; use `wl new` and consume its printed ID.
- Do not set computed `ready` or `blocked` values.
- Do not commit sync overlays or hand-edit the `issue` field; let `wl sync` manage them.
- Do not bypass `wl lint` failures; fix their cause.
