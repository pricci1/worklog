import pkg from "../package.json" with { type: "json" };

export const VERSION: string = pkg.version ?? "0.0.0";

type CommandSpec = {
  name: string;
  usage: readonly string[];
  summary: string;
  details?: readonly string[];
};

const COMMANDS: readonly CommandSpec[] = [
  {
    name: "init",
    usage: ["wl init"],
    summary: "Create .work/ in the current directory (idempotent).",
  },
  {
    name: "new",
    usage: [
      "wl new story --statement <text> [--tags a,b,c]",
      "wl new slice --title <text> --mode AFK|HITL --covers <us-id[,...]>",
      "             [--depends-on <sl-id[,...]>] [--tags a,b,c]",
    ],
    summary: "Create a new User Story or Tracer Slice. Prints the new ID.",
    details: [
      "OPTIONS",
      "  --statement <text>   Story statement (story only; required, non-empty).",
      "  --title <text>       Slice title (slice only; required, non-empty).",
      "  --mode AFK|HITL      AFK = autonomous; HITL = needs human input (slice only).",
      "  --covers <ids>       Comma-separated story IDs the slice covers (>=1).",
      "  --depends-on <ids>   Comma-separated slice IDs this slice depends on.",
      "  --tags <list>        Comma-separated tag list.",
    ],
  },
  {
    name: "list",
    usage: ["wl list [--kind story|slice] [--status <value>] [--tag <tag>] [--mode AFK|HITL] [--json]"],
    summary: "List items. Filters are AND-combined. Default output is a tab-separated table.",
  },
  {
    name: "show",
    usage: ["wl show <id> [--json]"],
    summary: "Print an item's markdown file. With --json, print the normalized item object.",
    details: [
      "ID RESOLUTION",
      "  Exact id wins (e.g. us-a3f2b1).",
      "  A bare 6-char hex suffix (e.g. a3f2b1) is accepted if it uniquely identifies one item.",
    ],
  },
  {
    name: "edit",
    usage: ["wl edit <id>"],
    summary: "Open the resolved item file in $EDITOR (fallback: vi). Inherits stdio.",
  },
  {
    name: "status",
    usage: ["wl status <id> <status>"],
    summary: "Set status. Story: active|future|dropped. Slice: open|doing|done|dropped.",
    details: ["Rewrites the status: line in place; preserves all other content."],
  },
  {
    name: "mode",
    usage: ["wl mode <id> AFK|HITL"],
    summary: "Set slice mode. Errors on stories.",
  },
  {
    name: "link",
    usage: [
      "wl link <slice-id> --covers <us-id>",
      "wl link <slice-id> --depends-on <sl-id>",
    ],
    summary: "Add a covers or depends-on link to a slice. No-op if the ref is already present.",
    details: ["Rejects self-dependency and cycles in depends_on."],
  },
  {
    name: "unlink",
    usage: [
      "wl unlink <slice-id> --covers <us-id>",
      "wl unlink <slice-id> --depends-on <sl-id>",
    ],
    summary: "Remove a covers or depends-on link from a slice. No-op if the ref is absent.",
  },
  {
    name: "ready",
    usage: ["wl ready [--mode AFK|HITL] [--tag <tag>] [--json]"],
    summary: "List open slices whose dependencies are all done.",
  },
  {
    name: "blocked",
    usage: ["wl blocked [--mode AFK|HITL] [--tag <tag>] [--json]"],
    summary: "List open slices with unresolved dependencies. Table output shows the unresolved IDs.",
  },
  {
    name: "query",
    usage: ["wl query [<jq-filter>]"],
    summary: "Emit all items as a normalized JSON array. With a filter, pipe through jq.",
    details: [
      "EXAMPLES",
      "  wl query",
      "  wl query '.[] | select(.kind == \"story\")'",
      "  wl query '.[] | select(.kind == \"slice\" and .mode == \"AFK\" and .ready)'",
    ],
  },
  {
    name: "sync",
    usage: ["wl sync --push [--repo owner/name] [--dry-run]", "wl sync --pull [--repo owner/name] [--force] [--dry-run]", "wl sync --reconcile [--repo owner/name] [--dry-run]"],
    summary: "Create, update, or pull GitHub issue state for slices.",
    details: [
      "OPTIONS",
      "  --push               Push slices to GitHub.",
      "  --pull               Pull issue title/state from GitHub into local slices.",
      "  --reconcile          Adopt existing issues titled like [sl-xxxxxx] with worklog/kind:slice labels.",
      "  --repo owner/name    Target repository (default: GITHUB_REPOSITORY or git origin).",
      "  --dry-run            Print planned actions without writing changes (reconcile still fetches candidates).",
      "  --force              With --pull, overwrite local changes since the last sync.",
      "",
      "AUTH",
      "  Token resolution order: WORKLOG_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN, then `gh auth token`.",
      "",
      "A slice with no `issue` field gets a new issue created and the number written back.",
      "A slice with an `issue` field updates that issue (title, body, open/closed state).",
      "Pull updates the slice H1 and maps GitHub open/closed state to local open/done status.",
      "Reconcile lists labeled issues and matches only the strict title prefix [sl-xxxxxx].",
    ],
  },
  {
    name: "lint",
    usage: ["wl lint"],
    summary: "Validate frontmatter, schema, refs, cycles, and filename/ID consistency. Exit 1 on any error.",
  },
  {
    name: "help",
    usage: ["wl help [<command>]"],
    summary: "Show top-level help, or help for a specific command.",
  },
];

