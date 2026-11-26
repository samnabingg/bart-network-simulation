// Types for osm-layout.js.

export interface SceneTrack { x: number; dir: 'North' | 'South' }
export interface ScenePlatform { x0: number; x1: number; ref?: string | null }
export interface SceneRamp { x0: number; x1: number; esc: boolean; label: string }

export interface SceneLayout {
  source: 'osm' | 'generic';
  kind: 'island' | 'side' | 'mixed';
  /** platform length (m) */
  length: number;
  /** half width of the station box: walls, roof and tunnel (m) */
  halfWidth: number;
  tracks: SceneTrack[];
  platforms: ScenePlatform[];
  ramps: SceneRamp[];
  boardX: number[];
  columnX: number[];
}

/** One platform from GET /api/stations/{abbr}/layout (the fields this module reads). */
export interface OsmPlatform {
  shape: 'area' | 'line';
  ref: string | null;
  level: string | null;
  widthM: number | null;
  centerX: number;
  zMin: number;
  zMax: number;
  tracksAlongside?: string;
}

export interface OsmLayout {
  abbr?: string;
  layout?: string;
  platforms: OsmPlatform[];
  tracks: { x: number }[];
  source?: { attribution: string };
}

export const GENERIC_LENGTH: number;
export const MIN_HALF_WIDTH: number;
export function genericLayout(platform: string): SceneLayout;
export function layoutFromOsm(osm: OsmLayout | null | undefined, platform: string): SceneLayout;
