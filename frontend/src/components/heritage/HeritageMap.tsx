import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import type { HeritageMapView } from "@/lib/heritageAdapter";
import { buildGoogleMapsDirectionsUrl } from "@/lib/directions.js";
import { formatApproxDistance } from "@/lib/nearby.js";
import { filterMappableSites, groupCoordinateSites } from "@/lib/map-utils";
import { getVerifiedHeritageImages, getHeritageImageFallback, getHeritageImageSource, isHeritageImageFallback } from "@/lib/image-assets.js";
import "./HeritageMap.css";

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function mapTileSettings() {
  const url = import.meta.env.VITE_MAP_TILE_URL?.trim() || DEFAULT_TILE_URL;
  const usesDefault = url === DEFAULT_TILE_URL;
  const attribution = import.meta.env.VITE_MAP_TILE_ATTRIBUTION?.trim();
  const attributionUrl = import.meta.env.VITE_MAP_TILE_ATTRIBUTION_URL?.trim();
  try {
    const parsed = new URL(url.replaceAll("{z}", "1").replaceAll("{x}", "1").replaceAll("{y}", "1").replaceAll("{s}", "a"));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || !url.includes("{z}") || !url.includes("{x}") || !url.includes("{y}")) {
      return { error: "Map tile settings are invalid. Use an HTTPS tile URL containing {z}, {x}, and {y}.", url, attribution: DEFAULT_TILE_ATTRIBUTION };
    }
    if (!usesDefault && !attribution) {
      return { error: "The configured map provider must include its attribution text.", url, attribution: DEFAULT_TILE_ATTRIBUTION };
    }
    if (usesDefault && !attribution) return { error: null, url, attribution: DEFAULT_TILE_ATTRIBUTION };
    if (attributionUrl) {
      const parsedAttribution = new URL(attributionUrl);
      if (parsedAttribution.protocol !== "https:" || parsedAttribution.username || parsedAttribution.password) {
        return { error: "The configured map attribution link must use HTTPS.", url, attribution: escapeHtml(attribution ?? "") };
      }
      return { error: null, url, attribution: `<a href="${escapeHtml(parsedAttribution.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(attribution ?? "")}</a>` };
    }
    return { error: null, url, attribution: escapeHtml(attribution ?? "") };
  } catch {
    return { error: "Map tile settings are invalid. Check the configured HTTPS URL and attribution.", url, attribution: DEFAULT_TILE_ATTRIBUTION };
  }
}

type MapSite = HeritageMapView;

