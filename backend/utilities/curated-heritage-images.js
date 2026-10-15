"use strict";

const CURATED_IMAGES = Object.freeze(require("../../shared/curated-heritage-images.json"));
const CURATED_IMAGE_SLUGS_SQL = Object.keys(CURATED_IMAGES).map((slug) => `'${slug}'`).join(", ");

function isLocalPublicImagePath(value) {
  return typeof value === "string" && /^\/heritage-images\/[a-z0-9-]+\.jpg$/i.test(value);
}

function isPublicImageUrl(value) {
  if (isLocalPublicImagePath(value)) return true;
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isVerifiedPublicImage(image) {
  return Boolean(image &&
    image.media_type === "image" &&
    ["gallery", "current"].includes(image.media_role) &&
    image.verification_status === "verified" &&
    image.is_illustrative !== true &&
    isPublicImageUrl(image.url));
}

function hasVerifiedPublicImage(media) {
  return Array.isArray(media) && media.some(isVerifiedPublicImage);
}

function findVerifiedPublicImage(media) {
  return Array.isArray(media) ? media.find(isVerifiedPublicImage) : undefined;
}

function applyCuratedImageFallback(record) {
  if (!record || typeof record.slug !== "string") return record;
  const curated = CURATED_IMAGES[record.slug];
  const media = Array.isArray(record.media) ? record.media : [];
  if (hasVerifiedPublicImage(media)) {
    const image = findVerifiedPublicImage(media);
    return { ...record, image_url: record.image_url || image?.url || null, media };
  }
  if (!curated) return { ...record, media };

  return {
    ...record,
    image_url: curated.url,
    media: [{
      ...curated,
      media_type: "image",
      caption: null,
      media_role: "current",
      media_context: "current",
      verification_status: "verified",
      is_illustrative: false,
      display_order: 0,
      provider: "wikimedia",
    }],
  };
}

module.exports = {
  CURATED_IMAGES,
  CURATED_IMAGE_SLUGS_SQL,
  applyCuratedImageFallback,
  findVerifiedPublicImage,
  hasVerifiedPublicImage,
  isLocalPublicImagePath,
};
