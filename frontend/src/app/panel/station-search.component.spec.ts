import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StationSearchComponent } from './station-search.component';

describe('StationSearchComponent', () => {
  let fixture: ComponentFixture<StationSearchComponent>;
  let picked: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    fixture = TestBed.createComponent(StationSearchComponent);
    fixture.componentRef.setInput('stations', [
      { abbr: 'BAYF', name: 'Bay Fair' },
      { abbr: 'MONT', name: 'Montgomery St.' },
    ]);
    picked = [];
    fixture.componentInstance.pick.subscribe((a) => picked.push(a));
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  function type(text: string): void {
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
  }

  it('picks a station when the name matches exactly, ignoring case', () => {
    type('bay fair');
    expect(picked).toEqual(['BAYF']);
  });

  it('accepts a station code', () => {
    type('mont');
    expect(picked).toEqual(['MONT']);
  });

  it('waits for the typing to settle and does not pick on a partial name', () => {
    type('Bay');
    expect(picked).toEqual([]);
  });

  it('flags text that matches no station', () => {
    type('Gotham');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.field-help').textContent).toContain('No station matches');
  });

  it('shows the station picked elsewhere without emitting again', () => {
    fixture.componentRef.setInput('selectedName', 'Montgomery St.');
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    expect(fixture.componentInstance.query.value).toBe('Montgomery St.');
    expect(picked).toEqual([]);
  });
});
