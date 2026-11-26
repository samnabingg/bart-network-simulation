import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { DataMode, Departures, Fare, GeoDocument, LiveStatus, LiveTrainsResponse, NetworkResponse } from './models';

/** Typed access to the Spring Boot API. Errors come back as Error with the server's problem detail. */
@Injectable({ providedIn: 'root' })
export class NetworkApi {
  private readonly http = inject(HttpClient);

  network(): Observable<NetworkResponse> {
    return this.http.get<NetworkResponse>('/api/network').pipe(catchError(toError));
  }

  geo(): Observable<GeoDocument> {
    return this.http.get<GeoDocument>('/api/geo').pipe(catchError(toError));
  }

  liveStatus(): Observable<LiveStatus> {
    return this.http.get<LiveStatus>('/api/live/status').pipe(catchError(toError));
  }

  liveTrains(): Observable<LiveTrainsResponse> {
    return this.http.get<LiveTrainsResponse>('/api/live/trains').pipe(catchError(toError));
  }

  /** Today's real Clipper fare between two stations, from BART. */
  fare(orig: string, dest: string): Observable<Fare> {
    const params = new HttpParams().set('orig', orig).set('dest', dest);
    return this.http.get<Fare>('/api/fares', { params }).pipe(catchError(toError));
  }

  /** @param simTime demo only: the simulated time (epoch seconds) the board is for */
  departures(abbr: string, source: DataMode, simTime?: number): Observable<Departures> {
    let params = new HttpParams().set('source', source);
    if (source === 'demo' && simTime != null) params = params.set('t', simTime.toFixed(1));
    return this.http
      .get<Departures>(`/api/stations/${encodeURIComponent(abbr)}/departures`, { params })
      .pipe(catchError(toError));
  }
}

/** ProblemDetail's "detail", or a readable fallback. */
export function toError(err: HttpErrorResponse): Observable<never> {
  const detail = (err.error && typeof err.error === 'object' && (err.error.detail || err.error.title)) || '';
  const msg = detail || (err.status === 0 ? 'The server is not reachable' : `Request failed (${err.status})`);
  return throwError(() => new Error(msg));
}
