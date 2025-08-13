import { describe, it, expect } from "bun:test";
import {
  getPromptOptions,
  getAILabelAssessmentValue,
  getPromptFilesFromLabels,
  getRegexFromString,
  getBaseFilename,
} from "../utils";

describe("getPromptOptions", () => {
  it("should return the system content field from test-intake.yml", () => {
    const requestIntakePrompt =
      'You are a world-class product manager that will help decide whether a particular Request is in alignment with the Team charter.\n1. Review the request that is given to you.\n2. Use the Team charter to give feedback on how aligned it is.\n3. Determine whether or not the request is `aligned`, `not-aligned`, or `neutral` based on the alignment with each of the following four strategic trade-offs:\n    - **Scalable > bespoke**: Scalable, customizable solutions **over** individual or team-specific solutions.\n    - **GitHub + AI > scratch-built tools**: Build with GitHub (and improve GitHub if that doesn\'t work) and AI **over** building from scratch and by hand.  \n    - **Bold > safe**: Try something new and ambitious (including unproven technologies) **over** doing what everyone else is doing.\n    - **Ship to learn > plan to plan**: Fast experimentation and research **over** long-term, large programs - as in “ship to learn” a core GitHub value.\n4. The title of the response should be based on the overall alignment of all the strategic trade-offs. For example: "### Alignment Assessment: Aligned", "### Alignment Assessment: Neutral", or "### Alignment Assessment: Not-aligned"\n5. Give feedback on how the request might be more in alignment with the charter.\n\nCharter: Our mission is to reduce inefficiencies, eliminate repetitive toil, and enable higher velocity. We will empower teams with smarter processes and tools by building innovative automation solutions. By thinking big and experimenting ambitiously with cutting-edge technologies, we’re here to make your work easier, faster, and more impactful in ways that differentiate us from broader Core Ops initiatives.\n\n';
    expect(
      getPromptOptions("test-intake.yml", "./src/__tests__/test_prompts"),
    ).toEqual({
      systemMsg: requestIntakePrompt,
      model: "openai/gpt-4o-mini",
      maxTokens: 100,
    });
  });

  it("should return the system content field from test-bug.yml", () => {
    const bugIntakePrompt =
      'You are a world-class product manager that will help decide whether a particular bug report is completely filled out and able to start being worked on by a team member. 1. Given a bug report analyze it for the following key elements: a clear description of the problem, steps to reproduce, expected versus actual behavior, and any relevant visual proof.  2. Rate each element provided in the report as `complete`, `incomplete`, or `unable to determine` except for Screenshots if included. Justify the rating by explaining what is missing or unclear in each element. 3. The title of the response should be based on the overall completeness rating of all the provided elements. For example: "### AI Assessment: Ready for Review" if complete, "### AI Assessment: Missing Details" if incomplete, or "### AI Assessment: Unsure" if unable to determine. 4. When determining the overall completeness rating do not include the Screenshots or relevant visual proof section. This section is more of a "nice to have" versus "hard requirement" and it should be ignored. \n';
    expect(
      getPromptOptions("test-bug.yml", "./src/__tests__/test_prompts"),
    ).toEqual({
      systemMsg: bugIntakePrompt,
      model: "openai/gpt-4o-mini",
      maxTokens: 100,
    });
  });
});

