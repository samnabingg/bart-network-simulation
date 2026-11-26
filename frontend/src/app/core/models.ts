// Shapes returned by the Spring Boot API (see /swagger-ui.html on the backend).

/** [longitude, latitude], KML order. */
export type LonLat = [number, number];

export type StationKind = 'underground' | 'elevated' | 'surface';
export type PlatformLayout = 'island' | 'side';
export type Direction = 'North' | 'South';

export interface StationInfo {
  abbr: string;
  name: string;
  kind: StationKind;
  platform: PlatformLayout;
  lat: number | null;
  lon: number | null;
  address: string | null;
  city: string | null;
}

export interface LineDef {
  id: string;
  name: string;
  hex: string;
  apiHex: string;
  headwayMin: number;
  forward: Direction;
  offsetSec: number;
  /** Stops in the forward direction. */
  stops: string[];
}

export interface TrackPath {
  pts: LonLat[];
  /** meters */
  len: number;
  onTrack: boolean;
}

/** One line in one direction; seconds counted from leaving the first stop. */
export interface Trip {
  line: string;
  dir: 0 | 1;
  stops: string[];
  arrive: number[];
  depart: number[];
  run: number[];
  total: number;
}

export interface NetworkResponse {
  stations: StationInfo[];
  lines: LineDef[];
  /** keyed "ABBR>ABBR" */
  paths: Record<string, TrackPath>;
  /** keyed "line:dir" */
  timetable: Record<string, Trip>;
  dwellSec: number;
}

export interface Entrance {
  name: string;
  lat: number;
  lon: number;
}

export interface GeoDocument {
  track: LonLat[][];
  entrances: Record<string, Entrance[]>;
}

export interface NextStop {
  abbr: string;
  name: string;
  line: string;
  dir: 0 | 1;
}

export interface DepartureRow {
  destination: string;
  destAbbr: string;
  /** null when BART gave no usable estimate; 0 means Leaving */
  minutes: number | null;
  timeLabel: string;
  platform: string | null;
  direction: Direction | null;
  cars: string | null;
  color: string | null;
  hex: string;
  delaySec: number;
  cancelled: boolean;
  line: string | null;
  nextStop: NextStop | null;
}

export interface Departures {
  station: string;
  stationName: string;
  source: 'live' | 'demo';
  /** live only: when BART was read (ISO time) */
  fetchedAt: string | null;
  /** demo only: the simulated time the board is for (epoch seconds) */
  simTime: number | null;
  rows: DepartureRow[];
}

export interface LiveStatus {
  configured: boolean;
  available: boolean;
  fetchedAt: string | null;
  error: string | null;
  stations: number;
}

export interface LiveTrain {
  id: string;
  line: string;
  dir: 0 | 1;
  hex: string;
  dest: string;
  cars: number | null;
  delaySec: number;
  from: string;
  to: string;
  at: string | null;
  progress: number;
  next: string | null;
  runSec: number;
  remainSec: number;
}

export interface LiveTrainsResponse {
  asOf: string;
  fetchedAt: string | null;
  trains: LiveTrain[];
}

/** A train as the map draws it, from either source. */
export interface MapTrain {
  id: string;
  line: string;
  dir: 0 | 1;
  hex: string;
  dest: string;
  from: string;
  to: string;
  /** set while standing at a station */
  at: string | null;
  /** 0..1 from `from` to `to` */
  progress: number;
  next: string | null;
  cars: number | null;
  delaySec: number;
}

export type DataMode = 'live' | 'demo';

/** BART's fare for one trip (GET /api/fares). */
export interface Fare {
  orig: string;
  dest: string;
  /** adult Clipper fare in dollars, charged when you tap out */
  clipper: number;
  date: string;
}
