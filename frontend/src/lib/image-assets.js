const LOCAL_HERITAGE_IMAGE_FALLBACK = "/heritage-image-fallback.svg";
const LOCAL_VERIFIED_PHOTOS_BY_COMMONS_PATH = new Map([
  ["/wikipedia/commons/e/e5/Ajanta_cave_no._9_2010.jpg", "/heritage-images/ajanta-caves.jpg"],
  ["/wikipedia/commons/4/41/Elephanta_Caves%2C_India.jpg", "/heritage-images/elephanta-caves.jpg"],
  ["/wikipedia/commons/3/3a/Ellora_Caves%2C_India%2C_Kailasanatha_Temple_2.jpg", "/heritage-images/ellora-caves.jpg"],
  ["/wikipedia/commons/7/77/Remotest_Rampart_on_Panhala.jpg", "/heritage-images/panhala-fort.jpg"],
]);

const secureUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

const localPublicImagePath = (value) =>
  typeof value === "string" && /^\/heritage-images\/[a-z0-9-]+\.jpg$/i.test(value) ? value : null;

export function getHeritageImageSource(image) {
  const local = localPublicImagePath(image?.displaySrc ?? image?.url ?? image?.src ?? image?.thumbnail_url ?? image?.thumbnailSrc);
  if (local) return local;
  const display = secureUrl(image?.displaySrc);
  if (display) return display;
  const original = secureUrl(image?.url ?? image?.src);
  const thumbnail = secureUrl(image?.thumbnail_url ?? image?.thumbnailSrc);
  return localVerifiedPhoto(original) ?? localVerifiedPhoto(thumbnail) ?? thumbnail ?? original ?? null;
}

export function getHeritageImageFallback(image, failedUrl) {
  if (failedUrl === LOCAL_HERITAGE_IMAGE_FALLBACK) return null;
  const local = localPublicImagePath(image?.url ?? image?.src);
  if (local) return local === failedUrl ? LOCAL_HERITAGE_IMAGE_FALLBACK : local;
  const original = secureUrl(image?.url ?? image?.src);
  const localPhoto = localVerifiedPhoto(original);
  if (localPhoto) return isSameLocalAsset(failedUrl, localPhoto) ? LOCAL_HERITAGE_IMAGE_FALLBACK : localPhoto;
  return original && original !== failedUrl ? original : LOCAL_HERITAGE_IMAGE_FALLBACK;
}

function localVerifiedPhoto(value) {
  const safe = secureUrl(value);
  if (!safe) return null;
  try {
    const url = new URL(safe);
    return url.hostname.toLowerCase() === "upload.wikimedia.org"
      ? LOCAL_VERIFIED_PHOTOS_BY_COMMONS_PATH.get(url.pathname) ?? null
      : null;
  } catch {
    return null;
  }
}

function isSameLocalAsset(value, localPath) {
  if (typeof value !== "string" || !value) return false;
  if (value === localPath) return true;
  try {
    const base = typeof window === "undefined" ? "https://heritageverse.local" : window.location.href;
    const url = new URL(value, base);
    return url.origin === new URL(base).origin && url.pathname === localPath;
  } catch {
    return false;
  }
}

export function isHeritageImageFallback(value) {
  if (value === LOCAL_HERITAGE_IMAGE_FALLBACK) return true;
  if (typeof window === "undefined" || typeof value !== "string") return false;
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin && url.pathname === LOCAL_HERITAGE_IMAGE_FALLBACK;
  } catch {
    return false;
  }
}

export function getVerifiedHeritageImages(images) {
  return Array.isArray(images)
    ? images.filter((image) => image?.verificationStatus === "verified" && image?.isIllustrative !== true)
    : [];
}

export function getHeritageHeroImage(images) {
  const verified = getVerifiedHeritageImages(images);
  return verified.find((image) => image.mediaRole === "current") ?? verified[0] ?? null;
}

export function getCurrentHeritageHeroImage(images) {
  return getVerifiedHeritageImages(images).find((image) => image.mediaRole === "current") ?? null;
}
