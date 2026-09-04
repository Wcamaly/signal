import { useT } from "../I18nProvider";
import Avatar from "./Avatar";
import { cut, type PreviewProps, type PreviewSkin } from "./types";

// Observed value: where the caption collapses behind "… more".
const CAPTION_FOLD = 125;

const INK = "#f5f5f5";
const DIM = "#a8a8a8";
const LINE = "#262626";

function Instagram({ author, avatar, handle, color, text, image, imageAlt }: PreviewProps) {
  const t = useT();
  const { shown, hidden } = cut(text, CAPTION_FOLD);
  const name = handle?.replace(/^@/, "") || author || "you";

  return (
    <div
      style={{
        background: "#000000",
        color: INK,
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        overflow: "hidden",
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 10 }}>
        <Avatar src={avatar} name={author} color={color} size={32} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{name}</span>
        <span style={{ marginLeft: "auto", color: DIM }}>···</span>
      </div>

      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- see Avatar
        <img
          src={image}
          alt={imageAlt ?? ""}
          style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
        />
      ) : (
        // Instagram is image-first: a post with no image has no post.
        <div
          style={{
            aspectRatio: "1 / 1",
            background: "#121212",
            borderTop: `1px solid ${LINE}`,
            borderBottom: `1px solid ${LINE}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: DIM,
            fontSize: 12.5,
            textAlign: "center",
            padding: 24,
          }}
        >
          {t.preview.instagramNoImage}
        </div>
      )}

      <div style={{ display: "flex", gap: 14, padding: "8px 10px", fontSize: 16 }}>
        <span>♡</span>
        <span>💬</span>
        <span>➦</span>
        <span style={{ marginLeft: "auto" }}>🔖</span>
      </div>

      <div style={{ padding: "0 10px 12px", fontSize: 13, lineHeight: 1.45 }}>
        <span style={{ fontWeight: 600 }}>{name} </span>
        <span style={{ whiteSpace: "pre-wrap" }}>{shown}</span>
        {hidden && <span style={{ color: DIM }}>… more</span>}
      </div>
    </div>
  );
}

const instagram: PreviewSkin = { key: "instagram", label: "Instagram", Component: Instagram };
export default instagram;
