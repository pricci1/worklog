---
name: managing-worklog
description: Worklog planning and tracking via wl for Specs, User Stories, and Tracer Slices under .work/. Use when planning, inspecting, picking up, updating, linking, syncing, or validating work items in a repository that uses wl. Route frontmatter changes through wl so key order and Markdown bodies are preserved.
---

# Managing Worklog

This repo tracks work as Markdown files with YAML frontmatter under `.work/`, managed by the `wl` CLI.

Three leading words define the worklog:

- **Spec** (`sp-xxxxxx`): context container for intent, scope, decisions, and open questions.
- **Story** (`us-xxxxxx`): business-facing, observable outcome.
- **Tracer slice** (`sl-xxxxxx`): narrow, executable path through the system.

The hierarchy is `spec <- story <- slice`: each story may reference one spec; each slice covers at least one story and may depend on other slices. Specs hold context, stories hold desired outcomes, and slices define the executable frontier for implementation agents.

## Operating invariants

- Create every item with `wl new` and consume the ID printed to stdout.
- Treat frontmatter as the query source of truth and route its mutations through `wl`. Edit Markdown bodies directly after creation.
- Keep implementation detail in slices; keep stories focused on business outcomes.
- Treat `ready` and `blocked` as values computed from slice status and dependencies.
- Let `wl sync` manage issue fields and gitignored sync overlays.
- Complete every `.work/` change by resolving `wl lint` errors and rerunning it successfully.

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

Inspection is complete when the output answers the question and, for a specific item, its linked context has been reviewed.

## Picking up work

When asked "what should I work on?", filter ready slices by mode:

```sh
wl ready --mode AFK --json
wl ready --mode HITL --json
```

Read a candidate's full context and mark it doing before implementation. Mark it done only after its verification succeeds:

```sh
wl context <slice-id>
wl status <slice-id> doing
# implement and verify the slice
wl status <slice-id> done
```

A recommendation is complete when the candidate is ready for the requested mode and its context has been reviewed and presented. A pickup is complete when the chosen slice is marked `doing`.

## Synthesize a spec and stories

When asked to turn a conversation, plan, or rough idea into tracked work, synthesize from the available context. Ask the user only when a missing decision would materially change scope, story boundaries, or safety.

1. Explore code, documentation, and prior work until you can name the current vocabulary, relevant seams, and constraints needed by the draft.
2. Read the spec and story shapes in [`WORK_ITEM_TEMPLATES.md`](WORK_ITEM_TEMPLATES.md). Complete every applicable heading; explicitly record `None` where a heading has no content.
3. Draft separate business-facing stories linked to the spec. The story set is complete when every in-scope business outcome is represented and every acceptance criterion is observable.
4. Before publishing many items, show the proposed spec title and numbered story statements. Continue revising until the user approves the story set.
5. Create the approved spec and stories, link every story to the spec, and inspect `wl context <spec-id>` to account for every created story.

```sh
spec_id=$(wl new spec --title "Improve planning workflows" --tags planning,agents)
story_id=$(wl new story --statement "Agents can turn a rough idea into tracked work without losing context" --tags planning,agents)
wl link "$story_id" --spec "$spec_id"
wl context "$spec_id"
```

After the user agrees the spec is ready to guide slicing, approve it:

```sh
wl status <spec-id> approved
```

Synthesis is complete when the context shows every approved story linked to the spec, the spec status reflects the user's approval, and `wl lint` succeeds.

## Turn stories into tracer slices

Slicing is generally separate from spec and story creation. Each tracer slice delivers a narrow, complete, independently verifiable path through the system. Prefer a small prefactor slice first when it makes later work easier.

1. Run `wl context <spec-or-story-id>`. Context review is complete when the selected stories, their spec, and existing covering slices are accounted for.
2. Draft slices before creating them. For each proposed slice, show:
   - **Title**: short implementation-facing name.
   - **Covers**: linked story IDs.
   - **Blocked by**: slice titles or IDs that genuinely gate it, or none.
   - **Mode**: `AFK` if an agent can complete it autonomously; `HITL` if it needs human input, review, approval, or a decision.
   - **What it delivers**: end-to-end behavior rather than a layer-by-layer task list.
3. Check the draft set: every selected story outcome is covered, every slice has an observable verification path, and every dependency is a genuine execution gate.
4. Show the draft set and continue revising until the user approves its granularity, dependency edges, and modes.
5. Create slices in dependency order. Read the slice shape in [`WORK_ITEM_TEMPLATES.md`](WORK_ITEM_TEMPLATES.md) and complete every applicable heading, recording `None` where needed.
6. Inspect `wl context <spec-or-story-id>` and account for every approved slice and relationship.

```sh
wl new slice \
  --title "Telegram notification on new order" \
  --mode AFK \
  --covers us-a3f2b1 \
  --depends-on sl-9d4e7c \
  --tags orders,telegram
```

Slicing is complete when every approved slice and relationship appears in context and `wl lint` succeeds.

For wide mechanical refactors that cannot land as vertical slices, use expand-contract sequencing: add the new form beside the old, migrate bounded batches while keeping the repo green, then remove the old form after all callers move.

## Updating work

Route frontmatter changes through the matching command:

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

Use [`WL_CLI_REFERENCE.md`](WL_CLI_REFERENCE.md) for status values, mode semantics, query examples, and sync behavior. An update is complete when `wl show` or `wl context` confirms the requested state and `wl lint` succeeds.
