import { LineDef, LiveTrain, Trip } from './models';
import { advanceLiveTrains, demoTrains, minutesLeft, placeOnTrip } from './train-positions';

// A three-stop line: A -> B (100 s) -> C (200 s), 25 s dwell, a train every 10 minutes.
const line: LineDef = {
  id: 'blue', name: 'Blue', hex: '#0099cc', apiHex: '#0099cc', headwayMin: 10, forward: 'North', offsetSec: 0,
  stops: ['A', 'B', 'C'],
};
const forward: Trip = { line: 'blue', dir: 0, stops: ['A', 'B', 'C'], arrive: [0, 100, 325], depart: [0, 125, 350], run: [0, 100, 200], total: 325 };
const back: Trip = { line: 'blue', dir: 1, stops: ['C', 'B', 'A'], arrive: [0, 200, 325], depart: [0, 225, 350], run: [0, 200, 100], total: 325 };
const network = { lines: [line], timetable: { 'blue:0': forward, 'blue:1': back } };

describe('placeOnTrip', () => {
  it('stands a train at a station during its dwell', () => {
    expect(placeOnTrip(forward, 110)).toEqual({ from: 'B', to: 'B', at: 'B', progress: 0, nextIdx: 2 });
  });

  it('puts a train part way along a stretch', () => {
    const p = placeOnTrip(forward, 50)!;
    expect(p.at).toBeNull();
    expect([p.from, p.to]).toEqual(['A', 'B']);
    expect(p.progress).toBeCloseTo(0.5);
  });

  it('returns null after the end of the trip', () => {
    expect(placeOnTrip(forward, 400)).toBeNull();
  });
});

describe('demoTrains', () => {
  const t = 1_800_000_000;

  it('is deterministic for the same simulated time', () => {
    expect(demoTrains(network, t)).toEqual(demoTrains(network, t));
  });

  it('keeps every train on its line with progress between 0 and 1', () => {
    for (let s = 0; s < 1200; s += 37) {
      for (const tr of demoTrains(network, t + s)) {
        expect(line.stops).toContain(tr.from);
        expect(line.stops).toContain(tr.to);
        expect(tr.progress).toBeGreaterThanOrEqual(0);
        expect(tr.progress).toBeLessThanOrEqual(1);
        expect(tr.hex).toBe('#0099cc');
      }
    }
  });

  it('runs both directions, offset by half a headway', () => {
    // At k*600 a forward train leaves A; the backward one left C 300 s earlier.
    const trains = demoTrains(network, 600 * 3_000_000);
    expect(trains.some((tr) => tr.dir === 0 && tr.at === 'A')).toBe(true);
    expect(trains.some((tr) => tr.dir === 1)).toBe(true);
  });

  it('gives each train a stable id so the map can move it rather than redraw it', () => {
    const a = demoTrains(network, t).map((tr) => tr.id);
    const b = demoTrains(network, t + 5).map((tr) => tr.id);
    expect(b.filter((id) => a.includes(id)).length).toBeGreaterThan(0);
  });
});

describe('advanceLiveTrains', () => {
  const moving: LiveTrain = {
    id: 'blue-0>SANL', line: 'blue', dir: 0, hex: '#0099cc', dest: 'DALY', cars: 9, delaySec: 0,
    from: 'BAYF', to: 'SANL', at: null, progress: 0.5, next: 'SANL', runSec: 120, remainSec: 60,
  };

  it('keeps a train moving between polls', () => {
    const [t] = advanceLiveTrains([moving], 30);
    expect(t.progress).toBeCloseTo(0.75);
    expect(t.at).toBeNull();
  });

  it('stands the train at the next station when its time runs out', () => {
    const [t] = advanceLiveTrains([moving], 61);
    expect(t.at).toBe('SANL');
    expect(t.from).toBe('SANL');
  });

  it('leaves standing trains where they are', () => {
    const standing = { ...moving, at: 'HAYW', from: 'HAYW', to: 'HAYW', progress: 0, remainSec: 0 };
    expect(advanceLiveTrains([standing], 500)[0].at).toBe('HAYW');
  });

  it('ignores a negative clock difference', () => {
    expect(advanceLiveTrains([moving], -10)[0].progress).toBeCloseTo(0.5);
  });
});

describe('minutesLeft', () => {
  it('counts live minutes down and stops at zero', () => {
    expect(minutesLeft(5, 0)).toBe(5);
    expect(minutesLeft(5, 120)).toBe(3);
    expect(minutesLeft(1, 600)).toBe(0);
    expect(minutesLeft(null, 30)).toBeNull();
  });
});
