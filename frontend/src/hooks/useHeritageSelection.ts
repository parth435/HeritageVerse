import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { getHeritage, getHeritageById } from "@/lib/api";
import { heritageToView } from "@/lib/heritageAdapter";
import type { HeritageView } from "@/lib/heritageAdapter";
import {
  heritageFeatureDetailReducer,
  getDefaultHeritageOption,
  initialFeatureDetailState,
  isValidHeritageSiteId,
} from "@/lib/heritageFeatureData.js";

const SITE_PAGE_SIZE = 100;
const SEARCH_DELAY_MS = 180;

/** Search the full published catalogue and load the selected site's detail record. */
export function useHeritageSelection({ hasTimeline = false }: { hasTimeline?: boolean } = {}) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<HeritageView[]>([]);
  const [selectedSummary, setSelectedSummary] = useState<HeritageView | null>(null);
  const [siteId, setSiteId] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [detail, dispatchDetail] = useReducer(heritageFeatureDetailReducer, initialFeatureDetailState);
  const [retryKey, setRetryKey] = useState(0);
  const selectedSiteId = useRef(siteId);
  selectedSiteId.current = siteId;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setListLoading(true);
    setListError(null);
    const timer = window.setTimeout(() => {
      void getHeritage({ q: query.trim() || undefined, hasTimeline: hasTimeline || undefined, limit: SITE_PAGE_SIZE }, { signal: controller.signal })
        .then((response) => {
          if (!active) return;
          const options = response.items.map(heritageToView);
          setSearchResults(options);
          const currentId = selectedSiteId.current;
          const selectedFromResults = options.find((option) => option.routeId === currentId);
          if (selectedFromResults) setSelectedSummary(selectedFromResults);
          if (!currentId && options.length) {
            const preferred = getDefaultHeritageOption(options, { hasTimeline });
            if (preferred) {
              setSelectedSummary(preferred);
              setSiteId(preferred.routeId);
            }
          }
        })
        .catch((reason: unknown) => {
          if (!active || controller.signal.aborted) return;
          setListError(reason instanceof Error ? reason.message : "Heritage sites could not load.");
        })
        .finally(() => {
          if (active) setListLoading(false);
        });
    }, query.trim() ? SEARCH_DELAY_MS : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasTimeline, query, retryKey]);

  useEffect(() => {
    if (!siteId) {
      dispatchDetail({ type: "reset" });
      return;
    }
    if (!isValidHeritageSiteId(siteId)) {
      dispatchDetail({ type: "error", message: "Choose a valid heritage site." });
      return;
    }

    const controller = new AbortController();
    let active = true;
    dispatchDetail({ type: "loading" });
    void getHeritageById(Number(siteId), { signal: controller.signal })
      .then((heritage) => {
        if (active) dispatchDetail({ type: "success", site: heritageToView(heritage) });
      })
      .catch((reason: unknown) => {
        if (!active || controller.signal.aborted) return;
        dispatchDetail({
          type: "error",
          message: reason instanceof Error ? reason.message : "The selected heritage record could not load.",
        });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [siteId, retryKey]);

  const siteOptions = useMemo(() => {
    if (selectedSummary && !searchResults.some((option) => option.routeId === selectedSummary.routeId)) {
      return [selectedSummary, ...searchResults];
    }
    return searchResults;
  }, [searchResults, selectedSummary]);

  const selectSite = useCallback((nextSiteId: string) => {
    const summary = siteOptions.find((option) => option.routeId === nextSiteId);
    if (summary) setSelectedSummary(summary);
    setSiteId(nextSiteId);
  }, [siteOptions]);

  const retry = useCallback(() => setRetryKey((current) => current + 1), []);

  return {
    query,
    setQuery,
    searchResults,
    searchResultCount: searchResults.length,
    siteOptions,
    siteId,
    selectSite,
    site: detail.site,
    listLoading,
    detailLoading: detail.loading,
    listError,
    detailError: detail.error,
    retry,
  };
}
