import { describe, expect, it } from "vitest";
import { digestMessage, sendsDigest } from "./telegram";

const MARKDOWN = `The read of the day: agents got memory.

## The signals

### LangGraph ships **durable** memory
What happened. Why it matters. [LangChain](https://blog.example/langgraph)

### A paper on <retrieval> & reranking
Two links, the source last: [context](https://ctx.example) and [paper](https://arxiv.example/1?a=1&b="2")

### No link here
Just text.

## What I would say
- [Not a signal](https://nope.example)
`;

const digest = { id: 7, title: "Agents <remember>", subtitle: "Memory is the product", markdown: MARKDOWN };

describe("digestMessage", () => {
  it("is the title, the thesis, one line per signal with its source, and the full digest link", () => {
    expect(digestMessage(digest, "https://signal.test/", "Read more")).toBe(
      [
        "<b>Agents &lt;remember&gt;</b>",
        "<i>Memory is the product</i>",
        "",
        '• <a href="https://blog.example/langgraph">LangGraph ships durable memory</a>',
        '• <a href="https://arxiv.example/1?a=1&amp;b=&quot;2&quot;">A paper on &lt;retrieval&gt; &amp; reranking</a>',
        "• No link here",
        "",
        '<a href="https://signal.test/digest/7">Read more</a>',
      ].join("\n"),
    );
  });

  it("leaves the link out when Signal's URL is not configured", () => {
    expect(digestMessage(digest, null, "Read more")).not.toContain("Read more");
  });

  it("stays under Telegram's limit however many signals there are", () => {
    const many = Array.from({ length: 200 }, (_, i) => `### Signal number ${i} with a long title to fill the line\n[s](https://s.example/${i})`).join("\n");
    const text = digestMessage({ ...digest, markdown: `## The signals\n${many}` }, "https://signal.test", "Read more");
    expect(text.length).toBeLessThanOrEqual(4096);
    expect(text.endsWith('<a href="https://signal.test/digest/7">Read more</a>')).toBe(true);
  });
});

describe("sendsDigest", () => {
  it("sends the digest unless the channel is set to posts", () => {
    expect(sendsDigest({})).toBe(true);
    expect(sendsDigest({ mode: "digest" })).toBe(true);
    expect(sendsDigest({ mode: " Posts " })).toBe(false);
  });
});
