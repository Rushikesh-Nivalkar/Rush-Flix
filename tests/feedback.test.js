import { describe, it, expect } from "vitest";
import { buildIssueBody } from "../src/components/FeedbackSection";

describe("feedback issue body", () => {
  it("has type, version and the text", () => {
    const b = buildIssueBody("bug", "  Player stuck  ");
    expect(b).toContain("**Type:** Bug Report");
    expect(b).toMatch(/\*\*App Version:\*\* \d+\.\d+\.\d+/);
    expect(b.endsWith("Player stuck")).toBe(true);
  });

  it("adds the puzzle log only when given", () => {
    expect(buildIssueBody("bug", "x", "**Puzzle checks**")).toContain("---\n\n**Puzzle checks**");
    expect(buildIssueBody("bug", "x")).not.toContain("Puzzle");
  });
});
