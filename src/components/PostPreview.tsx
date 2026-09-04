"use client";

import { getPreviewSkin } from "./previews";
import type { Channel } from "@/lib/types";

/** Picks the skin for the channel and hands it the props every skin shares. */
export default function PostPreview({
  channel,
  author,
  avatar,
  handle,
  text,
  hashtags,
  image,
  imageAlt,
  link,
  linkCard,
}: {
  channel: Channel;
  author: string;
  avatar: string | null;
  handle: string | null;
  text: string;
  hashtags: string[];
  image: string | null;
  imageAlt: string | null;
  link: string | null;
  linkCard: { title: string; image: string | null } | null;
}) {
  const skin = getPreviewSkin(channel.key);

  return (
    <div>
      <p className="kicker mb-2.5">
        {skin.key === "generic" ? `Generic preview — no skin for "${channel.key}"` : skin.label}
      </p>
      <div className="max-w-[520px]">
        <skin.Component
          author={author}
          avatar={avatar}
          handle={handle}
          color={channel.color}
          text={text}
          hashtags={hashtags}
          image={image}
          imageAlt={imageAlt}
          link={link}
          linkCard={linkCard}
          charLimit={channel.char_limit}
        />
      </div>
      <p className="text-[11px] text-faint mt-2 leading-snug">
        Rendered from the channel template — the same text the Copy button gives you. Where the
        text folds and how it is spaced are approximations: the platforms change both without
        notice.
      </p>
    </div>
  );
}
