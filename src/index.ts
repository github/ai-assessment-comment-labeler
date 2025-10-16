import { context, getOctokit } from "@actions/github";
import { getInput, setOutput } from "@actions/core";
import { aiInference } from "./ai";
import {
  getPromptFilesFromLabels,
  getAILabelAssessmentValue,
  writeActionSummary,
  getPromptOptions,
  getRegexFromString,
  getBaseFilename,
} from "./utils";
import {
  getIssueLabels,
  createIssueComment,
  addIssueLabels,
  removeIssueLabel,
} from "./api";
import type { Label } from "./types";

const main = async () => {
  // Required inputs
  const token = getInput("token") || process.env.GITHUB_TOKEN;
  const owner = getInput("owner") || context?.repo?.owner;
  const repo = getInput("repo_name") || context?.repo?.repo;

  const issueNumber = getInput("issue_number")
    ? parseInt(getInput("issue_number"), 10)
    : context?.payload?.issue?.number;
  const issueBody = getInput("issue_body");

  const promptsDirectory = getInput("prompts_directory");
  const aiReviewLabel = getInput("ai_review_label");
  const labelsToPromptsMapping = getInput("labels_to_prompts_mapping");

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

  const octokit = getOctokit(token);

  // AI configuration
  const endpoint = getInput("endpoint");
  const modelName = getInput("model");
  const maxTokens = getInput("max_tokens")
    ? parseInt(getInput("max_tokens"), 10)
    : undefined;

  // Optional suppressing inputs
  const suppressLabelsInput = getInput("suppress_labels") == "true";
  const suppressCommentsInput = getInput("suppress_comments") == "true";

  // Get Labels from the issue
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
      return;
    }
  }

  // Check if the issue requires AI review based on the aiReviewLabel
  const requireAiReview = issueLabels.some(
    (label) => label?.name == aiReviewLabel,
  );
  if (!requireAiReview) {
    console.log(
      `No AI review required. Issue does not have label: ${aiReviewLabel}`,
    );
    return;
  }

  // Remove the aiReviewLabel trigger label
  console.log(`Removing label: ${aiReviewLabel}`);
  await removeIssueLabel({
    octokit,
    owner,
    repo,
    issueNumber,
    label: aiReviewLabel,
  });

  // Get Prompt file based on issue labels and mapping
  const promptFiles = getPromptFilesFromLabels({
    issueLabels,
    labelsToPromptsMapping,
  });

  if (promptFiles.length === 0) {
    console.log(
      "No matching prompt files found. No issue labels matched the configured label-to-prompt mapping. " +
        "To run an AI assessment, add a label that corresponds to a prompt file configured in your workflow.",
    );
    return;
  }

  const labelsToAdd: string[] = [];
  const outPutAssessments = [];
  for (const promptFile of promptFiles) {
    console.log(`Using prompt file: ${promptFile}`);
    const promptOptions = getPromptOptions(promptFile, promptsDirectory);

    const aiResponse = await aiInference({
      token,
      content: issueBody,
      systemPromptMsg: promptOptions.systemMsg,
      endpoint: endpoint,
      maxTokens: maxTokens || promptOptions.maxTokens,
      modelName: modelName || promptOptions.model,
    });
    if (aiResponse) {
      if (
        suppressCommentsInput ||
        (noCommentRegex && noCommentRegex.test(aiResponse))
      ) {
        console.log("No comment creation as per AI response directive.");
      } else {
        const commentCreated = await createIssueComment({
          octokit,
          owner,
          repo,
          issueNumber,
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
        aiAssessmentRegex,
      );
      labelsToAdd.push(assessmentLabel);

      writeActionSummary({
        promptFile,
        aiResponse,
        assessmentLabel,
      });
      outPutAssessments.push({
        prompt: promptFile,
        assessmentLabel,
        response: aiResponse,
      });
    } else {
      console.log("No response received from AI.");
      const fileName = getBaseFilename(promptFile);
      labelsToAdd.push(`ai:${fileName}:unable-to-process`);
    }
  }

  setOutput("ai_assessments", JSON.stringify(outPutAssessments));

  if (suppressLabelsInput) {
    console.log("Label suppression is enabled. No labels will be added.");
    return;
  }

  if (labelsToAdd.length > 0) {
    console.log(`Adding labels: ${labelsToAdd.join(", ")}`);
    await addIssueLabels({
      octokit,
      owner,
      repo,
      issueNumber,
      labels: labelsToAdd,
    });
  } else {
    console.log("No labels to add found.");
  }
};

if (process.env.NODE_ENV !== "test") {
  main();
}
