import { motion, useScroll, useTransform } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getHeritage } from "@/lib/api";
import type { Heritage, HeritageMedia } from "@/types/heritage";
import { getHeritageImageFallback, getHeritageImageSource, isHeritageImageFallback } from "@/lib/image-assets.js";
import { Button } from "@/components/ui/button";

export function CinematicMonument() {
  const [hero, setHero] = useState<{ heritage: Heritage; media: HeritageMedia } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const imageY = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const titleY = useTransform(scrollYProgress, [0, 1], ["0%", "40%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  const photoSource = hero
    ? failedUrl
      ? getHeritageImageFallback({ url: hero.media.url }, failedUrl)
      : getHeritageImageSource({ url: hero.media.url, thumbnail_url: hero.media.thumbnail_url })
    : null;
  const photoUnavailable = Boolean(hero && (!photoSource || isHeritageImageFallback(photoSource)));

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void getHeritage({ withVerifiedPhoto: true, limit: 1 }, { signal: controller.signal, authenticated: false })
      .then((response) => {
        if (!active) return;
        const heritage = response.items[0];
        const media = heritage?.media?.find((candidate) =>
          candidate.media_type === "image"
          && (candidate.media_role === "gallery" || candidate.media_role === "current")
          && candidate.verification_status === "verified"
          && candidate.is_illustrative === false,
        );
        setHero(heritage && media ? { heritage, media } : null);
      })
      .catch(() => {
        if (active) setHero(null);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => setFailedUrl(null), [hero?.media.url, hero?.media.thumbnail_url]);

  return (
    <section
      id="top"
      ref={ref}
      className="relative h-[100svh] overflow-hidden bg-ink"
    >
      <motion.div style={{ y: imageY }} className="absolute inset-0">
        {hero && photoSource && !photoUnavailable ? (
          <img src={photoSource} alt={hero.media.alt_text || hero.media.caption || hero.heritage.name} loading="eager" referrerPolicy="no-referrer" onError={() => setFailedUrl(photoSource)} className="h-[120%] w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-linear-to-b from-ink/40 via-ink/20 to-ink" />
        <div className="absolute inset-0 bg-linear-to-r from-ink/70 via-transparent to-ink/50" />
      </motion.div>

      {hero ? (
        <div className="absolute right-5 top-24 z-10 max-w-xs rounded-xl border border-white/15 bg-ink/75 p-3 text-right text-[10px] leading-4 text-parchment/75 backdrop-blur md:right-10 md:top-28">
          <p className="font-medium text-parchment">Photograph: {hero.heritage.name}</p>
          <p>{hero.media.credit || hero.media.creator}</p>
          <p className="mt-1 flex flex-wrap justify-end gap-x-2">
            {safeExternalUrl(hero.media.source_url) ? <a href={safeExternalUrl(hero.media.source_url)!} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">Source</a> : null}
            {hero.media.license ? (safeExternalUrl(hero.media.license_url) ? <a href={safeExternalUrl(hero.media.license_url)!} target="_blank" rel="noopener noreferrer" className="text-gold-bright underline underline-offset-2">{hero.media.license}</a> : <span>{hero.media.license}</span>) : null}
          </p>
          {photoUnavailable ? <p role="status" className="mt-1 text-amber-100/80">The verified photograph could not be loaded.</p> : null}
        </div>
      ) : null}

      <motion.div
        style={{ y: titleY, opacity }}
        className="relative z-10 flex h-full flex-col justify-end px-6 pb-20 pt-28 md:px-16 lg:px-24"
      >
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
          className="mb-4 text-xs uppercase tracking-[0.45em] text-gold"
        >
          A cinema of stone · India
        </motion.p>
        <motion.h1
          initial={{ clipPath: "inset(100% 0 0 0)", y: 40 }}
          animate={{ clipPath: "inset(0% 0 0 0)", y: 0 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="font-display max-w-5xl text-5xl leading-[0.98] text-parchment sm:text-7xl lg:text-8xl"
        >
          Monuments
          <span className="italic text-gold-bright"> still breathing.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 1 }}
          className="mt-8 max-w-xl text-base text-parchment/75 md:text-lg"
        >
          Scroll through HeritageVerse — atlas, museum, time machine, and the
          anatomy of a mausoleum.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="mt-8 flex flex-wrap gap-3"
        >
          <Button asChild>
            <a href="#atlas">Enter the atlas</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="#os">Open the Verse</a>
          </Button>
        </motion.div>
      </motion.div>

      <motion.a
        href="#atlas"
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-gold"
      >
        <ChevronDown className="h-7 w-7" />
      </motion.a>
    </section>
  );
}

function safeExternalUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}