function markerPopupForSite(site: MapSite, routeOrigin?: { latitude: number; longitude: number; label?: string }, verifiedPhotoOnly = false) {
  const content = document.createElement("article");
  content.className = "heritage-map-popup";

  const link = document.createElement("a");
  link.href = `/heritage/${encodeURIComponent(site.routeId)}`;
  link.className = "heritage-map-popup-link";
  link.textContent = site.name;
  content.append(link);

  if (site.category?.name) {
    const category = document.createElement("small");
    category.textContent = site.category.name;
    content.append(category);
  }

  const image = getVerifiedHeritageImages(site.gallery)[0];
  if (image) {
    const photo = document.createElement("img");
    photo.alt = image.alt;
    photo.loading = "lazy";
    photo.className = "heritage-map-popup-image";
    let usingFallback = false;
    photo.onerror = () => {
      const fallback = getHeritageImageFallback({ url: image.src }, photo.src);
      if (fallback && !usingFallback) {
        if (isHeritageImageFallback(fallback)) {
          if (verifiedPhotoOnly) {
            const unavailable = document.createElement("small");
            unavailable.textContent = "Verified photograph unavailable";
            photo.replaceWith(unavailable);
            usingFallback = true;
            return;
          }
          usingFallback = true;
          photo.alt = `${site.name} illustrative placeholder; verified photograph unavailable`;
          const notice = document.createElement("small");
          notice.textContent = "Illustrative placeholder; verified photograph unavailable";
          content.append(notice);
        }
        photo.src = fallback;
      } else {
        const unavailable = document.createElement("small");
        unavailable.textContent = "Verified photograph unavailable";
        photo.replaceWith(unavailable);
      }
    };
    const photoSource = getHeritageImageSource({ url: image.src, thumbnail_url: image.thumbnailSrc });
    if (photoSource) {
      photo.src = photoSource;
      content.append(photo);
    } else {
      const unavailable = document.createElement("small");
      unavailable.textContent = "Verified photograph unavailable";
      content.append(unavailable);
    }
    const attribution = document.createElement("small");
    attribution.textContent = image.credit || image.creator || "";
    if (attribution.textContent) content.append(attribution);
    let sourceUrl = null;
    try {
      const parsed = new URL(image.sourceUrl ?? "");
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password) sourceUrl = parsed.href;
    } catch {
      sourceUrl = null;
    }
    if (sourceUrl) {
      const source = document.createElement("a");
      source.href = sourceUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.textContent = "Image source and license";
      content.append(source);
    }
  } else {
    const placeholder = document.createElement("small");
    placeholder.textContent = "No verified photograph";
    content.append(placeholder);
  }

  const description = document.createElement("p");
  description.textContent = site.description || "More verified information is available on the heritage detail page.";
  content.append(description);

  const location = document.createElement("small");
  location.textContent = site.location;
  content.append(location);

  if (site.distanceKm !== undefined && Number.isFinite(site.distanceKm)) {
    const distance = document.createElement("small");
    distance.textContent = `Approx. ${formatApproxDistance(site.distanceKm)} straight-line`;
    content.append(distance);
  }

  const directions = document.createElement("a");
  directions.href = `/heritage/${encodeURIComponent(site.routeId)}#directions`;
  directions.className = "heritage-map-popup-directions";
  directions.textContent = "Plan route in HeritageVerse";
  content.append(directions);

  const externalDirections = document.createElement("a");
  externalDirections.href = buildGoogleMapsDirectionsUrl({ latitude: site.latitude!, longitude: site.longitude! }, routeOrigin ?? null);
  externalDirections.target = "_blank";
  externalDirections.rel = "noopener noreferrer";
  externalDirections.className = "heritage-map-popup-directions";
  externalDirections.textContent = "Get directions in Google Maps";
  content.append(externalDirections);
  return content;
}

function markerPopup(sites: MapSite[], routeOrigin?: { latitude: number; longitude: number; label?: string }, verifiedPhotoOnly = false) {
  if (sites.length === 1) return markerPopupForSite(sites[0], routeOrigin, verifiedPhotoOnly);
  const content = document.createElement("section");
  content.className = "heritage-map-popup";
  const heading = document.createElement("strong");
  heading.textContent = sites.length + " heritage sites share this location";
  content.append(heading);
  for (const site of sites) content.append(markerPopupForSite(site, routeOrigin, verifiedPhotoOnly));
  return content;
}

