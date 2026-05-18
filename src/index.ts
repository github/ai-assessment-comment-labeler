import ModelClient from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import { context, getOctokit } from "@actions/github";
import type { GitHub } from "@actions/github/lib/utils";
import { getInput, setOutput, getBooleanInput } from "@actions/core";
import { aiInference } from "./ai";
import {
  getPromptFilesFromLabels,
  getAILabelAssessmentValue,
  writeActionSummary,
  getPromptOptions,
  getRegexFromString,
  sanitizeLog,
  getBaseFilename,
} from "./utils";
import {
  getIssueLabels,
  createIssueComment,
  addIssueLabels,
  removeIssueLabel,
} from "./api";
import type { Label } from "./types";

const getWorkflowInputs = () => {
  const token = getInput("token") || process.env.GITHUB_TOKEN;
  const owner = getInput("owner") || context?.repo?.owner;
  const repo = getInput("repo_name") || context?.repo?.repo;

  const issueNumberInput = getInput("issue_number");
  const issueNumber = issueNumberInput
    ? parseInt(issueNumberInput, 10)
    : context?.payload?.issue?.number;
  const issueBody = getInput("issue_body");

  const promptsDirectory = getInput("prompts_directory");
  const aiReviewLabel = getInput("ai_review_label");
  const labelsToPromptsMapping = getInput("labels_to_prompts_mapping");

  if (
    !token ||
    !owner ||
    !repo ||
    !issueNumber ||
    !issueBody ||
    !promptsDirectory ||
    !aiReviewLabel ||
    !labelsToPromptsMapping
  ) {
    throw new Error("Required inputs are not set");
  }

  const assessmentRegexPattern = getInput("assessment_regex_pattern");
  const assessmentRegexFlags = getInput("assessment_regex_flags");

  const noCommentRegexPattern = getInput("no_comment_regex_pattern");
  const noCommentRegexFlags = getInput("no_comment_regex_flags");

  const aiAssessmentRegex = getRegexFromString(
    assessmentRegexPattern,
    assessmentRegexFlags,
  );
  const noCommentRegex = noCommentRegexPattern
    ? getRegexFromString(noCommentRegexPattern, noCommentRegexFlags)
    : null;

  return {
    token,
    owner,
    repo,
    issueNumber,
    issueBody,
    promptsDirectory,
    aiReviewLabel,
    labelsToPromptsMapping,
    aiAssessmentRegex,
    noCommentRegex,
  };
};

const getAiConfig = (token: string) => {
  const endpoint = getInput("endpoint");
  const modelName = getInput("model");
  const maxTokens = getInput("max_tokens")
    ? parseInt(getInput("max_tokens"), 10)
    : undefined;

  const client = ModelClient(endpoint, new AzureKeyCredential(token));

  const suppressLabelsInput = getBooleanInput("suppress_labels");
  const suppressCommentsInput = getBooleanInput("suppress_comments");

  return {
    endpoint,
    modelName,
    maxTokens,
    client,
    suppressLabelsInput,
    suppressCommentsInput,
  };
};

const resolveAiReviewStatus = async (params: {
  octokit: InstanceType<typeof GitHub>;
  owner: string;
  repo: string;
  issueNumber: number;
  aiReviewLabel: string;
}) => {
  const { octokit, owner, repo, issueNumber, aiReviewLabel } = params;

  let issueLabels: Label[] = context?.payload?.issue?.labels ?? [];
  if (!issueLabels || issueLabels.length === 0) {
    const labels = await getIssueLabels({
      octokit,
      owner,
      repo,
      issueNumber,
    });
    if (labels) {
      issueLabels = labels.map((name) => ({ name })) as Label[];
    } else {
      console.log("No labels found on the issue.");
      return { shouldProceed: false };
    }
  }

  const requireAiReview = issueLabels.some(
    (label) => label?.name === aiReviewLabel,
  );

  if (!requireAiReview) {
    console.log(
      `No AI review required. Issue does not have label: ${sanitizeLog(aiReviewLabel)}`,
    );
    return { shouldProceed: false };
  }

  console.log(`Removing label: ${sanitizeLog(aiReviewLabel)}`);
  const labelRemoved = await removeIssueLabel({
    octokit,
    owner,
    repo,
    issueNumber,
    label: aiReviewLabel,
  });
  if (!labelRemoved) {
    console.warn(`Failed to remove label: ${sanitizeLog(aiReviewLabel)}`);
  }

  return { shouldProceed: true, issueLabels };
};