describe("getAILabelAssessmentValue", () => {
  const aiAssessmentRegex = new RegExp("^###.*assessment:\\s*(.+)$", "i");

  it("should return 'ai:aligned' for aligned assessment", () => {
    const aiResponse =
      "### Alignment Assessment: Aligned\nThe request is fully aligned with the team charter.";
    expect(
      getAILabelAssessmentValue(
        "intake-prompt.prompt.yml",
        aiResponse,
        aiAssessmentRegex,
      ),
    ).toEqual("ai:intake-prompt:aligned");
  });

  it("should return 'ai:not aligned' for not aligned assessment", () => {
    const aiResponse =
      "### Alignment Assessment: Not Aligned\nThe request does not align with the team charter.";
    expect(
      getAILabelAssessmentValue(
        "bug-prompt.prompt.yml",
        aiResponse,
        aiAssessmentRegex,
      ),
    ).toEqual("ai:bug-prompt:not aligned");
  });

  it("should return 'ai:unsure' if no assessment present", () => {
    const aiResponse =
      "### AI Assessment:\nThe request lacks sufficient information.";
    expect(
      getAILabelAssessmentValue(
        "bug.prompt.yml",
        aiResponse,
        aiAssessmentRegex,
      ),
    ).toEqual("ai:bug:unsure");
  });

  it("should handle 'Alignment Assessment: Neutral' case", () => {
    const aiResponse =
      "### Alignment Assessment: Neutral\nFeedback on Strategic Trade-offs:";
    expect(
      getAILabelAssessmentValue(
        "test.prompt.yml",
        aiResponse,
        aiAssessmentRegex,
      ),
    ).toEqual("ai:test:neutral");
  });

  it("should work with the default action regex (case-sensitive)", () => {
    const defaultRegex = new RegExp("^###.*[aA]ssessment:\\s*(.+)$", "");
    const aiResponse = "### Alignment Assessment: Neutral";
    expect(
      getAILabelAssessmentValue("test.prompt.yml", aiResponse, defaultRegex),
    ).toEqual("ai:test:neutral");
  });
});

describe("getPromptFilesFromLabels", () => {
  it("should return the request-intake.prompt.yml file for the suport request label", () => {
    const issueLabels = [
      { name: "request ai review" },
      { name: "support request" },
    ];
    const labelsToPromptsMapping =
      "support request,request-intake.prompt.yml|bug,bug-review.prompt.yml";

    expect(
      getPromptFilesFromLabels({
        issueLabels,
        labelsToPromptsMapping,
      }),
    ).toEqual(["request-intake.prompt.yml"]);
  });

  it("should return the bug-review.prompt.yml file for the bug label", () => {
    const issueLabels = [{ name: "request ai review" }, { name: "bug" }];
    const labelsToPromptsMapping =
      "support request,request-intake.prompt.yml|bug,bug-review.prompt.yml";

    expect(
      getPromptFilesFromLabels({
        issueLabels,
        labelsToPromptsMapping,
      }),
    ).toEqual(["bug-review.prompt.yml"]);
  });
});

describe("getRegexFromString", () => {
  it("should create a valid regex with pattern and flags", () => {
    const regex = getRegexFromString("test", "gi");
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.source).toBe("test");
    expect(regex.flags).toBe("gi");
  });

  it("should create a regex with no flags", () => {
    const regex = getRegexFromString("hello", "");
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.source).toBe("hello");
    expect(regex.flags).toBe("");
  });

  it("should create a case-insensitive regex", () => {
    const regex = getRegexFromString("Assessment", "i");
    expect(regex.test("assessment")).toBe(true);
    expect(regex.test("ASSESSMENT")).toBe(true);
  });

  it("should throw error for invalid regex pattern", () => {
    expect(() => {
      getRegexFromString("[invalid", "");
    }).toThrow(/Invalid regex pattern or flags provided/);
  });

  it("should throw error for invalid regex flags", () => {
    expect(() => {
      getRegexFromString("valid", "x");
    }).toThrow(/Invalid regex pattern or flags provided/);
  });

  it("should handle complex regex patterns", () => {
    const regex = getRegexFromString("^###.*[aA]ssessment:\\s*(.+)$", "");
    expect(regex).toBeInstanceOf(RegExp);
    expect(regex.test("### Alignment Assessment: Aligned")).toBe(true);
  });

  it("should handle hidden text regex patterns", () => {
    const regex = getRegexFromString("<!--.*no.*comment.*-->", "gmi");
    expect(regex).toBeInstanceOf(RegExp);
    expect(
      regex.test("### Well-form: Yes\n<!-- NO-COMMENT -->\nThis is a test."),
    ).toBe(true);
  });
});

describe("getBaseFilename", () => {
  it("should return the base filename without extension", () => {
    const result = getBaseFilename("test.prompt.yml");
    expect(result).toEqual("test");
  });

  it("should handle files with multiple extensions", () => {
    const result = getBaseFilename("test.prompt.yaml");
    expect(result).toEqual("test");
  });

  it("should return the original filename if no prompt extension", () => {
    const result = getBaseFilename("test.txt");
    expect(result).toEqual("test.txt");
  });
});
