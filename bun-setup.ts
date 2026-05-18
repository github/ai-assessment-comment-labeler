import { mock } from "bun:test";
import * as fs from "fs";

mock.module("@actions/core", () => ({
  getInput: mock(),
  getBooleanInput: mock(),
  setOutput: mock(),
  info: mock(),
  error: mock(),
  warning: mock(),
  debug: mock(),
  summary: {
    addHeading: mock(function(this: any) { return this; }),
    addCodeBlock: mock(function(this: any) { return this; }),
    write: mock(function(this: any) { return this; }),
  },
  setFailed: mock(),
}));

mock.module("@actions/github", () => ({
  context: {
    repo: { owner: "test-owner", repo: "test-repo" },
    payload: { issue: { number: 1, labels: [] } },
  },
  getOctokit: mock(),
}));

// Provide a working mock for fs.promises.readFile if needed,
// but here it seems the tests expect it to work with real files or they mock it themselves.
// The issue is that some tests mock it and others don't, and they leak.
// Let's try NOT mocking it globally first.
