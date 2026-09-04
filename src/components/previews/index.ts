import generic from "./generic";
import instagram from "./instagram";
import linkedin from "./linkedin";
import x from "./x";
import type { PreviewSkin } from "./types";

/**
 * The fifth extension point. Write a skin, add it here, and any channel whose
 * key matches gets it. Everything else falls back to the generic one.
 */
export const PREVIEW_SKINS: PreviewSkin[] = [linkedin, x, instagram];

export function getPreviewSkin(channelKey: string): PreviewSkin {
  return PREVIEW_SKINS.find((s) => s.key === channelKey) ?? generic;
}

export type { PreviewProps, PreviewSkin } from "./types";
