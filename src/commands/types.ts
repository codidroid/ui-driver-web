import { z } from 'zod';

export const CommandSchema = z.object({
  kind: z.string(),
  params: z.record(z.unknown()).optional(),
});
export type Command = z.infer<typeof CommandSchema>;

export const MatcherSchema = z.union([
  z.unknown(),
  z.object({ regex: z.string() }),
  z.object({ contains: z.unknown() }),
]);

export const StepSchema = z.object({
  step: z.string(),
  do: CommandSchema.optional(),
  assert: CommandSchema.optional(),
  expect: MatcherSchema.optional(),
});
export type Step = z.infer<typeof StepSchema>;
