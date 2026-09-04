"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  actionSetPostLink,
  actionUnfurlPostLink,
  actionUpdatePost,
  actionUploadImage,
} from "@/lib/actions";
import type { Post } from "@/lib/types";

/**
 * The image and the link of a post. The image is either the one the source
 * carried, one you upload, or a URL you paste; the link card is resolved once
 * and cached, never fetched while rendering.
 */
export default function PostMedia({
  post,
  sourceImage,
}: {
  post: Post;
  /** The image of the signal this post came from, offered as a one-click restore. */
  sourceImage: string | null;
}) {
  const [image, setImage] = useState(post.image_url ?? "");
  const [alt, setAlt] = useState(post.image_alt ?? "");
  const [link, setLink] = useState(post.link ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isStored = image.startsWith("/media/");

  function saveImage(url: string, altText: string) {
    setError(null);
    start(async () => {
      await actionUpdatePost(post.id, { image_url: url || null, image_alt: altText || null });
      router.refresh();
    });
  }

  function upload(file: File) {
    setError(null);
    start(async () => {
      const form = new FormData();
      form.set("file", file);
      const res = await actionUploadImage(form);
      if (!res.ok || !res.url) {
        setError(res.error ?? "Could not store the image");
        return;
      }
      setImage(res.url);
      await actionUpdatePost(post.id, { image_url: res.url, image_alt: alt || null });
      router.refresh();
    });
  }

  function saveLink() {
    setError(null);
    start(async () => {
      const saved = await actionSetPostLink(post.id, link);
      if (!saved.ok) {
        setError(saved.error ?? "Error");
        return;
      }
      if (link.trim()) {
        const card = await actionUnfurlPostLink(post.id);
        // A link that cannot be read is still a valid link: the card is what
        // is missing, not the link.
        if (!card.ok) setError(card.error ?? null);
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-4 border-t border-line pt-3.5 flex flex-col gap-3">
      <div>
        <span className="kicker">Image</span>
        <div className="flex gap-2 mt-1.5">
          <input
            className="input font-mono !text-[12px]"
            placeholder="https://… or upload one"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            onBlur={() => {
              if (image !== (post.image_url ?? "")) saveImage(image, alt);
            }}
          />
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <button
            className="btn btn-sm shrink-0"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
          >
            Upload
          </button>
        </div>

        <div className="flex gap-1.5 mt-2 flex-wrap">
          {sourceImage && image !== sourceImage && (
            <button
              className="chip hover:!text-ink hover:!border-line-strong"
              onClick={() => {
                setImage(sourceImage);
                saveImage(sourceImage, alt);
              }}
              disabled={pending}
            >
              Use the source image
            </button>
          )}
          {image &&
            (isStored ? (
              <a className="chip hover:!text-ink hover:!border-line-strong" href={image} download>
                Download image
              </a>
            ) : (
              // A cross-origin file cannot be forced to download from here, so
              // this opens it and the browser does the saving.
              <a
                className="chip hover:!text-ink hover:!border-line-strong"
                href={image}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open image ↗
              </a>
            ))}
          {image && (
            <button
              className="chip hover:!text-ink hover:!border-line-strong"
              onClick={() => {
                setImage("");
                setAlt("");
                saveImage("", "");
              }}
              disabled={pending}
            >
              Remove
            </button>
          )}
        </div>

        {image && (
          <input
            className="input !text-[12px] mt-2"
            placeholder="Alt text — one line describing the image"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={() => {
              if (alt !== (post.image_alt ?? "")) saveImage(image, alt);
            }}
          />
        )}
      </div>

      <div>
        <span className="kicker">Link</span>
        <div className="flex gap-2 mt-1.5">
          <input
            className="input font-mono !text-[12px]"
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
          />
          <button
            className="btn btn-sm shrink-0"
            onClick={saveLink}
            disabled={pending || link === (post.link ?? "")}
          >
            {pending ? "…" : "Save & fetch card"}
          </button>
        </div>
        {post.link_title && (
          <p className="text-[11.5px] text-faint mt-1.5 truncate">
            Card: {post.link_title}
            {post.link_image ? " · with image" : ""}
          </p>
        )}
      </div>

      {error && (
        <p className="text-[12px]" style={{ color: "var(--bad)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
