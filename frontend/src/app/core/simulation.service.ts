import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  EMPTY, Observable, catchError, combineLatest, distinctUntilChanged, map, of, startWith, switchMap, timer,
} from 'rxjs';
import { NetworkApi } from './network-api.service';
import { DataMode, Departures, LineDef, LiveStatus, LiveTrainsResponse, MapTrain, NetworkResponse, GeoDocument } from './models';
import { advanceLiveTrains, demoTrains } from './train-positions';

const STATUS_POLL_MS = 30_000;
const LIVE_TRAINS_POLL_MS = 10_000;
const BOARD_POLL_MS = 15_000;
const FAST_DEMO_BOARD_POLL_MS = 1_000;

export interface BoardState {
  data: Departures | null;
  error: string | null;
  /** client time (ms) the board arrived, used to count live minutes down */
  receivedAt: number;
}

interface LiveTrainsState {
  data: LiveTrainsResponse;
  receivedPerf: number;
}

/**
 * The simulation's state: network data, the Live/Demo switch, the demo clock, and the trains to
 * draw. Polling is RxJS (timer + switchMap, so a slow response is dropped when a newer request
 * starts); the UI reads signals.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly api = inject(NetworkApi);

  readonly network = signal<NetworkResponse | null>(null);
  readonly geo = signal<GeoDocument | null>(null);
  readonly loadError = signal<string | null>(null);

  /**
   * What the user picked. Starts on Live: if the server turns out to have no API key it drops to
   * Demo. While Live is picked nothing simulated is shown, only real data or an honest "no data".
   */
  readonly mode = signal<DataMode>('live');
  readonly speed = signal(1);

  /** Ticks about 10 times a second: drives train positions. */
  readonly frame = signal(0);
  /** Ticks twice a second: drives the clock and countdowns. */
  readonly slowFrame = signal(0);

  private demoClock = { base: Date.now() / 1000, perf: performance.now() };
  private userPickedMode = false;
  private modeDecided = false;

  readonly liveStatus: Signal<LiveStatus | null> = toSignal(
    timer(0, STATUS_POLL_MS).pipe(switchMap(() => this.api.liveStatus().pipe(catchError(() => of(null))))),
    { initialValue: null },
  );

  private readonly liveTrainsState = signal<LiveTrainsState | null>(null);
  readonly liveError = signal<string | null>(null);

  readonly hasKey = computed(() => !!this.liveStatus()?.configured);
  readonly usingLive = computed(
    () => this.mode() === 'live' && !!this.liveStatus()?.available && !!this.liveTrainsState(),
  );
  /** Live picked, still waiting for the first data, and nothing has gone wrong yet. */
  readonly liveLoading = computed(
    () => this.mode() === 'live' && !this.usingLive() && !this.liveError() && !this.liveStatus()?.error && !this.loadError(),
  );

  readonly lines = computed<LineDef[]>(() => this.network()?.lines ?? []);

  readonly trains = computed<MapTrain[]>(() => {
    this.frame();
    const net = this.network();
    if (!net) return [];
    const live = this.liveTrainsState();
    if (this.mode() === 'live') {
      // Live picked: real trains or none at all, never the demo timetable.
      return this.usingLive() && live ? advanceLiveTrains(live.data.trains, (performance.now() - live.receivedPerf) / 1000) : [];
    }
    return demoTrains(net, this.simNow());
  });

  readonly sourceNote = computed(() => {
    const status = this.liveStatus();
    if (this.usingLive()) {
      const at = status?.fetchedAt ? new Date(status.fetchedAt) : null;
      return `Live BART estimates${at ? `, updated ${at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;
    }
    if (this.liveLoading()) return 'Loading live BART data…';
    if (this.mode() === 'live') {
      const why = this.liveError() || status?.error || 'no response from the server';
      return `Live data unavailable (${why}). No trains shown; switch to Demo for the simulated timetable.`;
    }
    if (!this.hasKey()) return 'Demo timetable (no API key on the server, so no live data)';
    return 'Demo timetable (simulated, not real times)';
  });

  readonly liveProblem = computed(() => this.mode() === 'live' && !this.usingLive() && !this.liveLoading());

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Live trains are polled only while the user wants live data and the server has a key.
    const wantLive$ = combineLatest([toObservable(this.mode), toObservable(this.hasKey)]).pipe(
      map(([mode, key]) => mode === 'live' && key),
      distinctUntilChanged(),
    );
    const sub = wantLive$
      .pipe(
        switchMap((want) =>
          want
            ? timer(0, LIVE_TRAINS_POLL_MS).pipe(
                switchMap(() =>
                  this.api.liveTrains().pipe(
                    map((data) => ({ data, error: null as string | null })),
                    catchError((err: Error) => of({ data: null, error: err.message })),
                  ),
                ),
              )
            : of({ data: null, error: null }),
        ),
      )
      .subscribe(({ data, error }) => {
        this.liveTrainsState.set(data ? { data, receivedPerf: performance.now() } : null);
        this.liveError.set(error);
      });

    // Start on Live; the first answer from the server decides, unless the user already chose:
    // no API key means there is no live data, so drop to the demo timetable.
    const statusSub = toObservable(this.liveStatus).subscribe((s) => {
      if (!s || this.modeDecided || this.userPickedMode) return;
      this.modeDecided = true;
      if (!s.configured) {
        this.demoClock = { base: Date.now() / 1000, perf: performance.now() };
        this.mode.set('demo');
      }
    });

    let raf = 0;
    let lastFrame = 0;
    let lastSlow = 0;
    const tick = (ms: number) => {
      if (ms - lastFrame > 100) { lastFrame = ms; this.frame.update((n) => n + 1); }
      if (ms - lastSlow > 500) { lastSlow = ms; this.slowFrame.update((n) => n + 1); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    destroyRef.onDestroy(() => {
      sub.unsubscribe();
      statusSub.unsubscribe();
      cancelAnimationFrame(raf);
    });
  }

  load(): void {
    this.api.network().subscribe({
      next: (n) => this.network.set(n),
      error: (e: Error) => this.loadError.set(e.message),
    });
    this.api.geo().subscribe({ next: (g) => this.geo.set(g), error: () => this.geo.set(null) });
  }

  /** Simulated time in epoch seconds: real time in live mode, the speed-adjustable demo clock otherwise. */
  simNow(): number {
    if (this.mode() === 'live') return Date.now() / 1000;
    return this.demoClock.base + ((performance.now() - this.demoClock.perf) / 1000) * this.speed();
  }

  setSpeed(v: number): void {
    this.demoClock = { base: this.simNow(), perf: performance.now() };
    this.speed.set(v);
  }

  setMode(mode: DataMode): void {
    this.userPickedMode = true;
    if (mode === this.mode()) return;
    if (mode === 'demo') this.demoClock = { base: Date.now() / 1000, perf: performance.now() };
    this.mode.set(mode);
  }

  /**
   * A station's departure board that follows the selected station, the data source and the demo
   * speed. Must be called in an injection context (a component field initializer). With Live
   * picked it always asks for live departures: an outage shows as an error, not as demo rows.
   * A new station or source cancels the request in flight, so a stale board never wins.
   */
  board(abbr: Signal<string | null>): Signal<BoardState> {
    const empty: BoardState = { data: null, error: null, receivedAt: 0 };
    const source$ = combineLatest([
      toObservable(abbr),
      toObservable(computed(() => this.mode() === 'live')),
      toObservable(this.speed),
    ]).pipe(distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2]));

    const board$: Observable<BoardState> = source$.pipe(
      switchMap(([station, live, speed]) => {
        if (!station) return of(empty);
        const every = !live && speed > 1 ? FAST_DEMO_BOARD_POLL_MS : BOARD_POLL_MS;
        return timer(0, every).pipe(
          switchMap(() =>
            this.api.departures(station, live ? 'live' : 'demo', live ? undefined : this.simNow()).pipe(
              map((data): BoardState => ({ data, error: null, receivedAt: Date.now() })),
              catchError((err: Error) => of<BoardState>({ data: null, error: err.message, receivedAt: Date.now() })),
            ),
          ),
          startWith(empty),
        );
      }),
      catchError(() => EMPTY),
    );
    return toSignal(board$, { initialValue: empty });
  }
}
