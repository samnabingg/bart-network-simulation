import { StationScene, StationSceneOptions } from './scene-api';

export function createStationScene(host: HTMLElement, opts: StationSceneOptions): StationScene;
export function stationFamily(abbr: string, kind: string): { key: string; label: string };
