import { Component, ElementRef, OnDestroy, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NetworkApi, RideProfile } from '../core/network-api.service';
import { DepartureRow, LineDef, StationInfo, TrackPath } from '../core/models';
import type { SceneNextStop, SceneRow, StationScene } from './three/scene-api';
import { OsmLayout, SceneLayout, layoutFromOsm } from './three/osm-layout.js';

export interface SceneExit {
  next: string;
  balance: number;
  /** where the trip on the card started; you pay for it when you tap out */
  tripFrom: string | null;
}

export interface SceneFeed {
  rows: DepartureRow[] | null;
  note: string;
}

const KIND_LABEL: Record<string, string> = { underground: 'underground', elevated: 'elevated', surface: 'ground level' };

/**
 * Hosts the walkable 3D station. The Three.js code is loaded on demand (its own bundle chunk),
 * so the map is usable before the 3D library has downloaded.
 */
@Component({
  selector: 'app-station-scene',
  template: `
    <h2 id="sceneHeading">{{ heading() }}</h2>
    <div #host class="scene" tabindex="0" aria-labelledby="sceneHeading"></div>
    <p class="hint">{{ caption() }}</p>
  `,
})
export class StationSceneComponent implements OnDestroy {
  readonly station = input<StationInfo | null>(null);
  readonly lines = input<LineDef[]>([]);
  /** All stations, for naming the stops along a ride. */
  readonly stations = input<StationInfo[]>([]);
  /** Track between neighbouring stations, keyed "ABBR>ABBR": real leg lengths for the ride. */
  readonly paths = input<Record<string, TrackPath>>({});
  /** Where the trip on the card started, when arriving by train. */
  readonly tripFrom = input<string | null>(null);
  readonly feed = input<SceneFeed>({ rows: null, note: '' });
  /** Card balance carried over from the previous station. */
  readonly balance = input<number | undefined>(undefined);
  readonly spawn = input<'platform' | undefined>(undefined);
  readonly debug = input(false);

  readonly exit = output<SceneExit>();
  readonly ready = output<StationScene>();

  readonly heading = signal('Station walkthrough');
  readonly caption = signal(SCENE_HINT);

  private readonly api = inject(NetworkApi);
  /** The controls hint, plus the OpenStreetMap credit when the station is built from OSM data. */
  private hint = SCENE_HINT;

  /** The station's OSM layout, or null when there is none (the scene then uses the generic model). */
  private fetchLayout(abbr: string): Promise<OsmLayout | null> {
    return firstValueFrom(this.api.stationLayout(abbr)).catch(() => null);
  }
  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private scene: StationScene | null = null;
  private loadToken = 0;
  /** Tunnels, viaducts and door sides for the ride (null until loaded or when the server has none). */
  private profile: RideProfile | null = null;

  constructor() {
    effect(() => {
      const st = this.station();
      untracked(() => void this.load(st));
    });
    effect(() => {
      const feed = this.feed();
      untracked(() => this.push(feed));
    });
  }

  ngOnDestroy(): void {
    this.loadToken++;
    this.scene?.dispose();
    this.scene = null;
  }

  focus(): void {
    this.host().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    this.host().nativeElement.focus({ preventScroll: true });
  }

  private async load(st: StationInfo | null): Promise<void> {
    const token = ++this.loadToken;
    this.scene?.dispose();
    this.scene = null;
    const hostEl = this.host().nativeElement;
    hostEl.replaceChildren();
    if (!st) return;

    // Bay Fair has its own model from photos; every other station is built from its OSM layout.
    const [{ createStationScene, stationFamily }, { createBayFairScene }, layout, profile] = await Promise.all([
      import('./three/station3d.js'),
      import('./three/bayfair.js'),
      st.abbr === 'BAYF' ? Promise.resolve(null) : this.fetchLayout(st.abbr),
      // tunnels and viaducts along the ride; without it the ride still runs, on ground-level track
      firstValueFrom(this.api.rideProfile()).catch(() => null),
    ]);
    this.profile = profile;
    if (token !== this.loadToken) return; // another station was picked while loading

    const common = {
      preserveDrawingBuffer: this.debug(),
      spawn: this.spawn(),
      balance: this.balance(),
      nextStop: ({ from, destAbbr, hex, direction }: { from: string; destAbbr: string; hex: string; direction: string }) =>
        this.nextStopFor(from, destAbbr, hex, direction),
      route: ({ from, destAbbr, hex, direction }: { from: string; destAbbr: string; hex: string; direction: string }) =>
        this.routeFor(from, destAbbr, hex, direction),
      onExit: (next: string, carry: { balance: number; tripFrom: string | null }) =>
        this.exit.emit({ next, balance: carry.balance, tripFrom: carry.tripFrom }),
      trip: this.tripFrom() ? { from: this.tripFrom()! } : null,
      fare: async (orig: string, dest: string) => (await firstValueFrom(this.api.fare(orig, dest))).clipper,
      stationName: (abbr: string) => this.stations().find((s) => s.abbr === abbr)?.name ?? abbr,
      stationView: (abbr: string) => this.profile?.stations[abbr] ?? null,
    };
    const kind = KIND_LABEL[st.kind] ?? st.kind;
    this.hint = SCENE_HINT;
    if (st.abbr === 'BAYF') {
      this.scene = createBayFairScene(hostEl, common);
      this.heading.set('Bay Fair walkthrough (detailed model from photos)');
    } else {
      this.scene = createStationScene(hostEl, {
        ...common,
        station: { abbr: st.abbr, name: st.name, kind: st.kind, platform: st.platform },
        lines: this.lines().filter((l) => l.stops.includes(st.abbr)).map((l) => l.hex),
        layout,
      });
      const shape = layoutFromOsm(layout, st.platform);
      this.heading.set(`${st.name} walkthrough (${stationFamily(st.abbr, st.kind).label}; ${kind}, ${describeLayout(shape)})`);
      // OpenStreetMap's license (ODbL) asks for credit wherever its data is shown
      if (shape.source === 'osm') this.hint = `${SCENE_HINT} ${OSM_CREDIT}`;
    }
    this.push(this.feed());
    this.ready.emit(this.scene);
  }

