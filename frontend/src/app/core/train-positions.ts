// Where trains are drawn, frame by frame. Pure functions, unit-tested with Vitest.
//
// Demo: the browser runs the demo clock (up to 60x), so it places trains itself from the
// timetable the backend computed. The backend uses the same headways and offsets for the
// departure boards, so the map and the boards agree.
// Live: the backend estimates positions every poll; between polls the browser keeps each train
// moving with its running time and time remaining.

import { LineDef, LiveTrain, MapTrain, NetworkResponse, Trip } from './models';

const CARS = [8, 9, 10];

export const headwaySec = (line: LineDef) => line.headwayMin * 60;
export const demoOffsetSec = (line: LineDef, dir: number) => line.offsetSec + dir * headwaySec(line) * 0.5;

interface Placement {
  from: string;
  to: string;
  at: string | null;
  progress: number;
  nextIdx: number;
}

/** Where a train is, given seconds since it left its first stop. */
export function placeOnTrip(trip: Trip, e: number): Placement | null {
  const { stops, arrive, depart } = trip;
  for (let i = 0; i < stops.length; i++) {
    if (e <= depart[i]) {
      if (e >= arrive[i]) return { from: stops[i], to: stops[i], at: stops[i], progress: 0, nextIdx: i + 1 };
      return {
        from: stops[i - 1],
        to: stops[i],
        at: null,
        progress: (e - depart[i - 1]) / (arrive[i] - depart[i - 1]),
        nextIdx: i,
      };
    }
  }
  return null;
}

/** Demo trains at simulated time t (epoch seconds). Deterministic: the same t gives the same trains. */
export function demoTrains(network: Pick<NetworkResponse, 'lines' | 'timetable'>, t: number): MapTrain[] {
  const lines = new Map(network.lines.map((l) => [l.id, l]));
  const out: MapTrain[] = [];
  for (const trip of Object.values(network.timetable)) {
    const line = lines.get(trip.line);
    if (!line) continue;
    const h = headwaySec(line);
    const off = demoOffsetSec(line, trip.dir);
    const kMin = Math.floor((t - trip.total - off) / h);
    const kMax = Math.floor((t - off) / h);
    for (let k = kMin; k <= kMax; k++) {
      const e = t - (k * h + off);
      if (e < 0 || e > trip.total) continue;
      const pos = placeOnTrip(trip, e);
      if (!pos) continue;
      out.push({
        id: `${trip.line}-${trip.dir}-${k}`,
        line: trip.line,
        dir: trip.dir,
        hex: line.hex,
        dest: trip.stops[trip.stops.length - 1],
        from: pos.from,
        to: pos.to,
        at: pos.at,
        progress: pos.progress,
        next: pos.at ? trip.stops[pos.nextIdx] ?? null : pos.to,
        cars: CARS[((k % 3) + 3) % 3],
        delaySec: 0,
      });
    }
  }
  return out;
}

/**
 * Live trains, moved on by the time since the backend computed them.
 * A train whose time remaining runs out is shown standing at the station it was heading for.
 */
export function advanceLiveTrains(trains: LiveTrain[], secondsSinceAsOf: number): MapTrain[] {
  const dt = Math.max(0, secondsSinceAsOf);
  return trains.map((t) => {
    const base: MapTrain = {
      id: t.id, line: t.line, dir: t.dir, hex: t.hex, dest: t.dest, from: t.from, to: t.to,
      at: t.at, progress: t.progress, next: t.next, cars: t.cars, delaySec: t.delaySec,
    };
    if (t.at || t.runSec <= 0) return base;
    const remain = t.remainSec - dt;
    if (remain <= 0) return { ...base, from: t.to, at: t.to, progress: 0 };
    return { ...base, progress: Math.min(1, Math.max(0, 1 - remain / t.runSec)) };
  });
}

/** Minutes left on a live board row, counting down from when BART was read. */
export function minutesLeft(minutes: number | null, secondsSinceFetch: number): number | null {
  if (minutes == null) return null;
  return Math.max(0, Math.round(minutes - Math.max(0, secondsSinceFetch) / 60));
}
