# `wl` CLI reference

Consult this reference when command syntax is uncertain, when answering a structural query without a built-in command, when syncing slices to GitHub, or when diagnosing validation and scripting behavior.

The CLI is self-documenting:

```sh
wl --help
wl <command> --help
```

`<id>` accepts either the full ID (`us-a3f2b1`) or the bare six-character hex suffix (`a3f2b1`) when unambiguous.

## Inspecting work

```sh
wl list
wl list --kind spec
wl list --kind story
wl list --kind slice --status open --mode AFK
wl show <id>
wl show <id> --json
wl stories --spec <sp-id>
wl context <id>
wl ready
wl blocked
```

`show --json` emits a normalized object, including computed `ready` and `blocked` values for slices. `ready` means open with all dependencies done; `blocked` reports unresolved dependencies.

## Creating work

```sh
wl new spec --title "Improve planning workflows" --tags planning,agents
wl new story --statement "Personnel receive immediate order notifications" --tags orders,notify
wl new slice \
  --title "Telegram notification on new order" \
  --mode AFK \
  --covers us-a3f2b1 \
  --depends-on sl-9d4e7c \
  --tags orders,telegram
```

A slice must cover at least one story. `wl new` validates referenced IDs and prints the new ID to stdout.

## Updating work

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

Statuses:

- spec: `draft|approved|archived`
- story: `active|future|dropped`
- slice: `open|doing|done|dropped`

Modes:

- `AFK`: can be implemented and merged without human interaction
- `HITL`: requires human input, review, approval, or a decision

`link` and `unlink` reject self-dependencies and cycles. They are no-ops when the reference is already present or absent. `ready` and `blocked` are computed from status and dependencies rather than stored.

## Querying with jq

`wl query` emits the full normalized array as JSON and optionally pipes it through `jq`:

```sh
wl query
wl query '.[] | select(.kind == "spec" and .status == "approved")'
wl query '.[] | select(.kind == "story" and .status == "active")'
wl query '.[] | select(.kind == "slice" and .ready) | .id'
wl query '[.[] | select(.kind == "slice")] | group_by(.status) | map({status: .[0].status, count: length})'
```

Use `wl query` for structural questions not covered by a built-in command.

## Syncing slices to GitHub Issues

```sh
wl sync --push
wl sync --push --dry-run
wl sync --push --repo owner/name
```

- A slice without an `issue` gets a new issue; its number is written to frontmatter.
- A slice with an `issue` updates that issue's title and open/closed state. `done` and `dropped` close it; other statuses keep it open. The issue body is written only on creation.
- A same-named, gitignored `.json` overlay stores last-synced remote state. Matching pushes skip the API call and report `up to date`.

Token resolution order is `WORKLOG_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, then `gh auth token`. Repository resolution is `--repo`, `GITHUB_REPOSITORY`, then the `origin` remote.

Let `wl sync` manage the `issue` field and `.json` overlays; keep overlays uncommitted.

## Lint checks

`wl lint` checks:

- frontmatter parsing and the Zod schema for each kind
- well-formed, unique IDs
- filename prefixes matching frontmatter IDs
- story-to-spec, slice-to-story, and slice-to-slice references
- dependency cycles
- spec title/H1 agreement (warning)
- active stories without specs (warning)
- approved specs without linked stories (warning)
- archived specs with active stories (warning)
- story statement/H1 agreement (warning)

Exit code `1` means at least one validation or usage error. Resolve its cause and rerun.

## Output conventions

- Data goes to stdout; errors and warnings go to stderr.
- `0` means success, `1` validation or usage error, and `2` internal error.
- `--json` is available on `list`, `show`, `stories`, `ready`, and `blocked`; `query` is always JSON.

Parse stdout in scripts rather than scraping stderr.
