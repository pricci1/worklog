# Synthesize a spec and stories

Follow this branch when turning a conversation, plan, or rough idea into tracked work. Synthesize from the available context. Ask the user only when a missing decision would materially change scope, story boundaries, or safety.

1. Explore code, documentation, and prior work until you can name the current vocabulary, relevant seams, and constraints needed by the draft.
2. Use the spec and story body shapes below. Complete every applicable heading; explicitly record `None` where a heading has no content.
3. Draft separate business-facing stories linked to the spec. The story set is complete when every in-scope business outcome is represented and every acceptance criterion is observable.
4. Before publishing many items, show the proposed spec title and numbered story statements. Continue revising until the user approves the story set.
5. Create the approved spec and stories, link every story to the spec, and inspect `wl context <spec-id>` to account for every created story.

## Spec body shape

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

## Story body shape

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

## Creation and approval

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
