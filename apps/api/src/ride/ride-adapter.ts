export const RIDE_PLATFORMS = ['amap', 'didi', 'manual'] as const;

export type RidePlatform = (typeof RIDE_PLATFORMS)[number];

export interface CoordinatePoint {
  longitude: number;
  latitude: number;
}

export interface OpenRideInput {
  origin: string;
  destination: string;
  originPoint?: CoordinatePoint;
  destinationPoint?: CoordinatePoint;
  departureAt?: string;
  platform: RidePlatform;
}

export interface OpenRideResult {
  platform: RidePlatform;
  fallbackLevel: 'deeplink' | 'copy-route';
  deeplink?: string;
  copyRouteText: string;
  hint: string;
}
