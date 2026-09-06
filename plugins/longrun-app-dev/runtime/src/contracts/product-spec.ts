import type { JsonValue } from "./common.js";

export interface ProductSpec {
  readonly schemaVersion: 1;
  readonly specId: string;
  readonly title: string;
  readonly summary: string;
  readonly background: string;
  readonly targetUsers: readonly TargetUser[];
  readonly problems: readonly string[];
  readonly scenarios: readonly UserScenario[];
  readonly features: readonly FeatureRequirement[];
  readonly nonFunctionalRequirements: readonly SpecRequirement[];
  readonly data: readonly DataRequirement[];
  readonly externalIntegrations: readonly ExternalIntegration[];
  readonly uxPrinciples: readonly string[];
  readonly constraints: readonly string[];
  readonly acceptanceCriteria: readonly AcceptanceCriterion[];
  readonly aiAssessment: AiAssessment;
}

export interface TargetUser {
  readonly id: string;
  readonly description: string;
  readonly needs: readonly string[];
}

export interface UserScenario {
  readonly id: string;
  readonly actorId: string;
  readonly goal: string;
  readonly steps: readonly string[];
  readonly expectedOutcome: string;
}

export interface SpecRequirement {
  readonly id: string;
  readonly description: string;
  readonly rationale?: string;
}

export interface FeatureRequirement extends SpecRequirement {
  readonly priority: "must" | "should" | "could";
  readonly acceptanceCriterionIds: readonly string[];
}

export interface DataRequirement {
  readonly id: string;
  readonly entity: string;
  readonly description: string;
  readonly attributes?: Readonly<Record<string, JsonValue>>;
}

export interface ExternalIntegration {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly required: boolean;
}

export interface AcceptanceCriterion {
  readonly id: string;
  readonly description: string;
  readonly verification: string;
}

export interface AiAssessment {
  readonly adopted: boolean;
  readonly rationale: string;
  readonly tasks: readonly AiTask[];
}

export interface AiTask {
  readonly id: string;
  readonly instruction: string;
  readonly tools: readonly string[];
  readonly expectedStateChanges: readonly string[];
  readonly acceptanceCriterionIds: readonly string[];
}
