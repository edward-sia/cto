import type { CodexExecutionResult, FitnessScore, JudgeScore } from "../types/index.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function verificationScore(result: CodexExecutionResult): number {
  const verification = result.verification;
  const verificationResults = verification?.results ?? [];
  if (!result.success) return 0;
  if (verificationResults.length === 0) return result.testResults?.failed ? 2 : 5;
  if (!verification) return 5;
  if (verification.requiredFailed > 0) return 0;
  return round((verification.passed / verificationResults.length) * 10);
}

export function computeFitnessScore(score: JudgeScore, result: CodexExecutionResult): FitnessScore {
  const uncertainty = score.uncertainty ?? 0.5;
  const scoreEvidence = score.evidence ?? [];
  const scoreFailures = score.failures ?? [];
  const verificationResults = result.verification?.results ?? [];
  const verification = verificationScore(result);
  const maintainability = round((score.architecturalQuality + score.realWorldFit) / 2);
  const riskReduction = result.verification?.requiredFailed === 0 ? 8 : 2;
  const costEfficiency = result.durationMs < 120_000 ? 8 : 5;
  const uncertaintyPenalty = round(uncertainty * 10);

  const evidence = [
    ...scoreEvidence,
    ...verificationResults
      .filter((item) => item.passed)
      .map((item) => `Verification passed: ${item.command}`),
  ];
  const failures = [
    ...scoreFailures,
    ...verificationResults
      .filter((item) => !item.passed)
      .map((item) => `Verification failed: ${item.command}`),
  ];

  let composite = round(
    0.35 * verification +
      0.20 * score.functionalCompleteness +
      0.15 * maintainability +
      0.10 * score.simplicity +
      0.10 * score.intentAlignment +
      0.05 * riskReduction +
      0.05 * costEfficiency -
      0.10 * uncertaintyPenalty
  );

  if (result.verification && result.verification.requiredFailed > 0) {
    composite = Math.min(composite, 4);
  }
  if (!result.success) {
    composite = 0;
  }

  return {
    verification,
    functionalCompleteness: score.functionalCompleteness,
    maintainability,
    simplicity: score.simplicity,
    intentAlignment: score.intentAlignment,
    riskReduction,
    costEfficiency,
    uncertaintyPenalty,
    composite: clamp(composite, 0, 10),
    evidence,
    failures,
  };
}
