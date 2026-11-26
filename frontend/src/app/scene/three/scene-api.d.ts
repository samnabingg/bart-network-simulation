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
  /** meters of track from the previous stop (for ride timing) */
  meters?: number;
}

export interface SceneOptions {
  preserveDrawingBuffer?: boolean;
  spawn?: 'platform';
  balance?: number;
  nextStop?: (req: NextStopRequest) => SceneNextStop | null;
  /** Every stop after the boarding station, in order, to the train's destination. */
  route?: (req: NextStopRequest) => SceneNextStop[];
  onExit?: (nextAbbr: string, carry: { balance: number; tripFrom: string | null }) => void;
  /** The trip on the card when you arrive by train: where you tapped in. */
  trip?: { from: string } | null;
  /** BART's Clipper fare in dollars; rejects with a readable Error. */
  fare?: (orig: string, dest: string) => Promise<number>;
  stationName?: (abbr: string) => string;
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
