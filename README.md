# AI Issue Assessment Commenter

> GitHub Action to automatically assess issues with an AI model, post (or optionally suppress) a structured review comment, and apply standardized AI derived labels based on configurable prompt files.

## Table of Contents
- [AI Issue Assessment Commenter](#ai-issue-assessment-commenter)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [How It Works](#how-it-works)
  - [Features](#features)
  - [Prompt File Schema](#prompt-file-schema)
  - [Inputs](#inputs)
  - [Label → Prompt Mapping](#label--prompt-mapping)
  - [Regex Customization](#regex-customization)
  - [Suppressing Labels \& Comments](#suppressing-labels--comments)
    - [Behavior Matrix](#behavior-matrix)
    - [Example Regex Based Comment Suppression](#example-regex-based-comment-suppression)
  - [Example Workflow Setup](#example-workflow-setup)
  - [Outputs / Labels Added](#outputs--labels-added)
    - [Labels](#labels)
    - [Output: `ai_assessments`](#output-ai_assessments)
  - [Required Permissions](#required-permissions)
  - [Troubleshooting](#troubleshooting)
  - [Development](#development)
    - [Testing](#testing)
    - [Releasing](#releasing)
  - [Contributing](#contributing)
  - [Security / Reporting Issues](#security--reporting-issues)
  - [FAQ](#faq)
  - [License](#license)

## Overview
This action evaluates newly labeled GitHub Issues using an AI model available through **GitHub Models** (or a compatible endpoint you provide) and:
1. Selects one or more prompt configuration files based on existing labels applied to the issue.
2. Runs inference with the chosen model & system prompt.
3. Extracts an "assessment" value from the AI response (via a configurable regex) and converts it into a standardized label of the form:
   `ai:<prompt-stem>:<assessment>` (lowercased, spaces preserved unless you modify regex or post processing).
4. Optionally posts the full AI response as a comment (unless a suppression marker is detected).
5. Removes the trigger label so the process is idempotent and can be retriggered manually by re‑adding it.

## How It Works
High level flow:
1. Issue receives a trigger label (e.g. `request ai review`).
2. Action runs and gathers all labels applied to the issue.
3. Each label is checked against your `labels_to_prompts_mapping` list.
4. For each matched prompt file:
   - System prompt + model + max tokens are resolved (overrides from workflow inputs if provided).
   - Inference is executed with the issue body as user content.
   - Response is scanned:
     - Optional "no comment" directive → skip comment.
     - Assessment header line → derive label.
   - Summary written to the job summary.
5. All derived labels are added; trigger label is removed.

## Features
- Multiple prompt files per issue (supports multifaceted assessments).
- Per prompt inference (each prompt gets its own AI run & resulting label).
- Override model / max tokens at workflow level or rely on prompt file.
- Configurable assessment extraction via regex.
- Configurable comment suppression via regex.
- Clear action summary with raw AI output + derived assessment.
- Works with any model accessible via the GitHub Models API endpoint you specify.

## Prompt File Schema
Example `.prompt.yml` file:
```yaml
messages:
  - role: system
    content: >+
      You are a world-class product manager that will help decide whether a particular bug report is completely filled out and able to start being worked on by a team member.
      1. Given a bug report analyze it for the following key elements: a clear description of the problem, steps to reproduce, expected versus actual behavior, and any relevant visual proof. 
      2. Rate each element provided in the report as `complete`, `incomplete`, or `unable to determine` except for Screenshots if included. Justify the rating by explaining what is missing or unclear in each element.
      3. The title of the response should be based on the overall completeness rating of all the provided elements. For example: "### AI Assessment: Ready for Review" if complete, "### AI Assessment: Missing Details" if incomplete, or "### AI Assessment: Unsure" if unable to determine.
      4. When determining the overall completeness rating do not include the Screenshots or relevant visual proof section. This section is more of a "nice to have" versus "hard requirement" and it should be ignored. 
  - role: user
    content: '{{input}}'
model: openai/gpt-4o-mini
modelParameters:
  max_tokens: 100
testData: []
evaluators: []
```
Required elements:
- `messages`: Must include at least one `system` and one `user` with `{{input}}` placeholder.
- `model`: A model identifier in `{publisher}/{model_name}` format compatible with GitHub Models.
- `modelParameters.max_tokens` (optional) used if workflow input `max_tokens` not provided.

## Inputs
Various inputs are defined in [`action.yml`](action.yml):

| Name | Description | Required | Default |
| :-- | :-- | :-- | :-- |
| `token` | Token for API calls (usually `${{ secrets.GITHUB_TOKEN }}`) | true | `github.token` |
| `ai_review_label` | Label that triggers AI processing | true | |
| `issue_number` | Issue number | true | |
| `issue_body` | Issue body to feed into AI | true | |
| `prompts_directory` | Directory containing `.prompt.yml` files, relative to the root of the project | true | |
| `labels_to_prompts_mapping` | Mapping string `label,prompt.yml\|label2,prompt2.yml` | true | |
| `model` | Override model (falls back to prompt file) | false | |
| `endpoint` | Inference endpoint | false | `https://models.github.ai/inference` |
| `max_tokens` | Override max tokens (else prompt file else 200) | false | 200 |
| `repo_name` | Repository name (auto detected) | false | |
| `owner` | Repository owner (auto detected) | false | |
| `assessment_regex_pattern` | Pattern to capture assessment line | false | `^###.*[aA]ssessment:\s*(.+)$` |
| `assessment_regex_flags` | Flags for assessment regex | false | |
| `no_comment_regex_pattern` | Pattern to detect comment suppression | false | |
| `no_comment_regex_flags` | Flags for suppress pattern | false | |
| `suppress_labels` | If `true`, do not add derived `ai:` labels (still sets output) | false | `false` |
| `suppress_comments` | If `true`, never post AI response comments | false | `false` |

## Label → Prompt Mapping
Provide a single string where pairs are separated by `|` and each pair is `label,prompt-file-name`. Example:
```
labels_to_prompts_mapping: 'bug,bug-review.prompt.yml|support request,request-intake.prompt.yml|security,security-assessment.prompt.yml'
```
Rules:
- Matching is case sensitive to how GitHub returns labels.
- A label may map to only one prompt file (first match used if duplicates are present).
- Multiple labels can each trigger their prompt; all selected prompts are processed.

## Regex Customization
Default assessment extraction looks for any markdown header starting with `###` and containing `Assessment:` (case insensitive if you supply `i` flag) and captures the remainder of the line:
```
^###.*[aA]ssessment:\s*(.+)$
```
Example variations:
- Want stricter title: `^### AI Assessment:\s*(.+)$`
- Want to allow other synonyms: `^###.*(Assessment|Alignment):\s*(.+)$` (then handle capture group 2 in post processing—current implementation expects one capture group, so keep a single `(.+)`).

If your header is like:
```
## Result: Passed
```
You could set:
```
assessment_regex_pattern: '^## Result:\s*(.+)$'
```

## Suppressing Labels & Comments
You have three mechanisms to control side‑effects (labels, comments):

1. Runtime flags:
  - `suppress_comments: true` → Never create an issue comment with the AI response.
  - `suppress_labels: true` → Never add the derived `ai:<prompt-stem>:<assessment>` labels.
2. Regex directive suppression:
  - Provide `no_comment_regex_pattern` (& optional flags) to let the AI itself decide when to skip commenting by emitting a marker inside the response (e.g. an HTML comment token).
3. Leaving both off (default) → Always attempts to comment (unless regex matches) and always adds labels.

### Behavior Matrix
| Setting / Condition | Comment Posted | Labels Added | Output `ai_assessments` |
| ------------------- | -------------- | ------------ | ----------------------- |
| defaults (no suppress flags, no regex match) | Yes | Yes | Yes |
| `suppress_comments: true` | No | Yes | Yes |
| `suppress_labels: true` | Yes (unless regex suppresses) | No | Yes |
| both suppress flags true | No | No | Yes |
| regex match only | No | Yes | Yes |

Notes:
- The JSON output (`ai_assessments`) is always produced regardless of suppression so you can post‑process in later steps.
- If you rely on regex suppression ensure your system prompt instructs the model precisely when to emit the marker.

### Example Regex Based Comment Suppression
Add an instruction in the system prompt to emit a marker when you only want labeling. Example system instruction snippet:
```
If the overall assessment is fully ready, append: <!-- no-comment -->
```
Then configure in the workflow inputs:
```
no_comment_regex_pattern: '<!--.*no.*comment.*-->'
no_comment_regex_flags: 'i'
```
When the pattern is found (and `suppress_comments` is not already true), the comment step is skipped; labels (unless `suppress_labels` true) and summary still generated.

## Example Workflow Setup
Below is an example workflow file. It triggers whenever a label is added, checks for the trigger label, processes, then removes it.
```yaml
name: AI Issue Assessment
on:
  issues:
    types: [labeled]
jobs:
  ai-assessment:
    if: github.event.label.name == 'request ai review'
    runs-on: ubuntu-latest
    permissions:
      issues: write
      models: read
      contents: read
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4

      - name: Run AI assessment
        id: ai-assessment
        uses: github/ai-assessment-comment-labeler@main
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          issue_number: ${{ github.event.issue.number }}
          issue_body: ${{ github.event.issue.body }}
          repo_name: ${{ github.event.repository.name }}
          owner: ${{ github.repository_owner }}
          ai_review_label: 'request ai review'
          prompts_directory: './Prompts'
          labels_to_prompts_mapping: 'bug,bug-review.prompt.yml|support request,request-intake.prompt.yml'
```
Multiple prompts example with custom overrides:
```yaml
with:
  model: openai/gpt-4o-mini
  max_tokens: 300
  labels_to_prompts_mapping: 'bug,bug-review.prompt.yml|performance,perf-triage.prompt.yml|design,ux-assessment.prompt.yml'
```

## Outputs / Labels Added
### Labels
For each prompt file used (e.g. `bug-review.prompt.yml`), the assessment line text (after `Assessment:`) is:
1. Lowercased
2. Prefixed with `ai:<prompt-stem>:` where `<prompt-stem>` is the file name without extension and trailing `-prompt` parts preserved.

Examples:
- `### AI Assessment: Ready for Review` → `ai:bug-review:ready for review`
- `### AI Assessment: Missing Details` → `ai:bug-review:missing details`
- No header found → `ai:bug-review:unsure`

These labels let you filter, search, or automate additional workflows. Labels are skipped entirely when `suppress_labels: true`.

### Output: `ai_assessments`
The action always sets a structured output named `ai_assessments` containing an array of objects (one per processed prompt) with:
```
[
  {
    "prompt": "bug-review.prompt.yml",
    "assessmentLabel": "ai:bug-review:ready for review",
    "response": "### AI Assessment: Ready for Review\n...full model response..."
  },
  {
    "prompt": "perf-triage.prompt.yml",
    "assessmentLabel": "ai:perf-triage:potential regression",
    "response": "### AI Assessment: Potential Regression\n..."
  }
]
```
Use this for downstream steps regardless of whether you suppressed labels or comments. Example consumption in a workflow step:
```yaml
- name: Parse Results
  uses: actions/github-script@v7
  env:
    ASSESSMENT_OUTPUT: ${{ steps.ai-assessment.outputs.ai_assessments }} 
  with:
    script: |
      const assessments = JSON.parse(process.env.ASSESSMENT_OUTPUT);
      for (const assessment of assessments) {
        console.log(`Prompt File: ${assessment.prompt}`);
        console.log(`Label: ${assessment.assessmentLabel}`);
        console.log(`AI Response: ${assessment.response}`);
        core.summary.addRaw(`***Prompt File*:** ${assessment.prompt}\n**Label:** ${assessment.assessmentLabel}\n**AI Response:** ${assessment.response}\n\n`);
      }
      core.summary.write();
```
You can also feed this JSON to later automation (e.g. create a summary table, open follow-up issues, trigger notifications).

## Required Permissions
Recommended minimal permissions block:
```yaml
permissions:
  issues: write   # create comment & add/remove labels
  models: read    # access GitHub Models inference
  contents: read  # read prompt files
```

## Troubleshooting
| Symptom | Likely Cause | Fix |
| --- | --- | --- |
| Action exits early: "Required inputs are not set" | Missing mandatory input | Ensure all required `with:` fields are present |
| "No prompt files found. No issue labels matched..." | Issue doesn't have a label that maps to a prompt | Add a label that corresponds to one in your `labels_to_prompts_mapping` (e.g., `bug`, `support request`) |
| No labels added | Assessment regex failed | Adjust `assessment_regex_pattern` / flags |
| Comment missing | Suppression regex matched | Remove or modify `no_comment_regex_pattern` |
| Fallback label `unsure` | No header matched regex | Update system prompt to ensure header form |
| Model error | Unsupported or misspelled model | Verify model exists in GitHub Models catalog |
| 404 prompt file | Wrong `prompts_directory` path | Ensure path relative to repo root |

Enable debug logs by setting in workflow:
```
env:
  ACTIONS_STEP_DEBUG: true
```
(Requires enabling debug logging in repository settings.)

## Development
Local development steps:
```bash
# Install dependencies
bun install

# Lint
bun run lint

# Auto fix + build dist
bun run build

# Run locally (requires env vars if outside GitHub Actions)
GITHUB_TOKEN=ghp_xxx ISSUE_NUMBER=1 bun run src/index.ts
```
Key scripts (`package.json`): `lint`, `lintFix`, `build`.
The action bundles to `dist/index.js` (Node 20 runtime).

### Testing
Basic tests live under `src/__tests__`. Add additional parsing / utility tests as needed.

### Releasing
- Update version tag or reference a commit SHA in downstream workflows.
- Optionally create a Git tag & release notes summarizing changes.

## Contributing
See [`CONTRIBUTING.md`](CONTRIBUTING.md) & follow the code of conduct in [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).

## Security / Reporting Issues
For vulnerability disclosures follow [`SECURITY.md`](SECURITY.md). Please do not open public issues for sensitive reports.

## FAQ
**Q: Can I run multiple prompts in one execution?**  Yes, any label in the mapping that matches the issue produces a separate inference & label.

**Q: How do I force a re-run?**  Re-add the trigger label.

**Q: Can I use a completely different header phrase?**  Yes, adjust `assessment_regex_pattern` to capture the desired line; the first capture group is used as the assessment value.

**Q: Can I trim / normalize spaces?**  Current implementation lowercases assessment as is. You can post process by adding a follow up workflow reacting to `labeled` events.

**Q: Will it modify existing AI labels?**  It only adds new labels; it does not remove prior `ai:` labels. Clean up logic can be added in a future enhancement.

## License
See [`LICENSE.txt`](LICENSE.txt).
