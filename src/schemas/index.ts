import { z } from "zod";

export const AlternativeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  proposedBy: z.string(),
  supportedBy: z.array(z.string()).default([]),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).default(0.5),
  relevanceToIntent: z.number().min(0).max(1).default(0.5),
});

export const IntentDecompositionSchema = z.object({
  loadBearingClaims: z.array(z.string()).default([]),
  undefinedTerms: z
    .array(
      z.object({
        term: z.string(),
        needsResolution: z.string(),
      })
    )
    .default([]),
  inScope: z.array(z.string()).default([]),
  outOfScope: z.array(z.string()).default([]),
  knownUnknowns: z.array(z.string()).default([]),
  feasibilityFlags: z.array(z.string()).default([]),
  rationale: z.string().default(""),
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
  realWorldFit: z.number().min(0).max(10),
  simplicity: z.number().min(0).max(10),
  composite: z.number(),
  rationale: z.string(),
});

export const TaskAnalysisSchema = z.object({
  runMode: z.enum(["implementation", "exploration"]),
  selectedAgents: z.array(z.string()),
  rationale: z.string(),
});

export const SchemaFieldSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  description: z.string().optional(),
});

export const SchemaDefinitionSchema = z.object({
  name: z.string(),
  fields: z.array(SchemaFieldSchema),
});

export const ApiEndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  description: z.string(),
});

export const DomainFactsSchema = z.object({
  domain: z.string().min(1),
  schemas: z.array(SchemaDefinitionSchema).optional(),
  apiEndpoints: z.array(ApiEndpointSchema).optional(),
  constraints: z.array(z.string()).default([]),
  knownAbsences: z.array(z.string()).default([]),
  rawContext: z.string().optional(),
});
