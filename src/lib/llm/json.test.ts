import { describe, expect, it } from "vitest";
import { extractJson, isJsonTruncated } from "./json";

describe("extractJson", () => {
  it("returns the first complete array even when the model adds a fence", () => {
    const text = 'Here.\n```json\n[{"id":1,"score":80}]\n```\n';
    expect(extractJson(text)).toEqual([{ id: 1, score: 80 }]);
  });

  it("throws a truncated-JSON error when the value never closes", () => {
    expect(() => extractJson('[{"id":1,"why":"this sentence never')).toThrow(/raise the token limit/);
  });
});

describe("isJsonTruncated", () => {
  it("detects the error extractJson throws on a cut-off value", () => {
    try {
      extractJson('{"title":"half');
      throw new Error("should have thrown");
    } catch (err) {
      expect(isJsonTruncated(err)).toBe(true);
    }
  });

  it("ignores other failures", () => {
    expect(isJsonTruncated(new Error("Anthropic returned 400"))).toBe(false);
    expect(isJsonTruncated("nope")).toBe(false);
  });
});
