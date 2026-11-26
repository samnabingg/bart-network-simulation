import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { describeTrain } from './core/describe';
import { DepartureRow, StationInfo } from './core/models';
import { SimulationService } from './core/simulation.service';
import { minutesLeft } from './core/train-positions';
import { NetworkMapComponent } from './map/network-map.component';
import { ModeBarComponent } from './panel/mode-bar.component';
import { StationPanelComponent } from './panel/station-panel.component';
import { StationSearchComponent } from './panel/station-search.component';
import { SceneExit, SceneFeed, StationSceneComponent } from './scene/station-scene.component';
import type { StationScene } from './scene/three/scene-api';

const DEFAULT_STATION = 'BAYF';

type Positioned = StationInfo & { lat: number; lon: number };

@Component({
  selector: 'app-root',
  imports: [NetworkMapComponent, ModeBarComponent, StationPanelComponent, StationSearchComponent, StationSceneComponent],
  templateUrl: './app.html',
})
export class App {
  protected readonly sim = inject(SimulationService);

  private readonly params = new URLSearchParams(location.search);
  protected readonly debug = this.params.has('debug');

  protected readonly selected = signal<string | null>(null);
  protected readonly sceneAbbr = signal<string | null>(null);
  protected readonly sceneBalance = signal<number | undefined>(undefined);
  protected readonly sceneSpawn = signal<'platform' | undefined>(undefined);
  protected readonly sceneTrip = signal<string | null>(null);
  protected readonly pickedTrain = signal<string | null>(null);

  private readonly sceneView = viewChild(StationSceneComponent);

  protected readonly stations = computed<Positioned[]>(() =>
    (this.sim.network()?.stations ?? []).filter((s): s is Positioned => s.lat != null && s.lon != null),
  );
  private readonly byAbbr = computed(() => new Map(this.stations().map((s) => [s.abbr, s])));
  protected readonly selectedStation = computed(() => this.byAbbr().get(this.selected() ?? '') ?? null);
  protected readonly sceneStation = computed(() => this.byAbbr().get(this.sceneAbbr() ?? '') ?? null);
  protected readonly entrances = computed(() => this.sim.geo()?.entrances[this.selected() ?? ''] ?? []);

  protected readonly board = this.sim.board(this.selected);
  private readonly sceneBoard = this.sim.board(this.sceneAbbr);

  /** Re-feed the 3D station every 15 s (every 3 s when the demo runs fast), or when its board changes. */
  private readonly feedTick = computed(() => {
    const fast = this.sim.mode() === 'demo' && this.sim.speed() > 1;
    return Math.floor(this.sim.slowFrame() / (fast ? 6 : 30));
  });

  protected readonly sceneFeed = computed<SceneFeed>(() => {
    this.feedTick();
    const b = this.sceneBoard();
    if (!b.data) return { rows: null, note: this.sim.sourceNote() };
    // Live rows are as old as the last poll; age them so the 3D trains keep to the clock.
    const age = b.data.source === 'live' ? (Date.now() - b.receivedAt) / 1000 : 0;
    const rows: DepartureRow[] = b.data.rows.map((r) => ({ ...r, minutes: minutesLeft(r.minutes, age) }));
    return { rows, note: untracked(() => this.sim.sourceNote()) };
  });

  protected readonly trainInfo = computed(() => {
    const id = this.pickedTrain();
    if (!id) return '';
    const t = this.sim.trains().find((tr) => tr.id === id);
    return t ? describeTrain(this.sim.network(), t) : 'That train has left the map.';
  });

  protected readonly mapStatus = computed(() => {
    const err = this.sim.loadError();
    if (err) return { text: `Could not load the network: ${err}`, error: true };
    const n = this.stations().length;
    if (!this.sim.network()) return { text: 'Loading stations…', error: false };
    if (!this.sim.geo()) return { text: 'Track lines not loaded, so trains run in straight lines.', error: true };
    return { text: `${n} stations. Click a station for departures, or a train to see where it's going.`, error: false };
  });

  private debugApplied = false;

  constructor() {
    this.sim.load();

    // First load: open the default station (or ?station= in debug mode) in the panel and in 3D.
    effect(() => {
      const map = this.byAbbr();
      if (!map.size || untracked(this.selected)) return;
      const wanted = this.debug ? this.params.get('station') : null;
      const start = wanted && map.has(wanted) ? wanted : DEFAULT_STATION;
      untracked(() => {
        this.selected.set(start);
        this.sceneAbbr.set(start);
      });
    });

    if (this.debug) {
      (window as unknown as Record<string, unknown>)['sim'] = {
        loadScene: (abbr: string) => this.openScene(abbr),
        selectStation: (abbr: string) => this.selected.set(abbr),
        setSpeed: (v: number) => this.sim.setSpeed(v),
        currentTrains: () => this.sim.trains(),
      };
    }
  }

  protected select(abbr: string): void {
    this.selected.set(abbr);
  }

  protected walk(abbr: string): void {
    this.openScene(abbr);
    queueMicrotask(() => this.sceneView()?.focus());
  }

  protected exitTrain(e: SceneExit): void {
    this.sceneSpawn.set('platform');
    this.sceneBalance.set(e.balance);
    this.sceneTrip.set(e.tripFrom);
    this.sceneAbbr.set(e.next);
    this.selected.set(e.next);
  }

  protected sceneReady(scene: StationScene): void {
    if (!this.debug) return;
    (window as unknown as Record<string, unknown>)['scene3d'] = scene;
    (window as unknown as Record<string, unknown>)['bayfair'] = scene;
    if (this.debugApplied) return;
    this.debugApplied = true;
    // ?debug&station=MONT&spot=platform-train&park=South&yaw=-1.2 (for screenshots)
    const spot = this.params.get('spot');
    if (spot) scene.teleport(spot);
    if (this.params.has('yaw')) scene._look?.(Number(this.params.get('yaw')), Number(this.params.get('pitch') || -0.05));
    if (this.params.has('park')) scene._park?.(this.params.get('park') || 'South');
  }

  private openScene(abbr: string): void {
    this.sceneSpawn.set(undefined);
    this.sceneBalance.set(undefined);
    this.sceneTrip.set(null);
    this.sceneAbbr.set(abbr);
  }
}
