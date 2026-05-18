import { describe, it, expect, mock, spyOn, afterEach } from "bun:test";
import { GitHub } from "@actions/github/lib/utils";
import { getIssueLabels, addIssueLabels, removeIssueLabel } from "../api";

describe("api", () => {
  const owner = "owner";
  const repo = "repo";
  const issueNumber = 123;

  // Clean up mocks after each test
  afterEach(() => {
    mock.restore();
  });

  describe("addIssueLabels", () => {
    it("should add multiple labels to an issue and return true", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const addLabelsMock = mock(() => Promise.resolve({}));
      const octokit = {
        rest: {
          issues: {
            addLabels: addLabelsMock,
          },
        },
      } as unknown as InstanceType<typeof GitHub>;

      const labels = ["bug", "test"];
      const result = await addIssueLabels({
        octokit,
        owner,
        repo,
        issueNumber,
        labels,
      });

      expect(result).toBe(true);
      expect(addLabelsMock).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should handle empty labels array and return true", async () => {
      const addLabelsMock = mock(() => Promise.resolve({}));
      const octokit = {
        rest: {
          issues: {
            addLabels: addLabelsMock,
          },
        },
      } as any;

      const labels: string[] = [];
      const result = await addIssueLabels({
        octokit,
        owner,
        repo,
        issueNumber,
        labels,
      });

      expect(result).toBe(true);
      expect(addLabelsMock).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: issueNumber,
        labels: [],
      });
    });

    it("should handle error when adding labels and return false", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("API Error");
      const addLabelsMock = mock(() => Promise.reject(error));
      const octokit = {
        rest: {
          issues: {
            addLabels: addLabelsMock,
          },
        },
      } as unknown as InstanceType<typeof GitHub>;

      const result = await addIssueLabels({
        octokit,
        owner,
        repo,
        issueNumber,
        labels: ["label"],
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error adding labels to issue:",
        error.message,
      );
      consoleSpy.mockRestore();
    });
  });

  describe("getIssueLabels", () => {
    it("should return an empty array if no labels are found", async () => {
      const listLabelsMock = mock(() => Promise.resolve({ data: [] }));
      const octokit = {
        rest: {
          issues: {
            listLabelsOnIssue: listLabelsMock,
          },
        },
      } as unknown as InstanceType<typeof GitHub>;

      const result = await getIssueLabels({
        octokit,
        owner,
        repo,
        issueNumber,
      });

      expect(result).toEqual([]);
      expect(listLabelsMock).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: issueNumber,
      });
    });

    it("should handle error when getting labels", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("API Error");
      const listLabelsMock = mock(() => Promise.reject(error));
      const octokit = {
        rest: {
          issues: {
            listLabelsOnIssue: listLabelsMock,
          },
        },
      } as unknown as InstanceType<typeof GitHub>;

      const result = await getIssueLabels({
        octokit,
        owner,
        repo,
        issueNumber,
      });

      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error listing labels on issue:",
        error.message,
      );
      consoleSpy.mockRestore();
    });
  });

  describe("removeIssueLabel", () => {
    it("should remove a label from an issue and return true", async () => {
      const consoleSpy = spyOn(console, "log").mockImplementation(() => {});
      const removeLabelMock = mock(() => Promise.resolve({}));
      const octokit = {
        rest: {
          issues: {
            removeLabel: removeLabelMock,
          },
        },
      } as unknown as InstanceType<typeof GitHub>;

      const label = "label-to-remove";
      const result = await removeIssueLabel({
        octokit,
        owner,
        repo,
        issueNumber,
        label,
      });

      expect(result).toBe(true);
      expect(removeLabelMock).toHaveBeenCalledWith({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      });
      consoleSpy.mockRestore();
    });

    it("should handle error when removing a label and return false", async () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("API Error");
      const removeLabelMock = mock(() => Promise.reject(error));
      const octokit = {
        rest: {
          issues: {
            removeLabel: removeLabelMock,
          },
        },
      } as unknown as InstanceType<typeof GitHub>;

      const result = await removeIssueLabel({
        octokit,
        owner,
        repo,
        issueNumber,
        label: "non-existent-label",
      });

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error removing labels from issue:",
        error.message,
      );
      consoleSpy.mockRestore();
    });
  });
});
