import { describe, it, expect, mock, spyOn, afterEach } from "bun:test";
import { GitHub } from "@actions/github/lib/utils";
import { addIssueLabels } from "../api";

describe("API Log Injection Security", () => {
  const owner = "owner";
  const repo = "repo";
  const issueNumber = 123;

  afterEach(() => {
    mock.restore();
  });

  it("should sanitize error logs in handleGitHubApiCall", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    // Malicious error message
    const maliciousError = new Error("Malicious\nLog\nInjection");
    const addLabelsMock = mock(() => Promise.reject(maliciousError));
    const octokit = {
      rest: {
        issues: {
          addLabels: addLabelsMock,
        },
      },
    } as unknown as InstanceType<typeof GitHub>;

    await addIssueLabels({
      octokit,
      owner,
      repo,
      issueNumber,
      labels: ["label"],
    });

    const calls = consoleSpy.mock.calls;

    // After fix, no argument should contain a newline
    const containsNewline = calls.some((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("\n")),
    );

    expect(containsNewline).toBe(false);

    // Also verify it's actually sanitized
    expect(calls[0][0]).toBe("Error adding labels to issue:");
    expect(calls[0][1]).toBe("Malicious\\nLog\\nInjection");

    consoleSpy.mockRestore();
  });
});
