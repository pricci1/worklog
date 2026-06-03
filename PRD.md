# PRD: Worklog CLI

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

## Non-Goals

- No database.
- No SQLite.
- No daemon.
- No web UI.
- No sprint/project-management system.
- No story points, velocity, roadmap, or release planning.
- No complex workflow engine.
- No hidden state outside the Markdown files.

## Storage

All work items live in one directory:

```txt
.work/
  us-001-order-notification.md
  sl-001-telegram-notification.md
```

Directory can be overridden with:

```sh
WORKLOG_DIR=.work
```

The CLI should search upward from the current directory until it finds `.work/`, unless `WORKLOG_DIR` is set.

## File Format

Each file is Markdown with YAML frontmatter.

The YAML frontmatter is the source of truth for querying.
The Markdown body is for humans and agents.

## Item Kinds

### Story

A business-facing User Story.

Required fields:

```yaml
id: us-001
kind: story
status: open
statement: "Como personal del local, quiero recibir una notificación inmediata cuando entra un pedido, para comenzar a gestionarlo rápidamente."
tags: [orders, notifications]
```

Rules:

- `statement` is required.
- H1 should match `statement`.
- Must not contain implementation fields.
- Body should describe business context and acceptance criteria.

Example:

```md
---
id: us-001
kind: story
status: open
statement: "Como personal del local, quiero recibir una notificación inmediata cuando entra un pedido, para comenzar a gestionarlo rápidamente."
tags: [orders, notifications]
---

# Como personal del local, quiero recibir una notificación inmediata cuando entra un pedido, para comenzar a gestionarlo rápidamente.

## Acceptance

- Entra un pedido nuevo.
- El personal del local recibe una notificación inmediata.
- La notificación permite identificar el pedido.
```

### Slice

An implementation-facing tracer bullet slice.

Required fields:

```yaml
id: sl-001
kind: slice
status: open
mode: AFK
covers: [us-001]
depends_on: []
tags: [orders, telegram]
```

Rules:

- `mode` is required.
- `covers` is required and may contain multiple story IDs.
- `depends_on` contains slice IDs.
- Implementation details are allowed.
- A completed slice should be demoable or verifiable on its own.

Example:

```md
---
id: sl-001
kind: slice
status: open
mode: AFK
covers: [us-001]
depends_on: []
tags: [orders, telegram]
---

# Send Telegram notification when order is created

## Goal

Implement the thinnest end-to-end path that sends a Telegram message when a new order is created.

## Verification

- Creating an order sends a Telegram message.
- Message includes enough order information for staff to identify it.
- Automated test covers the path.
```

## Statuses

Allowed statuses:

```txt
open
doing
done
dropped
```

`ready` and `blocked` are computed, not stored.

A slice is ready when:

- `kind == slice`
- `status == open`
- every `depends_on` item has `status == done`

A slice is blocked when:

- `kind == slice`
- `status == open`
- at least one `depends_on` item is not `done`

## Modes

Allowed slice modes:

```txt
AFK
HITL
```

Meaning:

- `AFK`: can be implemented and merged without human interaction.
- `HITL`: requires human input, review, approval, or decision.

## CLI

Binary name: `wl`

### Required Commands

```sh
wl init
wl new story
wl new slice
wl list
wl show <id>
wl edit <id>
wl ready
wl blocked
wl query [jq-filter]
wl lint
```

### Command Behavior

#### `wl init`

Creates `.work/` if missing.

#### `wl new story`

Creates a new story file from a template.

Accepts:

```sh
--statement <text>
--tags <a,b,c>
```

#### `wl new slice`

Creates a new slice file from a template.

Accepts:

```sh
--title <text>
--mode AFK|HITL
--covers us-001,us-002
--depends-on sl-001,sl-002
--tags <a,b,c>
```

#### `wl list`

Lists items.

Filters:

```sh
--kind story|slice
--status open|doing|done|dropped
--tag <tag>
--mode AFK|HITL
```

#### `wl show <id>`

Prints the Markdown file for the item.

Partial ID matching is allowed if unambiguous.

#### `wl edit <id>`

Opens the item in `$EDITOR`.

#### `wl ready`

Lists ready slices.

Supports:

```sh
--mode AFK|HITL
--tag <tag>
```

#### `wl blocked`

Lists blocked slices and their unresolved dependencies.

Supports:

```sh
--mode AFK|HITL
--tag <tag>
```

#### `wl query [jq-filter]`

Parses all items and emits JSON.

If a filter is provided, pipe JSON through `jq`.

Examples:

```sh
wl query
wl query '.[] | select(.kind == "story")'
wl query '.[] | select(.kind == "slice" and .mode == "AFK")'
```

#### `wl lint`

Validates all work items.

Checks:

- Required fields exist.
- `kind` is valid.
- `status` is valid.
- Story has `statement`.
- Story H1 matches `statement`.
- Story does not contain slice-only fields.
- Slice has `mode`.
- Slice has `covers`.
- Slice `covers` references existing stories.
- Slice `depends_on` references existing slices.
- No dependency cycles.
- File ID matches frontmatter ID.
- No duplicate IDs.

## Query Output Shape

`wl query` emits an array of normalized items:

```json
[
  {
    "id": "us-001",
    "kind": "story",
    "status": "open",
    "statement": "Como ...",
    "tags": ["orders"],
    "file": ".work/us-001-order-notification.md"
  },
  {
    "id": "sl-001",
    "kind": "slice",
    "status": "open",
    "mode": "AFK",
    "covers": ["us-001"],
    "depends_on": [],
    "tags": ["orders", "telegram"],
    "file": ".work/sl-001-telegram-notification.md",
    "ready": true,
    "blocked": false
  }
]
```

## Implementation Notes

Runtime: Bun.

Use Bun APIs where practical:

- `Bun.file()` for reading files.
- `Bun.write()` for writing files.
- `Bun.YAML.parse()` for YAML frontmatter.
- `Bun.spawn()` for `$EDITOR` and `jq`.
- `import.meta.main` for CLI entrypoint.

Use Node-compatible APIs only when simpler or unavoidable.

## Frontmatter Parsing

A valid file starts with:

```md
---
...
---
```

The content between delimiters is parsed as YAML.

Files without valid frontmatter are ignored by normal commands and reported by `wl lint`.

## ID Rules

IDs are stable and short.

Recommended prefixes:

```txt
us-001
sl-001
```

Filenames should start with the ID:

```txt
us-001-order-notification.md
sl-001-telegram-notification.md
```

The frontmatter `id` is canonical.

## Agent Guidance

A repo using this tool should include this in `AGENTS.md` or equivalent:

```md
This project uses `wl` for work management.
Run `wl list`, `wl ready`, `wl blocked`, and `wl show <id>` to inspect work.
User Stories are business-facing and must not include implementation details.
Tracer Slices may include implementation details and may cover multiple User Stories.
```

## MVP Acceptance Criteria

- Can initialize `.work/`.
- Can create stories and slices.
- Can list and show items.
- Can compute ready and blocked slices.
- Can emit JSON for all items.
- Can delegate filters to `jq`.
- Can lint schema and references.
- Works without a database.
- All state is stored in Markdown files.
