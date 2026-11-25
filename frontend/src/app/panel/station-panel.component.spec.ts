import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StationPanelComponent } from './station-panel.component';
import { DepartureRow, Departures, StationInfo } from '../core/models';

const bayFair: StationInfo = {
  abbr: 'BAYF', name: 'Bay Fair', kind: 'elevated', platform: 'island', lat: 37.7, lon: -122.1,
  address: '15242 Hesperian Blvd', city: 'San Leandro',
};

function row(over: Partial<DepartureRow>): DepartureRow {
  return {
    destination: 'Daly City', destAbbr: 'DALY', minutes: 5, timeLabel: '5 min', platform: '2', direction: 'North',
    cars: '9', color: 'BLUE', hex: '#0099cc', delaySec: 0, cancelled: false, line: 'blue',
    nextStop: { abbr: 'SANL', name: 'San Leandro', line: 'blue', dir: 0 },
    ...over,
  };
}

function board(source: 'live' | 'demo', rows: DepartureRow[]): Departures {
  return { station: 'BAYF', stationName: 'Bay Fair', source, fetchedAt: null, simTime: null, rows };
}

describe('StationPanelComponent', () => {
  let fixture: ComponentFixture<StationPanelComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    fixture = TestBed.createComponent(StationPanelComponent);
    el = fixture.nativeElement;
    fixture.componentRef.setInput('station', bayFair);
    fixture.componentRef.setInput('sourceNote', 'Demo timetable');
  });

  it('shows departures with line, platform, cars, delay and next stop', async () => {
    fixture.componentRef.setInput('board', {
      data: board('demo', [row({ delaySec: 180 })]), error: null, receivedAt: Date.now(),
    });
    await fixture.whenStable();
    expect(el.querySelector('.dest')?.textContent).toBe('Daly City');
    expect(el.querySelector('.time')?.textContent).toBe('5 min');
    expect(el.querySelector('.meta')?.textContent).toBe('Blue line · Platform 2 · 9 cars · 3 min late · next San Leandro');
    expect(el.querySelector('.station-meta')?.textContent).toContain('15242 Hesperian Blvd, San Leandro');
  });

  it('counts live minutes down from when the board arrived', async () => {
    fixture.componentRef.setInput('board', {
      data: board('live', [row({ minutes: 5 })]), error: null, receivedAt: Date.now() - 3 * 60_000,
    });
    await fixture.whenStable();
    expect(el.querySelector('.time')?.textContent).toBe('2 min');
  });

  it('marks cancelled trains and Leaving', async () => {
    fixture.componentRef.setInput('board', {
      data: board('demo', [row({ minutes: 0 }), row({ cancelled: true, destination: 'Richmond' })]),
      error: null, receivedAt: Date.now(),
    });
    await fixture.whenStable();
    const times = Array.from(el.querySelectorAll('.time')).map((n) => n.textContent);
    expect(times).toEqual(['Leaving', 'Cancelled']);
    expect(el.querySelector('li.cancelled .dest')?.textContent).toBe('Richmond');
  });

  it('explains an error from the server', async () => {
    fixture.componentRef.setInput('board', { data: null, error: 'Live data unavailable', receivedAt: 0 });
    await fixture.whenStable();
    expect(el.querySelector('.status')?.textContent).toContain('Departures unavailable: Live data unavailable');
    expect(el.querySelector('.status')?.classList).toContain('error');
  });

  it('disables the walk button for the station already open in 3D, and emits otherwise', async () => {
    const walked: string[] = [];
    fixture.componentInstance.walk.subscribe((a) => walked.push(a));
    fixture.componentRef.setInput('inScene', true);
    await fixture.whenStable();
    const btn = el.querySelector<HTMLButtonElement>('.walk')!;
    expect(btn.disabled).toBe(true);

    fixture.componentRef.setInput('inScene', false);
    await fixture.whenStable();
    btn.click();
    expect(walked).toEqual(['BAYF']);
  });
});