const NAME_WIDTH = Math.max(...COMMANDS.map((cmd) => cmd.name.length));

export function commandNames(): readonly string[] {
  return COMMANDS.map((cmd) => cmd.name);
}

export function mainHelp(): string {
  const lines = [
    `wl ${VERSION} — Git-native CLI for User Stories (us-…) and Tracer Slices (sl-…).`,
    "",
    "USAGE",
    "  wl <command> [options]",
    "",
    "COMMANDS",
    ...COMMANDS.map((cmd) => `  ${cmd.name.padEnd(NAME_WIDTH + 2)}${cmd.summary}`),
    "",
    "GLOBAL OPTIONS",
    "  -h, --help     Show help for a command.",
    "  -V, --version  Print version.",
    "",
    "ENVIRONMENT",
    "  WORKLOG_DIR        Override .work/ lookup. Relative paths resolve against cwd.",
    "  EDITOR             Editor used by `wl edit` (default: vi).",
    "  WORKLOG_GITHUB_TOKEN  Token for `wl sync` (then GH_TOKEN, GITHUB_TOKEN, `gh auth token`).",
    "  GITHUB_REPOSITORY  Default owner/name target for `wl sync`.",
    "  GITHUB_API_URL     GitHub API base URL (default: https://api.github.com).",
    "",
    "ITEM KINDS",
    "  story (us-…)   Business-facing intent. No implementation details.",
    "  slice (sl-…)   Tracer bullet. Covers ≥1 story; may depend on other slices.",
    "",
    "Work items live in .work/ as Markdown with YAML frontmatter.",
    "Run `wl <command> --help` for command-specific usage.",
  ];
  return `${lines.join("\n")}\n`;
}

export function commandHelp(name: string): string | undefined {
  const cmd = COMMANDS.find((entry) => entry.name === name);
  if (!cmd) return undefined;
  const lines = [`wl ${cmd.name} — ${cmd.summary}`, "", "USAGE", ...cmd.usage.map((line) => `  ${line}`)];
  if (cmd.details && cmd.details.length > 0) lines.push("", ...cmd.details);
  return `${lines.join("\n")}\n`;
}

export function usageLine(name: string): string {
  const cmd = COMMANDS.find((entry) => entry.name === name);
  return cmd ? cmd.usage[0] ?? `wl ${name}` : `wl ${name}`;
}