export const main = async () => {
  const inputs = getWorkflowInputs();
  const octokit = getOctokit(inputs.token);
  const aiConfig = getAiConfig(inputs.token);

  const { shouldProceed, issueLabels } = await resolveAiReviewStatus({
    octokit: octokit as any,
    owner: inputs.owner,
    repo: inputs.repo,
    issueNumber: inputs.issueNumber as number,
    aiReviewLabel: inputs.aiReviewLabel,
  });

  if (!shouldProceed || !issueLabels) {
    return;
  }

  // Get Prompt file based on issue labels and mapping
  const promptFiles = getPromptFilesFromLabels({
    issueLabels,
    labelsToPromptsMapping: inputs.labelsToPromptsMapping,
  });

  if (promptFiles.length === 0) {
    console.log(
      "No matching prompt files found. No issue labels matched the configured label-to-prompt mapping. " +
        "To run an AI assessment, add a label that corresponds to a prompt file configured in your workflow.",
    );
    return;
  }

  const processPrompt = async (promptFile: string) => {
    console.log(`Using prompt file: ${sanitizeLog(promptFile)}`);
    const promptOptions = await getPromptOptions(
      promptFile,
      inputs.promptsDirectory,
    );

    const aiResponse = await aiInference({
      client: aiConfig.client,
      content: inputs.issueBody,
      systemPromptMsg: promptOptions.systemMsg,
      endpoint: aiConfig.endpoint,
      maxTokens: aiConfig.maxTokens || promptOptions.maxTokens,
      modelName: aiConfig.modelName || promptOptions.model,
    });

    if (aiResponse) {
      if (
        aiConfig.suppressCommentsInput ||
        (inputs.noCommentRegex && inputs.noCommentRegex.test(aiResponse))
      ) {
        console.log("No comment creation as per AI response directive.");
      } else {
        const commentCreated = await createIssueComment({
          octokit: octokit as any,
          owner: inputs.owner,
          repo: inputs.repo,
          issueNumber: inputs.issueNumber as number,
          body: aiResponse,
        });
        if (!commentCreated) {
          throw new Error("Failed to create comment");
        }
      }

      // Add the assessment label to the issue
      const assessmentLabel = getAILabelAssessmentValue(
        promptFile,
        aiResponse,
        inputs.aiAssessmentRegex,
      );

      writeActionSummary({
        promptFile,
        aiResponse,
        assessmentLabel,
      });

      return {
        label: assessmentLabel,
        assessment: {
          prompt: promptFile,
          assessmentLabel,
          response: aiResponse,
        },
      };
    } else {
      console.log("No response received from AI.");
      const fileName = getBaseFilename(promptFile);
      return {
        label: `ai:${fileName}:unable-to-process`,
        assessment: null,
      };
    }
  };

  const results = await Promise.all(promptFiles.map(processPrompt));
  const labelsToAdd = results.map((r) => r.label);
  const outPutAssessments = results
    .map((r) => r.assessment)
    .filter((a) => a !== null);

  setOutput("ai_assessments", JSON.stringify(outPutAssessments));

  if (aiConfig.suppressLabelsInput) {
    console.log("Label suppression is enabled. No labels will be added.");
    return;
  }

  if (labelsToAdd.length > 0) {
    console.log(`Adding labels: ${labelsToAdd.map(sanitizeLog).join(", ")}`);
    const labelsAdded = await addIssueLabels({
      octokit: octokit as any,
      owner: inputs.owner,
      repo: inputs.repo,
      issueNumber: inputs.issueNumber as number,
      labels: labelsToAdd,
    });
    if (!labelsAdded) {
      throw new Error("Failed to add labels to the issue");
    }
  } else {
    console.log("No labels to add found.");
  }
};

if (process.env.NODE_ENV !== "test") {
  main().catch((error) => {
    // If main fails, we want to ensure the error is properly handled
    // However, in our tests, main() is called directly.
    // In production, we catch it here just in case.
    if (error instanceof Error) {
      import("@actions/core").then(core => core.setFailed(error.message));
    }
  });
}
