wl 0.1.0 — Git-native CLI for User Stories (us-…) and Tracer Slices (sl-…).

USAGE
  wl <command> [options]

COMMANDS
  init     Create .work/ in the current directory (idempotent).
  new      Create a new User Story or Tracer Slice. Prints the new ID.
  list     List items. Filters are AND-combined. Default output is a tab-separated table.
  show     Print an item's markdown file. With --json, print the normalized item object.
  edit     Open the resolved item file in $EDITOR (fallback: vi). Inherits stdio.
  status   Set status. Story: active|future|dropped. Slice: open|doing|done|dropped.
  mode     Set slice mode. Errors on stories.
  link     Add a covers or depends-on link to a slice. No-op if the ref is already present.
  unlink   Remove a covers or depends-on link from a slice. No-op if the ref is absent.
  ready    List open slices whose dependencies are all done.
  blocked  List open slices with unresolved dependencies. Table output shows the unresolved IDs.
  query    Emit all items as a normalized JSON array. With a filter, pipe through jq.
  lint     Validate frontmatter, schema, refs, cycles, and filename/ID consistency. Exit 1 on any error.
  help     Show top-level help, or help for a specific command.

GLOBAL OPTIONS
  -h, --help     Show help for a command.
  -V, --version  Print version.

ENVIRONMENT
  WORKLOG_DIR    Override .work/ lookup. Relative paths resolve against cwd.
  EDITOR         Editor used by `wl edit` (default: vi).

ITEM KINDS
  story (us-…)   Business-facing intent. No implementation details.
  slice (sl-…)   Tracer bullet. Covers ≥1 story; may depend on other slices.

Work items live in .work/ as Markdown with YAML frontmatter.
Run `wl <command> --help` for command-specific usage.
