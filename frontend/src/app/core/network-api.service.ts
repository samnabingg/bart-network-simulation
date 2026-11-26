import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';
import type { OsmLayout } from '../scene/three/osm-layout.js';
import type { RideSegment, StationView } from '../scene/three/scene-api';
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

  /** A station's layout imported from OpenStreetMap; errors (404 when not imported) as for every call. */
  stationLayout(abbr: string): Observable<OsmLayout> {
    return this.http.get<OsmLayout>(`/api/stations/${encodeURIComponent(abbr)}/layout`).pipe(catchError(toError));
  }

  /**
   * For the train ride: tunnels, viaducts and ground-level track between neighbouring stations
   * (from OpenStreetMap), and how each station looks from the train. Fetched once.
   */
  rideProfile(): Observable<RideProfile> {
    return (this.rideProfile$ ??= this.http.get<RideProfile>('/api/stations/ride-profile').pipe(
      catchError((err: HttpErrorResponse) => {
        this.rideProfile$ = undefined; // ask again next time
        return toError(err);
      }),
      shareReplay(1),
    ));
  }
  private rideProfile$?: Observable<RideProfile>;

  /** @param simTime demo only: the simulated time (epoch seconds) the board is for */
  departures(abbr: string, source: DataMode, simTime?: number): Observable<Departures> {
    let params = new HttpParams().set('source', source);
    if (source === 'demo' && simTime != null) params = params.set('t', simTime.toFixed(1));
    return this.http
      .get<Departures>(`/api/stations/${encodeURIComponent(abbr)}/departures`, { params })
      .pipe(catchError(toError));
  }
}

export interface RideProfile {
  source: { attribution: string } | null;
  /** keyed "ABBR>ABBR" like the network's track paths */
  legs: Record<string, RideSegment[]>;
  stations: Record<string, StationView>;
}

/** ProblemDetail's "detail", or a readable fallback. */
export function toError(err: HttpErrorResponse): Observable<never> {
  const detail = (err.error && typeof err.error === 'object' && (err.error.detail || err.error.title)) || '';
  const msg = detail || (err.status === 0 ? 'The server is not reachable' : `Request failed (${err.status})`);
  return throwError(() => new Error(msg));
}
