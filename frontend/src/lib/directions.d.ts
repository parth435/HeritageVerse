export type DirectionCoordinates = { latitude: number; longitude: number };
export declare function parseCoordinateText(value: string): DirectionCoordinates | null;
export declare function geolocationErrorMessage(code: number): string;
export declare function formatRouteDistance(meters: number): string;
export declare function formatRouteDuration(seconds: number): string;
export declare function buildGoogleMapsDirectionsUrl(destination: DirectionCoordinates, origin?: DirectionCoordinates | null): string;
