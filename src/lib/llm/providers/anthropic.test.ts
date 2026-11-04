import { describe, expect, it } from "vitest";
import { thinkingOff } from "./anthropic";

describe("thinkingOff", () => {
  it("disables adaptive thinking on current Claude models so JSON answers are not cut", () => {
    expect(thinkingOff("claude-opus-5")).toEqual({ thinking: { type: "disabled" } });
    expect(thinkingOff("claude-sonnet-5")).toEqual({ thinking: { type: "disabled" } });
  });

  it("leaves older models alone", () => {
    expect(thinkingOff("claude-haiku-4-5")).toEqual({});
  });
});
