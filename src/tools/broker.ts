import { nanoid } from "nanoid";
import type {
  AgentRole,
  ParsedToolRequest,
  ToolEvidence,
  ToolName,
  ToolRequest,
  ToolUseConfig,
} from "../types/index.js";
import type { ToolAdapter, ToolAdapterResult, ToolBrokerRequest } from "./adapters.js";

export interface IncomingToolRequest extends ParsedToolRequest {
  requestedBy: AgentRole;
}

export interface ResolveRoundRequestsInput {
  nodeId: string;
  roundNumber: number;
  requests: IncomingToolRequest[];
  existingRequests?: ToolRequest[];
  existingEvidence?: ToolEvidence[];
  runRequestCount?: number;
  nodeRequestCount?: number;
}

export interface ResolveRoundRequestsResult {
  requests: ToolRequest[];
  evidence: ToolEvidence[];
}

export interface ToolBrokerConfig {
  config: ToolUseConfig;
  adapters: ToolAdapter[];
  now?: () => Date;
}

interface RequestGroup {
  toolName: ToolName;
  query: string;
  normalizedQuery: string;
  requesters: AgentRole[];
}

export class ToolBroker {
  private readonly config: ToolUseConfig;
  private readonly adapters: Map<ToolName, ToolAdapter>;
  private readonly now: () => Date;

  constructor({ config, adapters, now = () => new Date() }: ToolBrokerConfig) {
    this.config = config;
    this.adapters = new Map(adapters.map((adapter) => [adapter.toolName, adapter]));
    this.now = now;
  }

  async resolveRoundRequests(input: ResolveRoundRequestsInput): Promise<ResolveRoundRequestsResult> {
    const requests: ToolRequest[] = [];
    const evidence: ToolEvidence[] = [];
    const groups = groupRequests(input.requests);
    let completedThisRound = 0;
    let runRequestCount = input.runRequestCount ?? input.existingRequests?.length ?? 0;
    let nodeRequestCount =
      input.nodeRequestCount ??
      input.existingRequests?.filter((request) => request.nodeId === input.nodeId).length ??
      0;

    for (const group of groups) {
      const representative = {
        toolName: group.toolName,
        query: group.query,
        requestedBy: group.requesters[0],
      };
      const request = this.createRequest(input, representative, "pending");
      requests.push(request);

      const skipReason = this.validateGroup(group, {
        completedThisRound,
        runRequestCount,
        nodeRequestCount,
      });

      if (skipReason) {
        markSkipped(request, skipReason, this.timestamp());
        continue;
      }

      const existingEvidence = findEquivalentEvidence(input.existingEvidence ?? [], group);
      if (existingEvidence) {
        mergeAdditionalRequesters(existingEvidence, group.requesters);
        markSkipped(request, "Equivalent evidence already exists.", this.timestamp());
        continue;
      }

      const adapter = this.adapters.get(group.toolName);
      if (!adapter) {
        markSkipped(request, `No adapter registered for ${group.toolName}.`, this.timestamp());
        continue;
      }

      request.status = "running";

      try {
        const result = await adapter.execute(toAdapterRequest(group, input));
        request.status = "completed";
        request.completedAt = this.timestamp();
        evidence.push(this.createEvidence(input, request, group, result));
        completedThisRound += 1;
        runRequestCount += 1;
        nodeRequestCount += 1;
      } catch (error) {
        request.status = "failed";
        request.reason = error instanceof Error ? error.message : String(error);
        request.completedAt = this.timestamp();
      }
    }

    return { requests, evidence };
  }

