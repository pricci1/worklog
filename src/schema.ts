import { z } from "zod";

export const Id = z.string().regex(/^(us|sl)-[0-9a-f]{6}$/);
export const StoryId = z.string().regex(/^us-[0-9a-f]{6}$/);
export const SliceId = z.string().regex(/^sl-[0-9a-f]{6}$/);
export const StoryStatus = z.enum(["active", "future", "dropped"]);
export const SliceStatus = z.enum(["open", "doing", "done", "dropped"]);
export const Mode = z.enum(["AFK", "HITL"]);

export const Story = z.object({
  id: StoryId,
  kind: z.literal("story"),
  status: StoryStatus,
  statement: z.string().min(1),
  tags: z.array(z.string()).default([]),
}).strict();

export const Slice = z.object({
  id: SliceId,
  kind: z.literal("slice"),
  status: SliceStatus,
  mode: Mode,
  covers: z.array(StoryId).min(1),
  depends_on: z.array(SliceId).default([]),
  tags: z.array(z.string()).default([]),
}).strict();

export const Item = z.discriminatedUnion("kind", [Story, Slice]);

export type Story = z.infer<typeof Story>;
export type Slice = z.infer<typeof Slice>;
export type Item = z.infer<typeof Item>;
export type Mode = z.infer<typeof Mode>;
export type StoryStatus = z.infer<typeof StoryStatus>;
export type SliceStatus = z.infer<typeof SliceStatus>;

export type NormalizedStory = Story & { file: string };
export type NormalizedSlice = Slice & { file: string; ready: boolean; blocked: boolean };
export type NormalizedItem = NormalizedStory | NormalizedSlice;
