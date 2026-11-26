import { GENERIC_LENGTH, OsmPlatform, layoutFromOsm } from './three/osm-layout.js';

const area = (centerX: number, widthM: number, ref: string | null = null, zMin = -106, zMax = 107): OsmPlatform =>
  ({ shape: 'area', ref, level: null, widthM, centerX, zMin, zMax });
const line = (centerX: number, ref: string | null = null, zMin = -106, zMax = 107): OsmPlatform =>
  ({ shape: 'line', ref, level: null, widthM: null, centerX, zMin, zMax });
const tracks = (...xs: number[]) => xs.map((x) => ({ x }));

describe('layoutFromOsm', () => {
  it('falls back to the generic model without a layout', () => {
    const l = layoutFromOsm(null, 'side');
    expect(l.source).toBe('generic');
    expect(l.kind).toBe('side');
    expect(l.length).toBe(GENERIC_LENGTH);
  });

  it('builds an island from one area between two tracks, at full platform length', () => {
    const l = layoutFromOsm({ platforms: [area(0, 7.6, '1;2')], tracks: tracks(-5.7, 5.4) }, 'side');
    expect(l.source).toBe('osm');
    expect(l.kind).toBe('island');
    expect(l.length).toBeCloseTo(213, 0);
    expect(l.tracks.map((t) => t.dir)).toEqual(['North', 'South']);
    expect(l.ramps.map((r) => r.esc)).toEqual([true, false]);
    expect(l.ramps[0].label).toBe('Platforms 1 & 2 · Escalator');
  });

  it('joins an island mapped as two touching halves', () => {
    const l = layoutFromOsm({ platforms: [area(-2.3, 5, '1'), area(2.6, 5.3, '2')], tracks: tracks(-6.8, 6.9) }, 'island');
    expect(l.platforms).toHaveLength(1);
    expect(l.platforms[0].ref).toBe('1;2');
    expect(l.kind).toBe('island');
  });

  it('keeps two islands and four tracks apart (MacArthur)', () => {
    const l = layoutFromOsm({ platforms: [area(-8.2, 9), area(8.3, 8.9)], tracks: tracks(-14.3, -2.2, 2, 14.3) }, 'island');
    expect(l.platforms).toHaveLength(2);
    expect(l.tracks).toHaveLength(4);
    expect(l.kind).toBe('island');
    expect(l.halfWidth).toBeGreaterThan(18); // the station box widens to fit
  });

  it('reads side platforms from edge lines facing tracks between them', () => {
    const l = layoutFromOsm({ platforms: [line(4.6), line(-4.6)], tracks: tracks(-2.2, 2.2) }, 'island');
    expect(l.kind).toBe('side');
    expect(l.platforms.map((p) => [p.x0, p.x1])).toEqual([[-9.4, -4.6], [4.6, 9.4]]);
  });

  it('joins line pieces split along the track before pairing edges into an island', () => {
    const l = layoutFromOsm({
      platforms: [line(-2.7, '1', 53, 127), line(-2.5, '1', -73, 53), line(-2.4, '1', -87, -73),
        line(2.4, '2', 53, 127), line(2.6, '2', -73, 53), line(2.6, '2', -87, -73)],
      tracks: tracks(-4.4, 4.8),
    }, 'island');
    expect(l.platforms).toHaveLength(1);
    expect(l.length).toBeCloseTo(214, 0);
  });

  it('treats a line far from both tracks as an island centre line', () => {
    const l = layoutFromOsm({ platforms: [line(0)], tracks: tracks(-6.1, 6.1) }, 'side');
    expect(l.kind).toBe('island');
    expect(l.platforms[0].x0).toBeCloseTo(-4, 1);
  });

  it('trusts an island tagged for both tracks over tracks mapped too close for it', () => {
    const l = layoutFromOsm({ platforms: [line(0, '1;2')], tracks: tracks(-2.3, 2.4) }, 'side');
    expect(l.kind).toBe('island');
    expect(l.tracks.map((t) => t.x)).toEqual([-6.1, 6.1]);
  });

  it('never runs a track through a platform and gives every platform a track', () => {
    const l = layoutFromOsm({ platforms: [line(-7.3, '1'), line(-0.3, '2'), line(7.6, '3')], tracks: tracks(-9.4) }, 'island');
    for (const t of l.tracks) expect(l.platforms.some((p) => t.x > p.x0 && t.x < p.x1)).toBe(false);
    for (const p of l.platforms) expect(l.tracks.some((t) => (t.x <= p.x0 && p.x0 - t.x < 3.6) || (t.x >= p.x1 && t.x - p.x1 < 3.6))).toBe(true);
  });
});
