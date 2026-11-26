import { Component, computed, inject } from '@angular/core';
import { SimulationService } from '../core/simulation.service';
import { DataMode } from '../core/models';

/** Live / Demo switch, demo speed, the simulation clock and the train count. */
@Component({
  selector: 'app-mode-bar',
  template: `
    <div class="sim-bar">
      <div class="seg" role="group" aria-label="Train data source">
        <button type="button" [attr.aria-pressed]="sim.mode() === 'live'" [disabled]="!sim.hasKey()" (click)="set('live')"
          [title]="sim.hasKey() ? 'BART real-time estimates' : 'Needs a BART API key on the server'">Live</button>
        <button type="button" [attr.aria-pressed]="sim.mode() === 'demo'" (click)="set('demo')">Demo</button>
      </div>
      <label [class.dim]="sim.mode() === 'live'">Demo speed
        <select [value]="sim.speed()" [disabled]="sim.mode() === 'live'" (change)="speed($event)">
          <option value="1">1×</option>
          <option value="10">10×</option>
          <option value="60">60×</option>
        </select>
      </label>
      <span class="clock-pill"><span class="sim-clock">{{ clock() }}</span> · {{ sim.trains().length }} trains</span>
    </div>
    <p class="status" [class.error]="sim.liveProblem()" aria-live="polite">{{ sim.sourceNote() }}</p>
    <ul class="legend" aria-label="Lines">
      @for (l of sim.lines(); track l.id) {
        <li><span [style.background]="l.hex"></span>{{ l.name }}{{ l.id === 'beige' ? ' (airport)' : '' }}</li>
      }
    </ul>
  `,
})
export class ModeBarComponent {
  protected readonly sim = inject(SimulationService);

  protected readonly clock = computed(() => {
    this.sim.slowFrame();
    const showSeconds = this.sim.mode() === 'live' || this.sim.speed() === 1;
    return new Date(this.sim.simNow() * 1000).toLocaleTimeString([], {
      hour: 'numeric', minute: '2-digit', second: showSeconds ? '2-digit' : undefined,
    });
  });

  set(mode: DataMode): void {
    this.sim.setMode(mode);
  }

  speed(event: Event): void {
    this.sim.setSpeed(Number((event.target as HTMLSelectElement).value));
  }
}
