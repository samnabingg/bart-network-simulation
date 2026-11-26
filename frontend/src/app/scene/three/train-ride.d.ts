// Types for the parts of train-ride.js used outside the 3D scenes.
import type { RideSegment } from './scene-api';

export const CAR: { length: number; wall: number; outer: number; ceiling: number; doorZ: number[]; doorHalf: number; doorH: number };
export function atDoor(x: number, z: number, side?: 'left' | 'right'): boolean;
export function atLeftDoor(x: number, z: number): boolean;
export function legSeconds(meters: number): number;
export function stationLook(v?: { doors?: string; layout?: string; level?: string; segments?: RideSegment[] | null } | null): {
  doors: 'left' | 'right';
  layout: string;
  level: 'tunnel' | 'elevated' | 'grade';
  segments: RideSegment[] | null;
};
