const secureUrl = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

export function getHeritageImageSource(image) {
  return secureUrl(image?.thumbnail_url ?? image?.thumbnailSrc) ?? secureUrl(image?.url ?? image?.src) ?? null;
}

export function getHeritageImageFallback(image, failedUrl) {
  const original = secureUrl(image?.url ?? image?.src);
  return original && original !== failedUrl ? original : null;
}

export function getVerifiedHeritageImages(images) {
  return Array.isArray(images)
    ? images.filter((image) => image?.verificationStatus === "verified" && image?.isIllustrative !== true)
    : [];
}

export function getCurrentHeritageHeroImage(images) {
  return getVerifiedHeritageImages(images).find((image) => image.mediaRole === "current") ?? null;
}
