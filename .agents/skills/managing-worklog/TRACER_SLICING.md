# Turn stories into tracer slices

Follow this branch when breaking a spec or story into executable work. Slicing is generally separate from spec and story creation. Each tracer slice delivers a narrow, complete, independently verifiable path through the system. Prefer a small prefactor slice first when it makes later work easier.

1. Run `wl context <spec-or-story-id>`. Context review is complete when the selected stories, their spec, and existing covering slices are accounted for.
2. Draft slices before creating them. For each proposed slice, show:
   - **Title**: short implementation-facing name.
   - **Covers**: linked story IDs.
   - **Blocked by**: slice titles or IDs that genuinely gate it, or none.
   - **Mode**: `AFK` if an agent can complete it autonomously; `HITL` if it needs human input, review, approval, or a decision.
   - **What it delivers**: end-to-end behavior rather than a layer-by-layer task list.
3. Check the draft set: every selected story outcome is covered, every slice has an observable verification path, and every dependency is a genuine execution gate.
4. Show the draft set and continue revising until the user approves its granularity, dependency edges, and modes.
5. Create slices in dependency order. Use the slice body shape below and complete every applicable heading, recording `None` where needed.
6. Inspect `wl context <spec-or-story-id>` and account for every approved slice and relationship.

## Slice body shape

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

## Creation

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
