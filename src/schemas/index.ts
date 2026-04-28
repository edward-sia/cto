import { z } from "zod";

export const AlternativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  proposedBy: z.string(),
  supportedBy: z.array(z.string()).default([]),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const ModeratorAssessmentSchema = z.object({
  outcome: z.enum(["consensus", "diverging", "continue"]),
  alternatives: z.array(AlternativeSchema).default([]),
  summary: z.string(),
});

export const JudgeScoreSchema = z.object({
  functionalCompleteness: z.number().min(0).max(10),
  architecturalQuality: z.number().min(0).max(10),
  testCoverage: z.number().min(0).max(10),
  intentAlignment: z.number().min(0).max(10),
  simplicity: z.number().min(0).max(10),
  composite: z.number(),
  rationale: z.string(),
});

export const TaskAnalysisSchema = z.object({
  runMode: z.enum(["implementation", "exploration"]),
  selectedAgents: z.array(z.string()),
  rationale: z.string(),
});
