import Avatar from "./Avatar";
import { hostOf, type PreviewProps, type PreviewSkin } from "./types";

/**
 * The fallback. Any channel can be invented from the UI, so this has to work
 * for a network nobody has written a skin for: the author, the text, the image
 * and the link, with the character limit as the only platform-specific fact.
 */
function Generic({
  author,
  avatar,
  handle,
  color,
  text,
  image,
  imageAlt,
  link,
  linkCard,
  charLimit,
}: PreviewProps) {
  const over = text.length > charLimit;

  return (
    <div
      style={{
        background: "#15171b",
        color: "#e9eaec",
        border: "1px solid #2b3037",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", gap: 10, padding: 14 }}>
        <Avatar src={avatar} name={author} color={color} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{author || "Your name"}</div>
          {handle && <div style={{ fontSize: 12.5, color: "#8b929c" }}>{handle}</div>}
        </div>
        <span
          style={{
            fontSize: 11,
            fontFamily: "ui-monospace, monospace",
            color: over ? "#c9564f" : "#5f666f",
          }}
        >
          {text.length}/{charLimit}
        </span>
      </div>

      <div
        style={{
          padding: "0 14px 14px",
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>

      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- see Avatar
        <img
          src={image}
          alt={imageAlt ?? ""}
          style={{ width: "100%", display: "block", objectFit: "cover", maxHeight: 420 }}
        />
      )}

      {!image && linkCard && (
        <div style={{ borderTop: "1px solid #2b3037", padding: "10px 14px" }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{linkCard.title}</div>
          {link && <div style={{ fontSize: 12, color: "#8b929c" }}>{hostOf(link)}</div>}
        </div>
      )}
    </div>
  );
}

const generic: PreviewSkin = { key: "generic", label: "Generic", Component: Generic };
export default generic;
