wl 0.1.0 — Git-native CLI for Specs (sp-…), User Stories (us-…), and Tracer Slices (sl-…).

USAGE
  wl <command> [options]

COMMANDS
  init     Create .work/ in the current directory (idempotent).
  new      Create a new Spec, User Story, or Tracer Slice. Prints the new ID.
  list     List items. Filters are AND-combined. Default output is a tab-separated table.
  show     Print an item's markdown file. With --json, print the normalized item object.
  edit     Open the resolved item file in $EDITOR (fallback: vi). Inherits stdio.
  status   Set status. Spec: draft|approved|archived. Story: active|future|dropped. Slice: open|doing|done|dropped.
  mode     Set slice mode. Errors on stories.
  link     Add a covers, depends-on, or story-to-spec link. No-op if already present.
  unlink   Remove a covers, depends-on, or story-to-spec link. No-op if absent.
  stories  List stories linked to a spec.
  context  Print a context bundle: specs, linked stories, and covering slices.
  ready    List open slices whose dependencies are all done.
  blocked  List open slices with unresolved dependencies. Table output shows the unresolved IDs.
  query    Emit all items as a normalized JSON array. With a filter, pipe through jq.
  sync     Pull/push GitHub issue state for slices; --persist writes overlay state back to markdown.
  lint     Validate frontmatter, schema, refs, cycles, and filename/ID consistency. Exit 1 on any error.
  help     Show top-level help, or help for a specific command.

GLOBAL OPTIONS
  -h, --help     Show help for a command.
  -V, --version  Print version.

ENVIRONMENT
  WORKLOG_DIR           Override .work/ lookup. Relative paths resolve against cwd.
  EDITOR                Editor used by `wl edit` (default: vi).
  WORKLOG_GITHUB_TOKEN  Token for `wl sync` (then GH_TOKEN, GITHUB_TOKEN, `gh auth token`).
  GITHUB_REPOSITORY     Default owner/name target for `wl sync`.
  GITHUB_API_URL        GitHub API base URL (default: https://api.github.com).

ITEM KINDS
  spec  (sp-…)   Context container for intent, scope, decisions, and open questions.
  story (us-…)   Business-facing intent. No implementation details.
  slice (sl-…)   Tracer bullet. Covers ≥1 story; may depend on other slices.

Work items live in .work/ as Markdown with YAML frontmatter.
Run `wl <command> --help` for command-specific usage.
