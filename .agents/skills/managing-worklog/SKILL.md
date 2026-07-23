---
name: managing-worklog
description: Worklog planning and tracking via wl for Specs, User Stories, and Tracer Slices under .work/. Use when planning, inspecting, picking up, updating, linking, syncing, or validating work items in a repository that uses wl. Route frontmatter changes through wl so key order and Markdown bodies are preserved.
metadata:
  version: 0.1.2
---

# Managing Worklog

This repo tracks work as Markdown files with YAML frontmatter under `.work/`, managed by the `wl` CLI.

If not already installed, you can use `bunx` or `npx` with package `@pricci1/worklog`.

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

When turning a conversation, plan, or rough idea into tracked work, read and follow [`SYNTHESIZE_SPEC_AND_STORIES.md`](SYNTHESIZE_SPEC_AND_STORIES.md) before creating any items.

## Turn stories into tracer slices

When breaking a spec or story into executable work, read and follow [`TRACER_SLICING.md`](TRACER_SLICING.md) before creating any slices.

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
