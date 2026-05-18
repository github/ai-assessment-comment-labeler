import type {
  CreateIssueCommentFn,
  GetIssueLabelsFn,
  AddIssueLabelsFn,
  RemoveIssueLabelFn,
} from "./types";
import { sanitizeLog } from "./utils";

const handleGitHubApiCall = async <T>(
  apiCall: () => Promise<T>,
  errorMessage: string,
  defaultValue: T,
): Promise<T> => {
  try {
    return await apiCall();
  } catch (error) {
    const sanitizedErrorMessage = sanitizeLog(errorMessage);
    const sanitizedError =
      error instanceof Error ? sanitizeLog(error.message) : sanitizeLog(error);

    console.error(sanitizedErrorMessage, sanitizedError);
    return defaultValue;
  }
};

export const createIssueComment: CreateIssueCommentFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  body,
}) => {
  return handleGitHubApiCall(
    async () => {
      const response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number,
        body,
      });
      if (response.status === 201) {
        console.log(
          "Comment created successfully:",
          sanitizeLog(response.data.html_url),
        );
        return true;
      } else {
        console.error(
          "Failed to create comment:",
          sanitizeLog(response.status),
        );
        return false;
      }
    },
    "Error creating issue comment:",
    false,
  );
};

export const getIssueLabels: GetIssueLabelsFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
}) => {
  return handleGitHubApiCall(
    async () => {
      const response = await octokit.rest.issues.listLabelsOnIssue({
        owner,
        repo,
        issue_number,
      });
      return response.data.map((label) => label.name);
    },
    "Error listing labels on issue:",
    undefined,
  );
};

export const addIssueLabels: AddIssueLabelsFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  labels,
}) => {
  return handleGitHubApiCall(
    async () => {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number,
        labels,
      });
      return true;
    },
    "Error adding labels to issue:",
    false,
  );
};

export const removeIssueLabel: RemoveIssueLabelFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  label,
}) => {
  return handleGitHubApiCall(
    async () => {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number,
        name: label,
      });
      console.log(
        sanitizeLog(`Label "${label}" removed from issue #${issue_number}`),
      );
      return true;
    },
    "Error removing labels from issue:",
    false,
  );
};
