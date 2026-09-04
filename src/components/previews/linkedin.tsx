import Avatar from "./Avatar";
import { cut, hostOf, type PreviewProps, type PreviewSkin } from "./types";

// Observed values. LinkedIn changes them without notice, so treat the fold as
// an approximation of where "…see more" appears, not a guarantee.
const FOLD = 210;
const IMAGE_RATIO = "1.91 / 1";

const INK = "#000000e6";
const DIM = "#00000099";
const LINE = "#e0dfdc";

function LinkedIn({
  author,
  avatar,
  handle,
  color,
  text,
  image,
  imageAlt,
  link,
  linkCard,
}: PreviewProps) {
  const { shown, hidden } = cut(text, FOLD);

  return (
    <div
      style={{
        background: "#ffffff",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: "flex", gap: 8, padding: 12 }}>
        <Avatar src={avatar} name={author} color={color} size={48} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
            {author || "Your name"}
          </div>
          <div style={{ fontSize: 12, color: DIM, lineHeight: 1.4 }}>
            {handle || "Your headline"}
          </div>
          <div style={{ fontSize: 12, color: DIM }}>now · 🌐</div>
        </div>
      </div>

      <div
        style={{
          padding: "0 12px 12px",
          fontSize: 14,
          lineHeight: 1.43,
          whiteSpace: "pre-wrap",
        }}
      >
        {shown}
        {hidden && <span style={{ color: DIM }}>… see more</span>}
      </div>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- see Avatar
        <img
          src={image}
          alt={imageAlt ?? ""}
          style={{ width: "100%", aspectRatio: IMAGE_RATIO, objectFit: "cover", display: "block" }}
        />
      ) : linkCard ? (
        <div style={{ background: "#f4f2ee", borderTop: `1px solid ${LINE}` }}>
          {linkCard.image && (
            // eslint-disable-next-line @next/next/no-img-element -- see Avatar
            <img
              src={linkCard.image}
              alt=""
              style={{
                width: "100%",
                aspectRatio: IMAGE_RATIO,
                objectFit: "cover",
                display: "block",
              }}
            />
          )}
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{linkCard.title}</div>
            {link && <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{hostOf(link)}</div>}
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 18,
          padding: "8px 12px",
          borderTop: `1px solid ${LINE}`,
          fontSize: 13,
          fontWeight: 600,
          color: DIM,
        }}
      >
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>↻ Repost</span>
        <span>➦ Send</span>
      </div>
    </div>
  );
}

const linkedin: PreviewSkin = { key: "linkedin", label: "LinkedIn", Component: LinkedIn };
export default linkedin;
