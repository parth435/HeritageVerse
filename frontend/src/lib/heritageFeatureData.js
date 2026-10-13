const initialFeatureDetailState = Object.freeze({
  loading: false,
  site: null,
  error: null,
});

function heritageFeatureDetailReducer(state, action) {
  switch (action.type) {
    case "loading":
      return { loading: true, site: null, error: null };
    case "success":
      return { loading: false, site: action.site, error: null };
    case "error":
      return { loading: false, site: null, error: action.message };
    case "reset":
      return initialFeatureDetailState;
    default:
      return state;
  }
}

function validDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

function presentTimelineMoment(event, sources = []) {
  const source = sources.find((item) => item.id === event?.source_id);
  const eventClaimSupported = source?.claims_supported?.includes("timeline_event") === true;
  const date = validDateOnly(event?.event_date);
  if (date) {
    return {
      label: eventClaimSupported ? "Event date" : "Unverified date",
      value: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(date),
      precision: "day",
      sourceLinked: eventClaimSupported,
    };
  }

  const period = typeof event?.event_period === "string" ? event.event_period.trim() : "";
  if (period) {
    const isInscription = source?.claims_supported?.includes("protected_status") === true;
    return {
      label: isInscription
        ? "UNESCO inscription year"
        : eventClaimSupported ? "Recorded period" : "Unverified period",
      value: period,
      precision: "period",
      sourceLinked: eventClaimSupported,
    };
  }

  return {
    label: "Date not recorded",
    value: "No exact date or period is recorded for this event.",
    precision: "unknown",
    sourceLinked: false,
  };
}

function sortTimelineEvents(events = []) {
  return [...events].sort((left, right) => {
    const leftDate = validDateOnly(left?.event_date);
    const rightDate = validDateOnly(right?.event_date);
    if (leftDate && rightDate && leftDate.getTime() !== rightDate.getTime()) {
      return leftDate - rightDate;
    }
    const orderDifference = (left?.display_order ?? 0) - (right?.display_order ?? 0);
    return orderDifference || (left?.id ?? 0) - (right?.id ?? 0);
  });
}

function getClaimSources(sources = [], claim) {
  if (!claim) return [];
  return sources.filter((source) => source.claims_supported?.includes(claim));
}

function recordedArchitectureText(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (/^(?:not recorded in (?:the )?imported ASI list|building and architectural details are not recorded in the cited source)\.?$/i.test(text)) {
    return "";
  }
  return text;
}

function getArchitectureEvidence(site) {
  const sources = site?.sources ?? [];
  const artifacts = site?.artifacts ?? [];
  const layers = site?.architecturalLayers ?? [];
  return {
    architecture: recordedArchitectureText(site?.architecture),
    architectureSources: getClaimSources(sources, "architecture"),
    historicalPeriod: recordedArchitectureText(site?.historicalPeriod),
    periodSources: getClaimSources(sources, "historical_period"),
    layers: [...layers].sort((left, right) => left.display_order - right.display_order || (left.id ?? 0) - (right.id ?? 0)),
    artifactMaterials: artifacts.filter((artifact) => typeof artifact.material === "string" && artifact.material.trim()),
  };
}

function getDefaultHeritageOption(options = [], { hasTimeline = false } = {}) {
  if (!Array.isArray(options) || options.length === 0) return null;
  if (hasTimeline) return options[0];
  return options.find((option) => {
    const evidence = getArchitectureEvidence(option);
    return evidence.architecture || evidence.historicalPeriod || evidence.layers.length || evidence.artifactMaterials.length;
  }) ?? options[0];
}

function isValidHeritageSiteId(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

function isDatedAttributedImage(media) {
  if (!media || media.media_type !== "image" || media.verification_status !== "verified" || media.is_illustrative) return false;
  if (typeof media.documented_date !== "string" || !media.documented_date.trim()) return false;
  if (typeof media.license !== "string" || !media.license.trim()) return false;
  if (typeof media.credit !== "string" || !media.credit.trim()) return false;
  if (!(typeof media.creator === "string" && media.creator.trim()) && !media.credit.trim()) return false;
  for (const field of ["url", "source_url", "license_url"]) {
    try {
      const url = new URL(media[field] ?? "");
      if (url.protocol !== "https:" || url.username || url.password) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function getVerifiedComparisonPair(media = []) {
  const images = Array.isArray(media) ? media : [];
  return {
    historical: images.find((item) => item.media_role === "historical" && isDatedAttributedImage(item)) ?? null,
    current: images.find((item) => item.media_role === "current" && isDatedAttributedImage(item)) ?? null,
  };
}

function architecturalLayerKey(layer) {
  return String(layer.id ?? `${layer.display_order}:${layer.name}`);
}

function heritageSourceHref(heritageId, sourceId) {
  const recordId = Number(heritageId);
  const citationId = Number(sourceId);
  if (!Number.isSafeInteger(recordId) || recordId < 1 || !Number.isSafeInteger(citationId) || citationId < 1) {
    return null;
  }
  return `/heritage/${encodeURIComponent(String(recordId))}#source-${citationId}`;
}

export {
  architecturalLayerKey,
  getArchitectureEvidence,
  getClaimSources,
  getDefaultHeritageOption,
  heritageFeatureDetailReducer,
  heritageSourceHref,
  initialFeatureDetailState,
  isValidHeritageSiteId,
  getVerifiedComparisonPair,
  presentTimelineMoment,
  sortTimelineEvents,
};
