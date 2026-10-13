import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getReconstructionStatus, requestHistoricalIllustration, type HistoricalIllustration, type ReconstructionStatus } from "@/lib/api";
import type { HeritageView } from "@/lib/heritageAdapter";

export function ReconstructionPanel({ site }: { site: HeritageView }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<ReconstructionStatus | null>(null);
  const [illustration, setIllustration] = useState<HistoricalIllustration | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const hasReference = site.media.some((item) => item.media_role === "historical" && item.verification_status === "verified" && !item.is_illustrative && item.source_url && item.creator && item.documented_date && item.license && item.license_url);

  useEffect(() => {
    let active = true;
    void getReconstructionStatus()
      .then((value) => { if (active) setStatus(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Reconstruction service status is unavailable."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setIllustration(null);
    setError(null);
    setImageFailed(false);
  }, [site.routeId]);

  const generate = async () => {
    if (!site.databaseId || !user || loading) return;
    setLoading(true);
    setError(null);
    setIllustration(null);
    setImageFailed(false);
    try {
      setIllustration(await requestHistoricalIllustration(site.databaseId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The illustrative image could not be generated.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-gold/20 bg-[#17120e] p-5" aria-labelledby="reconstruction-heading">
      <p className="text-[10px] uppercase tracking-[0.22em] text-gold">Illustrative only</p>
      <h4 id="reconstruction-heading" className="font-display mt-2 text-2xl text-parchment">AI historical visualization</h4>
      <p className="mt-2 text-sm leading-6 text-parchment/65">Any generated image is an interpretation informed by cited records. It is not an authentic historical photograph or evidence of undocumented details.</p>
      {status === null && !error ? <p className="mt-3 text-xs text-parchment/55" role="status">Checking provider configuration…</p> : null}
      {status && !status.configured ? <p className="mt-3 rounded-lg border border-white/10 p-3 text-xs leading-5 text-parchment/60" role="status">{status.reason === "provider_configuration_invalid" ? "The server reconstruction provider configuration is invalid." : "No reconstruction provider is configured. For OpenAI, set HERITAGE_RECONSTRUCTION_PROVIDER=openai and OPENAI_API_KEY on the server. A compatible custom provider can use HERITAGE_RECONSTRUCTION_URL and HERITAGE_RECONSTRUCTION_API_KEY."}</p> : null}
      {status?.configured ? <p className="mt-3 text-xs text-parchment/55" role="status">Provider ready: {status.provider}. Check provider billing before generating.</p> : null}
      {status?.configured && !hasReference ? <p className="mt-3 rounded-lg border border-white/10 p-3 text-xs leading-5 text-parchment/60" role="status">A verified and attributed historical image is not available for this site, so a reconstruction request is unavailable.</p> : null}
      {status?.configured && hasReference && !user ? <p className="mt-3 text-xs text-parchment/60">Sign in to request an illustrative image. <a href="/login" className="text-gold-bright underline underline-offset-2">Sign in</a></p> : null}
      {status?.configured && hasReference && user ? <button type="button" onClick={generate} disabled={loading} className="mt-4 rounded-full border border-gold/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold-bright hover:bg-gold/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">{loading ? "Requesting illustration…" : "Generate illustrative view"}</button> : null}
      {error ? <p className="mt-3 text-sm text-red-200" role="alert">{error}</p> : null}
      {illustration ? (
        <figure className="mt-5 overflow-hidden rounded-xl border border-white/10">
          {imageFailed ? <div className="space-y-3 p-6 text-sm text-parchment/70" role="alert"><p>The generated illustration could not be displayed.</p><button type="button" onClick={generate} className="rounded-full border border-gold/40 px-4 py-2 text-xs text-gold-bright hover:bg-gold/10">Generate again</button></div> : <img src={illustration.image_url} alt={`AI-generated illustrative visualization of ${site.name}; not an authentic historical photograph`} onError={() => setImageFailed(true)} referrerPolicy="no-referrer" className="max-h-[32rem] w-full object-contain" />}
          <figcaption className="space-y-1 bg-black/30 p-3 text-xs text-parchment/75">
            <p className="font-semibold text-gold-bright">{illustration.disclaimer}</p>
            <p>Provider: {illustration.provider}</p>
            {illustration.license && illustration.license_url ? <p>License: <a href={illustration.license_url} target="_blank" rel="noopener noreferrer" className="underline">{illustration.license}</a></p> : <p>Rights: {illustration.rights_notice || "No separate license information was provided."}{illustration.provider_documentation ? <> <a href={illustration.provider_documentation} target="_blank" rel="noopener noreferrer" className="underline">Provider documentation</a></> : null}</p>}
            <p>Generated images are temporary and are not saved to the heritage catalogue.</p>
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}
