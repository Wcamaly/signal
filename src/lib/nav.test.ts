import { describe, expect, it } from "vitest";
import { activeHref, underPath } from "./nav";

describe("underPath", () => {
  it("matches the page itself and the pages below it, by whole segments", () => {
    expect(underPath("/manage/sources", "/manage/sources")).toBe(true);
    expect(underPath("/manage/sources/12", "/manage/sources")).toBe(true);
    expect(underPath("/manage/digests", "/digest")).toBe(false);
    expect(underPath("/digest/3", "/digest")).toBe(true);
  });

  it("matches the root only on itself", () => {
    expect(underPath("/", "/")).toBe(true);
    expect(underPath("/radar", "/")).toBe(false);
  });
});

describe("activeHref", () => {
  const tabs = ["/manage/model", "/manage/model/credentials"];

  it("picks the most specific href", () => {
    expect(activeHref("/manage/model", tabs)).toBe("/manage/model");
    expect(activeHref("/manage/model/credentials", tabs)).toBe("/manage/model/credentials");
    expect(activeHref("/manage/prompts/curator", ["/manage/voice", "/manage/prompts"])).toBe("/manage/prompts");
  });

  it("answers null when the path is under none of them", () => {
    expect(activeHref("/radar", tabs)).toBeNull();
  });
});
