// Types for the hand-written Three.js scenes (plain JS modules, kept as they were in the prototype).

export interface SceneRow {
  destination: string;
  destAbbr: string;
  minutes: number | null;
  platform: string | null;
  direction: string | null;
  cars: string | null;
  hex: string;
  cancelled: boolean;
}

export interface NextStopRequest {
  from: string;
  destAbbr: string;
  hex: string;
  direction: string;
}

export interface SceneNextStop {
  abbr: string;
  name: string;
}

export interface SceneOptions {
  preserveDrawingBuffer?: boolean;
  spawn?: 'platform';
  balance?: number;
  nextStop?: (req: NextStopRequest) => SceneNextStop | null;
  onExit?: (nextAbbr: string, carry: { balance: number }) => void;
}

export interface StationSceneOptions extends SceneOptions {
  station: { abbr: string; name: string; kind: string; platform: string };
  lines: string[];
}

export interface StationScene {
  setLive(rows: SceneRow[] | null, note: string): void;
  teleport(spot: string): void;
  getState(): unknown;
  dispose(): void;
  _look?(yaw: number, pitch?: number): void;
  _park?(dir?: string, hex?: string, dest?: string): void;
  _skip?(sec: number): void;
}
