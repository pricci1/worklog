import { z } from "zod";

export const Id = z.string().regex(/^(sp|us|sl)-[0-9a-f]{6}$/);
export const SpecId = z.string().regex(/^sp-[0-9a-f]{6}$/);
export const StoryId = z.string().regex(/^us-[0-9a-f]{6}$/);
export const SliceId = z.string().regex(/^sl-[0-9a-f]{6}$/);
export const SpecStatus = z.enum(["draft", "approved", "archived"]);
export const StoryStatus = z.enum(["active", "future", "dropped"]);
export const SliceStatus = z.enum(["open", "doing", "done", "dropped"]);
export const Mode = z.enum(["AFK", "HITL"]);

export const Spec = z.object({
  id: SpecId,
  kind: z.literal("spec"),
  status: SpecStatus,
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
}).strict();

export const Story = z.object({
  id: StoryId,
  kind: z.literal("story"),
  status: StoryStatus,
  statement: z.string().min(1),
  spec: SpecId.optional(),
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
  issue: z.number().int().positive().optional(),
}).strict();

export const Item = z.discriminatedUnion("kind", [Spec, Story, Slice]);

export type Spec = z.infer<typeof Spec>;
export type Story = z.infer<typeof Story>;
export type Slice = z.infer<typeof Slice>;
export type Item = z.infer<typeof Item>;
export type Mode = z.infer<typeof Mode>;
export type SpecStatus = z.infer<typeof SpecStatus>;
export type StoryStatus = z.infer<typeof StoryStatus>;
export type SliceStatus = z.infer<typeof SliceStatus>;

export type NormalizedSpec = Spec & { file: string };
export type NormalizedStory = Story & { file: string };
export type NormalizedSlice = Slice & { file: string; ready: boolean; blocked: boolean };
export type NormalizedItem = NormalizedSpec | NormalizedStory | NormalizedSlice;