export function HeritageMap({
  sites,
  mapSites,
  label = "Heritage sites map",
  className = "",
  selectedRouteId,
  onSiteSelect,
  routeGeometry,
  routeOrigin,
  catalogueStatus,
  mapDataStatus,
  verifiedPhotoOnly = false,
}: {
  sites: MapSite[];
  mapSites?: MapSite[];
  label?: string;
  className?: string;
  selectedRouteId?: string;
  onSiteSelect?: (routeId: string) => void;
  /** GeoJSON coordinate order: [longitude, latitude]. */
  routeGeometry?: [number, number][];
  routeOrigin?: { latitude: number; longitude: number; label?: string };
  catalogueStatus?: "loading" | "error" | "success";
  mapDataStatus?: "loading" | "error" | "success";
  verifiedPhotoOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markersRef = useRef<Map<string, Leaflet.Marker>>(new Map());
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const mappedSites = useMemo(() => filterMappableSites(mapSites ?? sites), [mapSites, sites]);
  const markerGroups = useMemo(() => groupCoordinateSites(mappedSites), [mappedSites]);

  useEffect(() => {
    const container = containerRef.current;
    const hasRoute = Boolean(routeGeometry && routeGeometry.length > 1);
    if (!container || (mappedSites.length === 0 && !hasRoute)) return;
    let map: Leaflet.Map | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimeout: number | undefined;
    let cancelled = false;
    setMapError(null);
    setMapLoading(true);

    void import("leaflet")
      .then(({ default: L }) => {
        if (cancelled) return;
        const points: Leaflet.LatLngExpression[] = mappedSites.length
          ? mappedSites.map((site) => [site.latitude!, site.longitude!])
          : (routeGeometry ?? []).map(([longitude, latitude]) => [latitude, longitude]);
        const center: Leaflet.LatLngExpression = points.length === 1
          ? points[0]
          : [
              points.reduce((sum, point) => sum + (point as [number, number])[0], 0) / points.length,
              points.reduce((sum, point) => sum + (point as [number, number])[1], 0) / points.length,
            ];

        map = L.map(container, { scrollWheelZoom: false });
        mapRef.current = map;
        map.setView(center, mappedSites.length === 1 ? 11 : 5);
        const tileSettings = mapTileSettings();
        if (tileSettings.error) {
          setMapLoading(false);
          setMapError(tileSettings.error);
        } else {
          const tileLayer = L.tileLayer(tileSettings.url, {
            attribution: tileSettings.attribution,
            maxZoom: 19,
          }).addTo(map);
        let tileErrors = 0;

        tileLayer.on("tileerror", () => {
          tileErrors += 1;
          if (cancelled) return;
          setMapLoading(false);
          setMapError("Some map tiles could not be loaded. Verified site markers and the location list remain available.");
        });
        tileLayer.on("tileload", () => {
          if (cancelled) return;
          setMapLoading(false);
          if (tileErrors === 0) setMapError(null);
        });
        tileLayer.on("load", () => {
          if (cancelled) return;
          setMapLoading(false);
          setMapError(tileErrors ? "Some map tiles could not be loaded. Verified site markers and the location list remain available." : null);
        });
        }
        const markerIcon = L.divIcon({
          className: "heritage-map-marker-wrap",
          html: '<span class="heritage-map-marker" aria-hidden="true"></span>',
          iconSize: [24, 32],
          iconAnchor: [12, 29],
          popupAnchor: [0, -25],
        });

        const markers = markerGroups.map((siteGroup) => {
          const site = siteGroup[0];
          const marker = L.marker([site.latitude!, site.longitude!], {
            title: siteGroup.length === 1 ? site.name : siteGroup.length + " heritage sites at this location",
            alt: siteGroup.length === 1 ? site.name : siteGroup.length + " heritage sites at this location",
            icon: markerIcon,
          }).bindPopup(markerPopup(siteGroup, routeOrigin, verifiedPhotoOnly)).addTo(map!);
          marker.on("click", () => onSiteSelect?.(site.routeId));
          for (const groupedSite of siteGroup) markersRef.current.set(groupedSite.routeId, marker);
          return marker;
        });

        const layers: Leaflet.Layer[] = [...markers];
        if (routeOrigin) {
          const originIcon = L.divIcon({
            className: "heritage-map-origin-wrap",
            html: '<span class="heritage-map-origin-marker" aria-hidden="true"></span>',
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });
          const originMarker = L.marker([routeOrigin.latitude, routeOrigin.longitude], {
            title: routeOrigin.label || "Starting location",
            alt: routeOrigin.label || "Starting location",
            icon: originIcon,
          }).bindPopup(escapeHtml(routeOrigin.label || "Starting location")).addTo(map);
          layers.push(originMarker);
        }
        if (hasRoute && routeGeometry) {
          const routeLine = L.polyline(routeGeometry.map(([longitude, latitude]) => [latitude, longitude]), {
            color: "#d6a04e",
            weight: 5,
            opacity: 0.9,
          }).addTo(map);
          layers.push(routeLine);
        }

        if (layers.length > 1) {
          map.fitBounds(L.featureGroup(layers).getBounds().pad(0.12), { maxZoom: 8 });
        }

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => map?.invalidateSize());
          resizeObserver.observe(container);
        }
        resizeTimeout = window.setTimeout(() => map?.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) {
          setMapLoading(false);
          setMapError("The map could not be initialized. The heritage list remains available.");
        }
      });

    return () => {
      cancelled = true;
      if (resizeTimeout !== undefined) window.clearTimeout(resizeTimeout);
      resizeObserver?.disconnect();
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
      markersRef.current.clear();
    };
  }, [mappedSites, markerGroups, onSiteSelect, retryKey, routeGeometry, routeOrigin, verifiedPhotoOnly]);

  const fallbackSite = mappedSites.find((site) => site.routeId === selectedRouteId) ?? mappedSites[0];
  const fallbackPoint = fallbackSite
    ? { latitude: fallbackSite.latitude!, longitude: fallbackSite.longitude! }
    : routeGeometry?.length
      ? { latitude: routeGeometry[0][1], longitude: routeGeometry[0][0] }
      : null;
  const externalMapUrl = fallbackPoint
    ? `https://www.openstreetmap.org/?mlat=${fallbackPoint.latitude}&mlon=${fallbackPoint.longitude}#map=12/${fallbackPoint.latitude}/${fallbackPoint.longitude}`
    : null;
  const emptyMapMessage = catalogueStatus === "loading"
    ? "Loading published heritage records…"
    : catalogueStatus === "error"
      ? "The heritage catalogue could not load. Retry the catalogue request to view record results."
      : mapDataStatus === "loading"
        ? "Loading source-verified map locations…"
        : mapDataStatus === "error"
          ? "Map locations could not load. The catalogue remains available."
          : sites.length === 0
            ? "No heritage records match the current filters."
            : "No sites in these results have a complete coordinate pair with a supporting source yet. Other records remain listed without approximate pins.";

  useEffect(() => {
    if (!selectedRouteId) return;
    const marker = markersRef.current.get(selectedRouteId);
    if (!marker || !mapRef.current) return;
    mapRef.current.setView(marker.getLatLng(), Math.max(mapRef.current.getZoom(), 11), { animate: true });
    marker.openPopup();
  }, [mappedSites, selectedRouteId]);

  return (
    <section className={className} aria-label={label}>
      {mappedSites.length === 0 && !(routeGeometry && routeGeometry.length > 1) ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 text-sm text-parchment/65" role="status">
          {emptyMapMessage}
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-2xl border border-white/10">
            <div ref={containerRef} className="heritage-leaflet-map h-[22rem] w-full sm:h-[28rem]" role="application" aria-label={label} />
            {mapLoading && !mapError ? <div className="absolute left-3 right-3 top-3 z-[1000] rounded-lg bg-ink/95 p-3 text-xs text-parchment shadow-lg" role="status">Loading map tiles…</div> : null}
            {mapError ? (
              <div className="absolute left-3 right-3 top-3 z-[1000] flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ink/95 p-3 text-xs text-parchment shadow-lg" role="status">
                <span>{mapError}</span>
                <div className="flex shrink-0 items-center gap-3">
                  {externalMapUrl ? <a href={externalMapUrl} target="_blank" rel="noopener noreferrer" className="text-gold underline underline-offset-2">Open coordinates in OpenStreetMap</a> : null}
                  <button type="button" onClick={() => { setMapLoading(true); setMapError(null); setRetryKey((key) => key + 1); }} className="text-gold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Retry tiles</button>
                </div>
              </div>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-parchment/45">
            {mappedSites.length} mapped {mappedSites.length === 1 ? "site" : "sites"}. Map provider attribution appears in the map controls.
          </p>
        </>
      )}
    </section>
  );
}
