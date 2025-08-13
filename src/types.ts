import { GitHub } from "@actions/github/lib/utils";

export type AiInferenceFn = (
  params: AiInferenceParams,
) => Promise<string | undefined>;

interface AiInferenceParams {
  systemPromptMsg: string;
  endpoint: string;
  modelName: string;
  maxTokens: number;
  token: string;
  content: string;
}

export interface Label {
  name: string;
  description?: string;
}

export interface YamlData {
  messages: {
    role: "system" | "user";
    content: string;
  }[];
  model: string;
  modelParameters: {
    max_tokens: number;
  };
}

export interface GetPromptFileFromLabelsParams {
  issueLabels: Label[];
  labelsToPromptsMapping: string;
}
export interface WriteActionSummaryParams {
  promptFile: string;
  aiResponse: string;
  assessmentLabel: string;
}

export type GetPromptOptions = (
  promptFile: string,
  promptsDirectory: string,
) => {
  systemMsg: string;
  model: string;
  maxTokens: number;
};

export type CreateIssueCommentFn = (
  params: CreateCommentParams,
) => Promise<boolean>;

interface CreateCommentParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

export type AddIssueLabelsFn = (params: AddLabelsParams) => Promise<void>;

interface AddLabelsParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  labels: string[];
}

export type RemoveIssueLabelFn = (params: RemoveLabelParams) => Promise<void>;

interface RemoveLabelParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  label: string;
}

export type GetIssueLabelsFn = (
  params: GetLabelsParams,
) => Promise<string[] | undefined>;

interface GetLabelsParams {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
}
