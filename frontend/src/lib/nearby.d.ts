import type { Heritage } from "@/types/heritage";

export function isValidGeoPoint(point: { latitude: unknown; longitude: unknown } | null | undefined): boolean;
export function haversineDistanceKm(origin: { latitude: unknown; longitude: unknown }, destination: { latitude: unknown; longitude: unknown }): number | null;
export function findNearbyPlaces(places: Heritage[], origin: { latitude: number; longitude: number } | null, radiusKm: number): Array<{ place: Heritage; distanceKm: number }>;
export function formatApproxDistance(distanceKm: number): string;
