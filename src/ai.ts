import * as core from "@actions/core";
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import type { AiInferenceFn } from "./types";

export const aiInference: AiInferenceFn = async ({
  systemPromptMsg,
  endpoint,
  modelName,
  maxTokens,
  token,
  content,
}) => {
  try {
    console.log("AI configuration:");
    console.log(`Endpoint: ${endpoint}`);
    console.log(`Model: ${modelName}`);
    console.log(`Max Tokens: ${maxTokens}`);
    const client = ModelClient(endpoint, new AzureKeyCredential(token));

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
        "An error occurred while fetching the response (" +
          response.status +
          "): " +
          response.body,
      );
    }

    const modelResponse: string | null =
      response.body.choices[0].message.content;

    return modelResponse ?? undefined;
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
};
