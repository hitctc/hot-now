const CREATIVE_IMAGE_PATH = /^\/api\/creative\/images\/\d{4}-\d{2}-\d{2}\/[^/]+$/;

/** 只为 HotNow 本地存储图片生成缩略图地址，外部图片在列表中保持占位。 */
export function buildCreativeImageThumbnailUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl) return null;

  try {
    const baseOrigin = typeof window === "undefined" ? "https://hot-now.local" : window.location.origin;
    const isAbsolute = /^(?:https?:)?\/\//i.test(originalUrl);
    const url = new URL(originalUrl, baseOrigin);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (isAbsolute && url.origin !== baseOrigin) return null;
    if (!CREATIVE_IMAGE_PATH.test(url.pathname)) return null;
    url.searchParams.set("variant", "thumbnail");
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}
