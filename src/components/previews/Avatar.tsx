import { initials } from "./types";

/** The author's picture, or their initials on the channel colour. */
export default function Avatar({
  src,
  name,
  color,
  size = 40,
  radius = "9999px",
}: {
  src: string | null;
  name: string;
  color: string;
  size?: number;
  radius?: string;
}) {
  const box = { width: size, height: size, borderRadius: radius, flexShrink: 0 } as const;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a preview renders whatever URL the post carries; next/image would need every host allow-listed
      <img src={src} alt="" style={{ ...box, objectFit: "cover", display: "block" }} />
    );
  }

  return (
    <div
      style={{
        ...box,
        background: color,
        color: "#0a0b0d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        letterSpacing: "0.02em",
      }}
    >
      {initials(name)}
    </div>
  );
}