  /** The 3D boards and trains follow the same departures as the panel. */
  private push(feed: SceneFeed): void {
    const scene = this.scene;
    const st = this.station();
    if (!scene || !st) return;
    const rows = (feed.rows ?? []).filter((r) => !r.cancelled && r.minutes != null);
    if (!rows.length) {
      // An empty list, not null: null makes the scene run its own made-up train.
      const why = feed.rows === null ? feed.note || 'Waiting for departures' : `No departures listed for ${st.name} right now`;
      scene.setLive([], why);
      this.caption.set(this.hint);
      return;
    }
    scene.setLive(rows.map(toSceneRow), feed.note);
    const next = rows[0];
    const when = next.minutes === 0 ? 'leaving' : `in ${next.minutes} min`;
    this.caption.set(`Next train at ${st.name}: ${next.destination}${next.platform ? `, platform ${next.platform}` : ''}, ${when}. ${this.hint}`);
  }

  /** The backend matched every row to its line and next stop; find the row for this train. */
  private matchRow(from: string, destAbbr: string, hex: string, direction: string): DepartureRow | null {
    if (from !== this.station()?.abbr) return null;
    const rows = this.feed().rows ?? [];
    return (
      rows.find((r) => r.destAbbr === destAbbr && r.hex.toLowerCase() === hex?.toLowerCase() && r.direction === direction) ??
      rows.find((r) => r.destAbbr === destAbbr && r.direction === direction) ??
      rows.find((r) => r.destAbbr === destAbbr) ??
      null
    );
  }

  private nextStopFor(from: string, destAbbr: string, hex: string, direction: string): SceneNextStop | null {
    const ns = this.matchRow(from, destAbbr, hex, direction)?.nextStop;
    return ns ? { abbr: ns.abbr, name: ns.name } : null;
  }

  /**
   * Every stop this train makes after `from`, in order, up to its destination (or the end of the
   * line). Falls back to just the next stop when the line is unknown.
   */
  private routeFor(from: string, destAbbr: string, hex: string, direction: string): SceneNextStop[] {
    const ns = this.matchRow(from, destAbbr, hex, direction)?.nextStop;
    if (!ns) return [];
    const line = this.lines().find((l) => l.id === ns.line);
    const stops = line ? (ns.dir === 0 ? line.stops : [...line.stops].reverse()) : [];
    const i = stops.indexOf(from);
    if (i < 0 || stops[i + 1] !== ns.abbr) return [{ abbr: ns.abbr, name: ns.name }];
    const end = stops.indexOf(destAbbr, i + 1);
    const names = new Map(this.stations().map((s) => [s.abbr, s.name]));
    const paths = this.paths();
    const upto = end > i ? end + 1 : stops.length;
    const profile = this.profile;
    return stops.slice(i + 1, upto).map((abbr, k) => {
      const leg = `${stops[i + k]}>${abbr}`;
      const view = profile?.stations[abbr];
      return {
        abbr,
        name: names.get(abbr) ?? abbr,
        meters: paths[leg]?.len,
        ...(view ? { doors: view.doors, layout: view.layout, level: view.level } : {}),
        segments: profile?.legs[leg],
      };
    });
  }
}

const SCENE_HINT = 'Drag to look around, WASD to walk, E to use things.';
const OSM_CREDIT = 'Station layout © OpenStreetMap contributors (ODbL).';

/** "island platform, 213 m" / "2 island platforms, 213 m" / "side platforms" */
export function describeLayout(l: SceneLayout): string {
  const n = l.platforms.length;
  const what = l.kind === 'side' ? 'side platforms' : l.kind === 'island' ? (n === 1 ? 'island platform' : `${n} island platforms`) : `${n} platforms`;
  return l.source === 'osm' ? `${what}, ${Math.round(l.length)} m (OpenStreetMap)` : `${what} (approximate)`;
}

function toSceneRow(r: DepartureRow): SceneRow {
  return {
    destination: r.destination, destAbbr: r.destAbbr, minutes: r.minutes, platform: r.platform,
    direction: r.direction, cars: r.cars, hex: r.hex, cancelled: r.cancelled,
  };
}
