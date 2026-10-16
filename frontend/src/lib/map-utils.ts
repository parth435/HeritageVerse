import type { HeritageMapView } from "@/lib/heritageAdapter";

export function filterMappableSites(sites: HeritageMapView[]) {
  return sites.filter((site) =>
    site.hasCoordinates &&
    site.latitude !== null &&
    site.longitude !== null &&
    Number.isFinite(site.latitude) &&
    Number.isFinite(site.longitude) &&
    site.latitude >= -90 &&
    site.latitude <= 90 &&
    site.longitude >= -180 &&
    site.longitude <= 180,
  );
}

export function groupCoordinateSites(sites: HeritageMapView[]) {
  const groups = new Map<string, HeritageMapView[]>();
  for (const site of sites) {
    const key = String(site.latitude) + "," + String(site.longitude);
    const group = groups.get(key);
    if (group) group.push(site);
    else groups.set(key, [site]);
  }
  return [...groups.values()];
}
