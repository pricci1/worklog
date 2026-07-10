# Work item body templates

Read the relevant template before drafting a work item body. Use the generated heading structure and keep the content concise and stable.

## Spec

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

## Story

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

## Slice

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
