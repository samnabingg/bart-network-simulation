import { Component, DestroyRef, effect, inject, input, output, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, map } from 'rxjs';

export interface SearchableStation {
  abbr: string;
  name: string;
}

/** Type a station name or code; picks the station as soon as the text matches one exactly. */
@Component({
  selector: 'app-station-search',
  imports: [ReactiveFormsModule],
  template: `
    <label for="stationInput">Search or pick a station</label>
    <input
      id="stationInput"
      type="text"
      list="stationList"
      placeholder="Start typing a station name"
      autocomplete="off"
      [formControl]="query"
      [attr.aria-invalid]="showNoMatch() ? 'true' : null"
      aria-describedby="stationSearchHelp"
    />
    <datalist id="stationList">
      @for (s of stations(); track s.abbr) {
        <option [value]="s.name"></option>
      }
    </datalist>
    <p id="stationSearchHelp" class="field-help" [class.error]="showNoMatch()" aria-live="polite">
      {{ showNoMatch() ? 'No station matches that name or code.' : '' }}
    </p>
  `,
})
export class StationSearchComponent {
  readonly stations = input<SearchableStation[]>([]);
  /** The selected station's name, shown in the box when picked elsewhere (on the map). */
  readonly selectedName = input<string | null>(null);
  readonly pick = output<string>();

  readonly query = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(60)] });

  constructor() {
    this.query.valueChanges
      .pipe(
        debounceTime(150),
        map((v) => this.match(v)),
        filter((s): s is SearchableStation => !!s),
        map((s) => s.abbr),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((abbr) => this.pick.emit(abbr));

    effect(() => {
      const name = this.selectedName();
      untracked(() => {
        if (name && this.query.value !== name) this.query.setValue(name, { emitEvent: false });
      });
    });
  }

  showNoMatch(): boolean {
    const v = this.query.value.trim();
    return v.length >= 3 && this.query.dirty && !this.stations().some((s) => s.name.toLowerCase().startsWith(v.toLowerCase()) || s.abbr.toLowerCase() === v.toLowerCase());
  }

  private match(value: string): SearchableStation | undefined {
    const q = value.trim().toLowerCase();
    if (!q) return undefined;
    return this.stations().find((s) => s.name.toLowerCase() === q || s.abbr.toLowerCase() === q);
  }
}
