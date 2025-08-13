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

const MAX_TOKENS = 200;

export const getRegexFromString = (
  regexString: string,
  regexFlags: string,
): RegExp => {
  let regex;
  try {
    regex = new RegExp(regexString, regexFlags);
    console.log("Debug: Constructed regex:", regex);
  } catch (error) {
    throw new Error(
      `Invalid regex pattern or flags provided: pattern="${regexString}", flags="${regexFlags}". Error: ${error}`,
    );
  }
  return regex;
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
      console.log(`Assessment found: ${matchedAssessment}`);
      if (matchedAssessment) {
        assessment = `ai:${fileName}:${matchedAssessment}`;
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
  const promptFiles = [];
  const labelsToPromptsMappingArr = labelsToPromptsMapping.split("|");
  for (const labelPromptMapping of labelsToPromptsMappingArr) {
    const labelPromptArr = labelPromptMapping.split(",").map((s) => s.trim());
    const labelMatch = issueLabels.some(
      (label) => label?.name == labelPromptArr[0],
    );
    if (labelMatch) {
      promptFiles.push(labelPromptArr[1]);
    }
  }

  return promptFiles;
};

export const getPromptOptions: GetPromptOptions = (
  promptFile,
  promptsDirectory,
) => {
  const fileContents = fs.readFileSync(
    path.resolve(process.cwd(), promptsDirectory, promptFile),
    "utf-8",
  );
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
      maxTokens: yamlData?.modelParameters?.max_tokens || MAX_TOKENS,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error("Unable to parse system prompt file: " + error.message);
    } else {
      throw new Error("Unable to parse system prompt file");
    }
  }
};