  private validateGroup(
    group: RequestGroup,
    budget: { completedThisRound: number; runRequestCount: number; nodeRequestCount: number }
  ): string | undefined {
    if (!this.config.enabled) {
      return "Tool use is disabled.";
    }

    if (!this.config.allowlist.includes(group.toolName)) {
      return `${group.toolName} is not in the tool allowlist.`;
    }

    if (group.normalizedQuery.length === 0) {
      return "Tool request query is empty.";
    }

    if (budget.completedThisRound >= this.config.maxRequestsPerRound) {
      return "Skipped because round budget is exhausted.";
    }

    if (budget.nodeRequestCount >= this.config.maxRequestsPerNode) {
      return "Skipped because node budget is exhausted.";
    }

    if (budget.runRequestCount >= this.config.maxRequestsPerRun) {
      return "Skipped because run budget is exhausted.";
    }

    const adapter = this.adapters.get(group.toolName);
    if (!adapter) {
      return `No adapter registered for ${group.toolName}.`;
    }

    if (!adapter.readOnly || !this.config.autoRunReadOnly) {
      return `${group.toolName} was skipped because automatic read-only tool use is not allowed.`;
    }

    return undefined;
  }

  private createRequest(
    input: ResolveRoundRequestsInput,
    request: IncomingToolRequest,
    status: ToolRequest["status"]
  ): ToolRequest {
    return {
      id: `request-${nanoid(10)}`,
      toolName: request.toolName,
      query: normalizeQuery(request.query),
      requestedBy: request.requestedBy,
      nodeId: input.nodeId,
      roundNumber: input.roundNumber,
      status,
      createdAt: this.timestamp(),
    };
  }

  private createEvidence(
    input: ResolveRoundRequestsInput,
    request: ToolRequest,
    group: RequestGroup,
    result: ToolAdapterResult
  ): ToolEvidence {
    return {
      id: `evidence-${nanoid(10)}`,
      requestId: request.id,
      toolName: group.toolName,
      query: group.query,
      requestedBy: group.requesters[0],
      additionalRequesters: group.requesters.slice(1),
      nodeId: input.nodeId,
      roundNumber: input.roundNumber,
      summary: result.summary,
      findings: result.findings,
      decisionRelevance: result.decisionRelevance,
      constraintsDiscovered: result.constraintsDiscovered,
      risksDiscovered: result.risksDiscovered,
      openQuestions: result.openQuestions,
      sources: result.sources,
      limitations: result.limitations,
      confidence: result.confidence,
      createdAt: this.timestamp(),
    };
  }

  private timestamp(): string {
    return this.now().toISOString();
  }
}

function groupRequests(requests: IncomingToolRequest[]): RequestGroup[] {
  const groups = new Map<string, RequestGroup>();

  for (const request of requests) {
    const normalizedQuery = normalizeQuery(request.query).toLowerCase();
    const key = `${request.toolName}:${normalizedQuery}`;
    const existing = groups.get(key);

    if (existing) {
      if (!existing.requesters.includes(request.requestedBy)) {
        existing.requesters.push(request.requestedBy);
      }
      continue;
    }

    groups.set(key, {
      toolName: request.toolName,
      query: normalizeQuery(request.query),
      normalizedQuery,
      requesters: [request.requestedBy],
    });
  }

  return [...groups.values()];
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function findEquivalentEvidence(evidence: ToolEvidence[], group: RequestGroup): ToolEvidence | undefined {
  return evidence.find(
    (item) =>
      item.toolName === group.toolName && normalizeQuery(item.query).toLowerCase() === group.normalizedQuery
  );
}

function mergeAdditionalRequesters(evidence: ToolEvidence, requesters: AgentRole[]): void {
  const allRequesters = [evidence.requestedBy, ...evidence.additionalRequesters];

  for (const requester of requesters) {
    if (!allRequesters.includes(requester)) {
      evidence.additionalRequesters.push(requester);
      allRequesters.push(requester);
    }
  }
}

function toAdapterRequest(group: RequestGroup, input: ResolveRoundRequestsInput): ToolBrokerRequest {
  return {
    toolName: group.toolName,
    query: group.query,
    nodeId: input.nodeId,
    roundNumber: input.roundNumber,
  };
}

function markSkipped(request: ToolRequest, reason: string, completedAt: string): void {
  request.status = "skipped";
  request.reason = reason;
  request.completedAt = completedAt;
}
