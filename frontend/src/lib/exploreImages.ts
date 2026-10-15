import type { HeritageGalleryImage, HeritageView } from "@/lib/heritageAdapter";
import { getHeritageImageSource, getVerifiedHeritageImages } from "@/lib/image-assets.js";

const IMAGE_CHECK_CONCURRENCY = 5;
const IMAGE_CHECK_TIMEOUT_MS = 8000;

type ImageAvailabilityChecker = (url: string, signal?: AbortSignal) => Promise<boolean>;

export function browserImageAvailable(url: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted || typeof Image === "undefined") {
      resolve(false);
      return;
    }

    const image = new Image();
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      resolve(available);
    };
    const abort = () => {
      image.src = "";
      finish(false);
    };

    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    signal?.addEventListener("abort", abort, { once: true });
    timeoutId = setTimeout(() => finish(false), IMAGE_CHECK_TIMEOUT_MS);
    image.referrerPolicy = "no-referrer";
    image.src = url;
  });
}

async function loadVerifiedImages(
  item: HeritageView,
  loadImage: ImageAvailabilityChecker,
  signal?: AbortSignal,
): Promise<HeritageView | null> {
  const verifiedImages = getVerifiedHeritageImages(item.gallery) as HeritageGalleryImage[];
  const availableImages: HeritageGalleryImage[] = [];

  for (const image of verifiedImages) {
    if (signal?.aborted) return null;
    const source = getHeritageImageSource({ url: image.src, thumbnail_url: image.thumbnailSrc }) as string | null;
    const candidates = [...new Set([source, image.src].filter((value): value is string => typeof value === "string" && value.length > 0))];
    for (const url of candidates) {
      try {
        if (await loadImage(url, signal)) {
          const localSource = url.startsWith("/");
          availableImages.push(localSource ? image : { ...image, displaySrc: url });
          break;
        }
      } catch {
        // A broken or unavailable photograph excludes only that image.
      }
    }
  }

  return availableImages.length > 0 ? { ...item, gallery: availableImages } : null;
}

export async function filterUsableHeritageImages(
  items: HeritageView[],
  loadImage: ImageAvailabilityChecker = browserImageAvailable,
  signal?: AbortSignal,
): Promise<HeritageView[]> {
  const results = new Array<HeritageView | null>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(IMAGE_CHECK_CONCURRENCY, items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!signal?.aborted) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await loadVerifiedImages(items[index], loadImage, signal);
    }
  }));

  return results.filter((item): item is HeritageView => item !== null);
}
