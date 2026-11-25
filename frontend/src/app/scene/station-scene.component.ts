import { Component, ElementRef, OnDestroy, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { DepartureRow, LineDef, StationInfo } from '../core/models';
import type { SceneRow, StationScene } from './three/scene-api';

export interface SceneExit {
  next: string;
  balance: number;
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
  readonly feed = input<SceneFeed>({ rows: null, note: '' });
  /** Card balance carried over from the previous station. */
  readonly balance = input<number | undefined>(undefined);
  readonly spawn = input<'platform' | undefined>(undefined);
  readonly debug = input(false);

  readonly exit = output<SceneExit>();
  readonly ready = output<StationScene>();

  readonly heading = signal('Station walkthrough');
  readonly caption = signal(SCENE_HINT);

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private scene: StationScene | null = null;
  private loadToken = 0;

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

    const [{ createStationScene, stationFamily }, { createBayFairScene }] = await Promise.all([
      import('./three/station3d.js'),
      import('./three/bayfair.js'),
    ]);
    if (token !== this.loadToken) return; // another station was picked while loading

    const common = {
      preserveDrawingBuffer: this.debug(),
      spawn: this.spawn(),
      balance: this.balance(),
      nextStop: ({ from, destAbbr, hex, direction }: { from: string; destAbbr: string; hex: string; direction: string }) =>
        this.nextStopFor(from, destAbbr, hex, direction),
      onExit: (next: string, carry: { balance: number }) => this.exit.emit({ next, balance: carry.balance }),
    };
    const kind = KIND_LABEL[st.kind] ?? st.kind;
    const platforms = `${st.platform} platform${st.platform === 'side' ? 's' : ''}`;
    if (st.abbr === 'BAYF') {
      this.scene = createBayFairScene(hostEl, common);
      this.heading.set('Bay Fair walkthrough (detailed model from photos)');
    } else {
      this.scene = createStationScene(hostEl, {
        ...common,
        station: { abbr: st.abbr, name: st.name, kind: st.kind, platform: st.platform },
        lines: this.lines().filter((l) => l.stops.includes(st.abbr)).map((l) => l.hex),
      });
      this.heading.set(`${st.name} walkthrough (${stationFamily(st.abbr, st.kind).label}; ${kind}, ${platforms})`);
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
      scene.setLive(null, `Demo timing (no departures listed for ${st.name} right now)`);
      this.caption.set(SCENE_HINT);
      return;
    }
    scene.setLive(rows.map(toSceneRow), feed.note);
    const next = rows[0];
    const when = next.minutes === 0 ? 'leaving' : `in ${next.minutes} min`;
    this.caption.set(`Next train at ${st.name}: ${next.destination}${next.platform ? `, platform ${next.platform}` : ''}, ${when}. ${SCENE_HINT}`);
  }

  /** The backend matched every row to its line and next stop; find the row for this train. */
  private nextStopFor(from: string, destAbbr: string, hex: string, direction: string) {
    if (from !== this.station()?.abbr) return null;
    const rows = this.feed().rows ?? [];
    const match =
      rows.find((r) => r.destAbbr === destAbbr && r.hex.toLowerCase() === hex?.toLowerCase() && r.direction === direction) ??
      rows.find((r) => r.destAbbr === destAbbr && r.direction === direction) ??
      rows.find((r) => r.destAbbr === destAbbr);
    return match?.nextStop ? { abbr: match.nextStop.abbr, name: match.nextStop.name } : null;
  }
}

const SCENE_HINT = 'Drag to look around, WASD to walk, E to use things.';

function toSceneRow(r: DepartureRow): SceneRow {
  return {
    destination: r.destination, destAbbr: r.destAbbr, minutes: r.minutes, platform: r.platform,
    direction: r.direction, cars: r.cars, hex: r.hex, cancelled: r.cancelled,
  };
}
