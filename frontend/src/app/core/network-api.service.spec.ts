import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { NetworkApi } from './network-api.service';
import { correlationIdInterceptor } from './correlation-id.interceptor';

describe('NetworkApi', () => {
  let api: NetworkApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([correlationIdInterceptor])), provideHttpClientTesting()],
    });
    api = TestBed.inject(NetworkApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for a demo board at the simulated time', async () => {
    const result = firstValueFrom(api.departures('BAYF', 'demo', 1_800_000_000.25));
    const req = http.expectOne((r) => r.url === '/api/stations/BAYF/departures');
    expect(req.request.params.get('source')).toBe('demo');
    expect(req.request.params.get('t')).toBe('1800000000.3');
    req.flush({ station: 'BAYF', rows: [] });
    expect((await result).station).toBe('BAYF');
  });

  it('does not send a time for live boards', () => {
    api.departures('BAYF', 'live', 123).subscribe();
    const req = http.expectOne((r) => r.url === '/api/stations/BAYF/departures');
    expect(req.request.params.get('source')).toBe('live');
    expect(req.request.params.has('t')).toBe(false);
    req.flush({});
  });

  it('turns a problem detail into a readable error', async () => {
    const result = firstValueFrom(api.liveTrains());
    http.expectOne('/api/live/trains').flush(
      { title: 'Live data unavailable', status: 503, detail: 'BART_API_KEY is not set on the server' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await expect(result).rejects.toThrow('BART_API_KEY is not set on the server');
  });

  it('reports an unreachable server', async () => {
    const result = firstValueFrom(api.network());
    http.expectOne('/api/network').error(new ProgressEvent('error'), { status: 0 });
    await expect(result).rejects.toThrow('The server is not reachable');
  });

  it('tags API calls with a correlation id', () => {
    api.liveStatus().subscribe();
    const req = http.expectOne('/api/live/status');
    expect(req.request.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
    req.flush({});
  });
});
