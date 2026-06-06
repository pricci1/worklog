---
name: managing-worklog
description: Manages User Stories and Tracer Slices stored under .work/ via the wl CLI. Use when planning, inspecting, picking up, updating, linking, or validating work items in a repository that uses wl. Never hand-edit frontmatter — use wl commands so key order and body are preserved.
---

# Managing Worklog

This repo tracks work as Markdown files with YAML frontmatter under `.work/`, managed by the `wl` CLI.

Two kinds of items exist:

- **Story** (`us-xxxxxx`): business-facing intent. No implementation details.
- **Slice** (`sl-xxxxxx`): a tracer bullet of work. Covers ≥1 story, may depend on other slices.

The frontmatter is the source of truth for querying. Mutate it only through `wl` commands.

## Discovery

Always start by checking what's available; the CLI is self-documenting.

```sh
wl --help                 # top-level command list
wl <command> --help       # usage and options for a specific command
```

To inspect existing work:

```sh
wl list                   # all items, tab-separated
wl list --kind story
wl list --kind slice --status open --mode AFK
wl show <id>              # full markdown
wl show <id> --json       # normalized object (includes computed ready/blocked for slices)
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
wl show <slice-id>
for story in $(wl show <slice-id> --json | jq -r '.covers[]'); do wl show "$story"; done
```

Mark progress as you go — do not edit the file:

```sh
wl status <slice-id> doing
wl status <slice-id> done
```

## Creating work

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
wl link <slice-id> --covers <us-id>          # add a covered story
wl link <slice-id> --depends-on <sl-id>      # add a dependency
wl unlink <slice-id> --covers <us-id>
wl unlink <slice-id> --depends-on <sl-id>
```

`link`/`unlink` reject self-dependencies and cycles. They are no-ops if the ref is already present/absent.

`ready` and `blocked` are computed from `status` and `depends_on`; never set them yourself.

## Querying with jq

`wl query` emits the full normalized array as JSON, then optionally pipes through `jq` if a filter is given:

```sh
wl query
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
- Slice `covers` references existing stories; `depends_on` references existing slices.
- No `depends_on` cycles.
- Story has a `statement`; H1 matches it (warning).

Exit code 1 means there is at least one error. Fix the underlying file (or, for status/mode/links, use the corresponding `wl` command) and rerun.

## Output and exit-code conventions

- Data → stdout. Errors and warnings → stderr.
- `0` success, `1` validation/usage error, `2` internal error.
- `--json` is available on `list`, `show`, `ready`, `blocked`. `query` is always JSON.

Parse stdout in scripts; never scrape stderr.

## What not to do

- Do not hand-edit YAML frontmatter (key order and surrounding lines are preserved by `wl`; manual edits risk breaking the format).
- Do not put implementation details in a story. Move them into a slice that covers the story.
- Do not invent IDs. Always use `wl new` and read the printed id from stdout.
- Do not set `ready` or `blocked` in a file. They are computed.
- Do not create files directly under `.work/`. Use `wl new`.
- Do not bypass `wl lint` failures with manual edits to satisfy the checker — fix the cause.
