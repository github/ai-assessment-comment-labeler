import { describe, it, expect, mock, beforeEach } from "bun:test";
import * as core from "@actions/core";
import { isUnexpected } from "@azure-rest/ai-inference";
import { aiInference } from "../ai";

// We already have mocks in setup-tests.ts, but we need to control isUnexpected here.

describe("aiInference error handling", () => {
  const mockConfig = {
    client: {} as any,
    endpoint: "https://example.com",
    modelName: "gpt-4",
    maxTokens: 100,
    content: "test content",
    systemPromptMsg: "system prompt",
  };

  beforeEach(() => {
    mock.restore();
    (core.setFailed as any).mockClear();
    (isUnexpected as any).mockReturnValue(false);
  });

  it("should call core.setFailed when isUnexpected is true and body.error is present", async () => {
    (isUnexpected as any).mockReturnValue(true);
    const errorMessage = "Specific AI Error";

    const postMock = mock(() =>
      Promise.resolve({
        status: "400",
        body: {
          error: { message: errorMessage },
        },
      }),
    );

    const clientMock = {
      path: mock(() => ({
        post: postMock,
      })),
    };

    await aiInference({
      ...mockConfig,
      client: clientMock as any,
    });

    expect(core.setFailed).toHaveBeenCalledWith(errorMessage);
  });

  it("should call core.setFailed with generic message when isUnexpected is true and body.error is absent", async () => {
    (isUnexpected as any).mockReturnValue(true);
    const status = "500";
    const body = "Internal Server Error";

    const postMock = mock(() =>
      Promise.resolve({
        status: status,
        body: body,
      }),
    );

    const clientMock = {
      path: mock(() => ({
        post: postMock,
      })),
    };

    await aiInference({
      ...mockConfig,
      client: clientMock as any,
    });

    const expectedMessage = `An error occurred while fetching the response (${status}): ${body}`;
    expect(core.setFailed).toHaveBeenCalledWith(expectedMessage);
  });

  it("should call core.setFailed when an exception is thrown", async () => {
    const postMock = mock(() => Promise.reject(new Error("Network Error")));

    const clientMock = {
      path: mock(() => ({
        post: postMock,
      })),
    };

    await aiInference({
      ...mockConfig,
      client: clientMock as any,
    });

    expect(core.setFailed).toHaveBeenCalledWith("Network Error");
  });
});
