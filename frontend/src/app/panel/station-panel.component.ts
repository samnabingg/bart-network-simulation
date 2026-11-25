import { Component, computed, input, output } from '@angular/core';
import { BoardState } from '../core/simulation.service';
import { Entrance, LineDef, StationInfo } from '../core/models';
import { minutesLeft } from '../core/train-positions';

const KIND_LABEL: Record<string, string> = { underground: 'Underground', elevated: 'Elevated', surface: 'Ground level' };

/** The selected station: details, the walk-through button, departures and entrances. */
@Component({
  selector: 'app-station-panel',
  template: `
    <h2 id="stationName" class="station-title">{{ station()?.name ?? 'Select a station' }}</h2>
    @if (station(); as s) {
      <div class="station-meta">
        @if (address()) { {{ address() }}<br /> }
        {{ kindLabel() }}
        @for (l of stationLines(); track l.id) {
          <span class="line-chip" [style.background]="l.hex" [title]="l.name + ' line'"></span>
        }
      </div>
      <button type="button" class="walk" [disabled]="inScene()" (click)="walk.emit(s.abbr)">
        {{ inScene() ? "You're in " + s.name + ' (below)' : 'Walk through ' + s.name + ' in 3D' }}
      </button>
    }
    <ul class="departures">
      @for (r of rows(); track $index) {
        <li [class.cancelled]="r.cancelled">
          <span class="chip" [style.background]="r.hex" [title]="r.color ?? ''"></span>
          <span class="dest">{{ r.destination }}</span>
          <span class="time">{{ r.label }}</span>
          <span class="meta">{{ r.meta }}</span>
        </li>
      }
    </ul>
    <p class="status" [class.error]="!!board().error || problem()" aria-live="polite">{{ statusText() }}</p>
    @if (entrances().length) {
      <h3 class="entrances-heading">Entrances and exits (yellow dots on the map)</h3>
      <ul class="entrances">
        @for (e of entrances(); track e.name) { <li>{{ e.name }}</li> }
      </ul>
    }
  `,
})
export class StationPanelComponent {
  readonly station = input<StationInfo | null>(null);
  readonly lines = input<LineDef[]>([]);
  readonly board = input<BoardState>({ data: null, error: null, receivedAt: 0 });
  readonly entrances = input<Entrance[]>([]);
  readonly sourceNote = input('');
  readonly problem = input(false);
  readonly inScene = input(false);
  /** Changes twice a second, so live countdowns stay current. */
  readonly tick = input(0);

  readonly walk = output<string>();

  readonly stationLines = computed(() => {
    const abbr = this.station()?.abbr;
    return abbr ? this.lines().filter((l) => l.stops.includes(abbr)) : [];
  });

  readonly address = computed(() => [this.station()?.address, this.station()?.city].filter(Boolean).join(', '));

  readonly kindLabel = computed(() => {
    const s = this.station();
    if (!s) return '';
    return `${KIND_LABEL[s.kind] ?? s.kind} station, ${s.platform} platform${s.platform === 'side' ? 's' : ''} (approximate) ·`;
  });

  readonly rows = computed(() => {
    this.tick();
    const b = this.board();
    const data = b.data;
    if (!data) return [];
    const age = data.source === 'live' ? (Date.now() - b.receivedAt) / 1000 : 0;
    return data.rows.slice(0, 10).map((r) => {
      const left = data.source === 'live' ? minutesLeft(r.minutes, age) : r.minutes;
      const bits: string[] = [];
      if (r.color) bits.push(`${capitalize(r.color)} line`);
      if (r.platform) bits.push(`Platform ${r.platform}`);
      if (r.cars) bits.push(`${r.cars} cars`);
      if (r.delaySec >= 60) bits.push(`${Math.round(r.delaySec / 60)} min late`);
      if (r.nextStop) bits.push(`next ${r.nextStop.name}`);
      return {
        ...r,
        label: r.cancelled ? 'Cancelled' : left == null ? '—' : left === 0 ? 'Leaving' : `${left} min`,
        meta: bits.join(' · '),
      };
    });
  });

  readonly statusText = computed(() => {
    const b = this.board();
    if (!this.station()) return '';
    if (b.error) return `Departures unavailable: ${b.error}`;
    if (!b.data) return 'Loading departures…';
    return b.data.rows.length ? this.sourceNote() : `No departures listed right now. ${this.sourceNote()}`;
  });
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
