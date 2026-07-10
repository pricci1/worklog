# Synthesize a spec and stories

Follow this branch when turning a conversation, plan, or rough idea into tracked work. Synthesize from the available context. Ask the user only when a missing decision would materially change scope, story boundaries, or safety.

1. Explore code, documentation, and prior work until you can name the current vocabulary, relevant seams, and constraints needed by the draft.
2. Read the spec and story shapes in [`WORK_ITEM_TEMPLATES.md`](WORK_ITEM_TEMPLATES.md). Complete every applicable heading; explicitly record `None` where a heading has no content.
3. Draft separate business-facing stories linked to the spec. The story set is complete when every in-scope business outcome is represented and every acceptance criterion is observable.
4. Before publishing many items, show the proposed spec title and numbered story statements. Continue revising until the user approves the story set.
5. Create the approved spec and stories, link every story to the spec, and inspect `wl context <spec-id>` to account for every created story.

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
