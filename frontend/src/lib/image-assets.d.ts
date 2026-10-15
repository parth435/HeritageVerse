type HeritageImageLike = {
  url?: string | null;
  src?: string | null;
  thumbnail_url?: string | null;
  thumbnailSrc?: string | null;
};

type HeritageImageDisplayLike = {
  verificationStatus?: string | null;
  isIllustrative?: boolean | null;
  mediaRole?: string | null;
  mediaContext?: string | null;
};

export declare function getHeritageImageSource(image: HeritageImageLike | null | undefined): string | null;
export declare function getHeritageImageFallback(image: HeritageImageLike | null | undefined, failedUrl: string): string | null;
export declare function isHeritageImageFallback(value: string | null | undefined): boolean;
export declare function getVerifiedHeritageImages<T extends HeritageImageDisplayLike>(images: readonly T[] | null | undefined): T[];
export declare function getCurrentHeritageHeroImage<T extends HeritageImageDisplayLike>(images: readonly T[] | null | undefined): T | null;
export declare function getHeritageHeroImage<T extends HeritageImageDisplayLike>(images: readonly T[] | null | undefined): T | null;
