import { useEffect, useState } from "react";
import { ArrowUpRight, Landmark, MapPin } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { RouterLink } from "@/lib/router";
import type { HeritageView } from "@/lib/heritageAdapter";
import { getHeritageImageFallback, getHeritageImageSource } from "@/lib/image-assets.js";

export function HeritageCard({ item, index = 0 }: { item: HeritageView; index?: number }) {
  const reduceMotion = useReducedMotion();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const image = item.gallery[0];
  const imageSrc = image
    ? failedImageUrl
      ? getHeritageImageFallback({ url: image.src }, failedImageUrl)
      : getHeritageImageSource({ url: image.src, thumbnail_url: image.thumbnailSrc })
    : null;
  const imageFailed = Boolean(failedImageUrl && !imageSrc);

  useEffect(() => setFailedImageUrl(null), [image?.src, image?.thumbnailSrc]);

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : Math.min(index * 0.035, 0.2) }}
      className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] transition-colors hover:border-gold/40 focus-within:border-gold/60"
    >
      <RouterLink
        to={`/heritage/${encodeURIComponent(item.routeId)}`}
        aria-label={`View ${item.name}`}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-[#17120e]">
          {image && imageSrc && !imageFailed ? (
            <img
              src={imageSrc}
              alt={image.alt}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedImageUrl(imageSrc)}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-gold/70" aria-label="Image unavailable">
              <Landmark className="h-10 w-10" aria-hidden="true" />
              <span className="text-[10px] uppercase tracking-[0.22em]">Image coming soon</span>
            </div>
          )}
          <div className="absolute inset-0 bg-linear-to-t from-ink/80 via-transparent to-transparent" />
          {item.category ? (
            <span className="absolute left-4 top-4 rounded-full border border-white/20 bg-ink/75 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-parchment backdrop-blur">
              {item.category.name}
            </span>
          ) : null}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-2xl leading-tight text-parchment group-hover:text-gold-bright">
              {item.name}
            </h2>
            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-gold/70 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-parchment/55">
            <MapPin className="h-3.5 w-3.5 text-gold/70" aria-hidden="true" />
            {item.location}
          </p>
          {item.description ? (
            <p className="mt-4 line-clamp-3 text-sm leading-6 text-parchment/70">{item.description}</p>
          ) : (
            <p className="mt-4 text-sm text-parchment/45">Description coming soon.</p>
          )}
          {item.historicalPeriod ? (
            <p className="mt-4 border-t border-white/10 pt-3 text-[10px] uppercase tracking-[0.2em] text-gold/80">
              {item.historicalPeriod}
            </p>
          ) : null}
        </div>
      </RouterLink>
      {image?.credit || image?.sourceUrl || image?.license ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/10 px-5 py-3 text-[10px] leading-4 text-parchment/50">
          {image.credit ? <span>{image.credit}</span> : null}
          {safeExternalUrl(image.sourceUrl) ? <a href={safeExternalUrl(image.sourceUrl)!} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">Source</a> : null}
          {image.license ? (safeExternalUrl(image.licenseUrl) ? <a href={safeExternalUrl(image.licenseUrl)!} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">{image.license}</a> : <span>{image.license}</span>) : null}
        </p>
      ) : null}
    </motion.article>
  );
}

function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
