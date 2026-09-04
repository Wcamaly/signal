import { useT } from "../I18nProvider";
import Avatar from "./Avatar";
import { hostOf, type PreviewProps, type PreviewSkin } from "./types";

// The channel hint tells the writer to separate the posts of a thread with a
// line containing exactly ---, which is what this splits on.
const SPLIT = "\n---\n";
// Observed value: the free tier's limit per post.
const PER_POST = 280;

const INK = "#e7e9ea";
const DIM = "#71767b";
const LINE = "#2f3336";

function X({ author, avatar, handle, color, text, image, imageAlt, link, linkCard }: PreviewProps) {
  const t = useT();
  const posts = text
    .split(SPLIT)
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div
      style={{
        background: "#000000",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 12,
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {posts.map((post, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            gap: 10,
            padding: 12,
            borderTop: i ? `1px solid ${LINE}` : undefined,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Avatar src={avatar} name={author} color={color} size={40} />
            {i < posts.length - 1 && (
              <div style={{ width: 2, flex: 1, background: LINE, marginTop: 4 }} />
            )}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", gap: 5, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{author || t.preview.yourName}</span>
              <span style={{ fontSize: 15, color: DIM }}>{handle || "@you"} · now</span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 11,
                  fontFamily: "ui-monospace, monospace",
                  color: post.length > PER_POST ? "#f4212e" : DIM,
                }}
              >
                {post.length}/{PER_POST}
              </span>
            </div>

            <div style={{ fontSize: 15, lineHeight: 1.35, whiteSpace: "pre-wrap", marginTop: 2 }}>
              {post}
            </div>

            {i === 0 && image && (
              // eslint-disable-next-line @next/next/no-img-element -- see Avatar
              <img
                src={image}
                alt={imageAlt ?? ""}
                style={{
                  width: "100%",
                  marginTop: 10,
                  borderRadius: 14,
                  border: `1px solid ${LINE}`,
                  objectFit: "cover",
                  maxHeight: 380,
                  display: "block",
                }}
              />
            )}

            {i === 0 && !image && linkCard && (
              <div
                style={{
                  marginTop: 10,
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                {linkCard.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- see Avatar
                  <img
                    src={linkCard.image}
                    alt=""
                    style={{
                      width: "100%",
                      aspectRatio: "1.91 / 1",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                )}
                <div style={{ padding: "8px 12px" }}>
                  {link && <div style={{ fontSize: 13, color: DIM }}>{hostOf(link)}</div>}
                  <div style={{ fontSize: 14 }}>{linkCard.title}</div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 26, marginTop: 10, fontSize: 13, color: DIM }}>
              <span>💬</span>
              <span>↻</span>
              <span>♡</span>
              <span>⇪</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const x: PreviewSkin = { key: "x", label: "X", Component: X };
export default x;
