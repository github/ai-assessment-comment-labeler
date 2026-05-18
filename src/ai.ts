import * as core from "@actions/core";
import { isUnexpected } from "@azure-rest/ai-inference";
import type { AiInferenceFn } from "./types";
import { sanitizeLog } from "./utils";

export const aiInference: AiInferenceFn = async ({
  systemPromptMsg,
  endpoint,
  client,
  modelName,
  maxTokens,
  content,
}) => {
  try {
    console.log("AI configuration:");
    console.log(`Endpoint: ${sanitizeLog(endpoint)}`);
    console.log(`Model: ${sanitizeLog(modelName)}`);
    console.log(`Max Tokens: ${sanitizeLog(maxTokens)}`);

    const response = await client.path("/chat/completions").post({
      body: {
        messages: [
          {
            role: "system",
            content: systemPromptMsg,
          },
          { role: "user", content },
        ],
        max_tokens: maxTokens,
        model: modelName,
      },
    });

    if (isUnexpected(response)) {
      if (response.body.error) {
        throw response.body.error;
      }
      throw new Error(
        `An error occurred while fetching the response (${response.status}): ${JSON.stringify(response.body)}`,
      );
    }

    const modelResponse: string | null =
      response.body.choices[0].message.content;

    return modelResponse ?? undefined;
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else if (typeof error === "string") {
      core.setFailed(error);
    } else if (
      typeof error === "object" &&
      error !== null &&
      "message" in error
    ) {
      core.setFailed(String((error as { message: unknown }).message));
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
};
