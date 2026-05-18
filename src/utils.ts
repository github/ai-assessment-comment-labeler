import { summary } from "@actions/core";
import * as fs from "fs";
import * as path from "path";
import yaml from "js-yaml";
import type {
  GetPromptFileFromLabelsParams,
  GetPromptOptions,
  WriteActionSummaryParams,
  YamlData,
} from "./types";
import { DEFAULT_MAX_TOKENS } from "./constants";

export const getRegexFromString = (
  regexString: string,
  regexFlags: string,
): RegExp => {
  try {
    return new RegExp(regexString, regexFlags);
  } catch (error) {
    throw new Error(
      `Invalid regex pattern or flags provided: pattern="${regexString}", flags="${regexFlags}". Error: ${error}`,
    );
  }
};

export const writeActionSummary = ({
  promptFile,
  aiResponse,
  assessmentLabel,
}: WriteActionSummaryParams) => {
  summary
    .addHeading("Assessment Result")
    .addHeading("Assessment")
    .addCodeBlock(assessmentLabel)
    .addHeading("Prompt File")
    .addCodeBlock(promptFile)
    .addHeading("Details")
    .addCodeBlock(aiResponse)
    .write();
};

export const getBaseFilename = (promptFile: string): string =>
  promptFile.replace(/\.prompt\.y.*ml$/, "");

export const sanitizeLog = (
  input: string | number | boolean | null | undefined,
): string => JSON.stringify(String(input)).slice(1, -1);

export const getAILabelAssessmentValue = (
  promptFile: string,
  aiResponse: string,
  assessmentRegex: RegExp,
): string => {
  const fileName = getBaseFilename(promptFile);
  const lines = aiResponse.split("\n");
  let assessment = `ai:${fileName}:unsure`;

  for (const line of lines) {
    const match = line.match(assessmentRegex);
    if (match && match[1]) {
      const matchedAssessment = match[1].trim().toLowerCase();
      console.log(`Assessment found: ${sanitizeLog(matchedAssessment)}`);
      if (matchedAssessment) {
        assessment = `ai:${fileName}:${sanitizeLog(matchedAssessment)}`;
        break;
      }
    }
  }
  // Max 50 characters for labels
  return assessment.slice(0, 50);
};

export const getPromptFilesFromLabels = ({
  issueLabels,
  labelsToPromptsMapping,
}: GetPromptFileFromLabelsParams): string[] => {
  const promptFiles = new Set<string>();
  const labelsToPromptsMappingArr = labelsToPromptsMapping.split("|");
  // Optimization: Create a Set for O(1) lookup
  const issueLabelNames = new Set(issueLabels.map((l) => l?.name));

  for (const labelPromptMapping of labelsToPromptsMappingArr) {
    const parts = labelPromptMapping.split(",");
    if (parts.length >= 2) {
      const labelName = parts[0].trim();
      if (issueLabelNames.has(labelName)) {
        promptFiles.add(parts[1].trim());
      }
    }
  }

  return Array.from(promptFiles);
};

export const getPromptOptions: GetPromptOptions = async (
  promptFile,
  promptsDirectory,
) => {
  const resolvedPromptsDir = path.resolve(process.cwd(), promptsDirectory);
  const resolvedPromptFile = path.resolve(resolvedPromptsDir, promptFile);

  if (
    path.isAbsolute(promptFile) ||
    !resolvedPromptFile.startsWith(resolvedPromptsDir) ||
    path.relative(resolvedPromptsDir, resolvedPromptFile).startsWith("..")
  ) {
    throw new Error(`Invalid prompt file path: ${promptFile}`);
  }

  const fileContents = await fs.promises.readFile(resolvedPromptFile, "utf-8");
  if (!fileContents) {
    throw new Error(`System prompt file not found: ${promptFile}`);
  }
  // Parse the YAML content
  try {
    const yamlData = yaml.load(fileContents) as YamlData;
    if (!yamlData || !Array.isArray(yamlData?.messages)) {
      throw new Error("Invalid YAML format in the prompt file");
    }
    // Find the system message
    const systemMsg = yamlData.messages.find(
      (msg: { role: string }) => msg.role === "system",
    );
    if (!systemMsg || !systemMsg.content) {
      throw new Error("System message not found in the prompt file");
    }
    // Return the content of the system message
    return {
      systemMsg: systemMsg.content,
      model: yamlData?.model,
      maxTokens: yamlData?.modelParameters?.max_tokens || DEFAULT_MAX_TOKENS,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unable to parse system prompt file: ${error.message}`);
    } else {
      throw new Error("Unable to parse system prompt file");
    }
  }
};
