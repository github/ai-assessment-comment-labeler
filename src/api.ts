import type {
  CreateIssueCommentFn,
  GetIssueLabelsFn,
  AddIssueLabelsFn,
  RemoveIssueLabelFn,
} from "./types";

export const createIssueComment: CreateIssueCommentFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  body,
}) => {
  try {
    const response = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number,
      body,
    });
    if (response.status === 201) {
      console.log("Comment created successfully:", response.data.html_url);
      return true;
    } else {
      console.error("Failed to create comment:", response.status);
      return false;
    }
  } catch (error) {
    console.error("Error creating issue comment:", error);
    return false;
  }
};

export const getIssueLabels: GetIssueLabelsFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
}) => {
  try {
    const response = await octokit.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number,
    });
    return response.data.map((label) => label.name);
  } catch (error) {
    console.error("Error listing labels on issue:", error);
  }
};

export const addIssueLabels: AddIssueLabelsFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  labels,
}) => {
  try {
    await octokit.rest.issues.addLabels({ owner, repo, issue_number, labels });
  } catch (error) {
    console.error("Error adding labels to issue:", error);
  }
};

export const removeIssueLabel: RemoveIssueLabelFn = async ({
  octokit,
  owner,
  repo,
  issueNumber: issue_number,
  label,
}) => {
  try {
    await octokit.rest.issues.removeLabel({
      owner,
      repo,
      issue_number,
      name: label,
    });
    console.log(`Label "${label}" removed from issue #${issue_number}`);
  } catch (error) {
    console.error("Error removing labels from issue:", error);
  }
};
