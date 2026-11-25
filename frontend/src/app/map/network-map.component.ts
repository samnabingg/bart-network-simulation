import {
  AfterViewInit, Component, ElementRef, OnDestroy, effect, input, output, untracked, viewChild,
} from '@angular/core';
import * as L from 'leaflet';
import { describeTrain } from '../core/describe';
import { GeoDocument, LineDef, MapTrain, NetworkResponse, StationInfo } from '../core/models';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LINE_SLOT: Record<string, number> = { yellow: -2, red: -1, orange: 0, green: 1, blue: 2, beige: 0 };
const PAD_PX = 60;

interface XY { x: number; y: number }
interface Segment { pts: XY[]; cum: number[]; total: number }
type PositionedStation = StationInfo & { lat: number; lon: number };

/**
 * The network drawn as one SVG on top of a Leaflet street map. The SVG sits in Leaflet's
 * layer-pixel space at the current zoom, so every station lands on its real spot; it is redrawn
 * after each zoom. Drawing is imperative on purpose: trains move ten times a second.
 */
@Component({
  selector: 'app-network-map',
  template: `<div #map class="map" aria-label="Street map of the BART network. Scroll or pinch to zoom, drag to pan."></div>`,
  styles: [`:host { display: block; } .map { height: 560px; margin-top: 12px; border-radius: 12px; overflow: hidden; border: 1px solid var(--line); background: #eef3f6; z-index: 0; } @media (max-width: 800px) { .map { height: 460px; } }`],
})
export class NetworkMapComponent implements AfterViewInit, OnDestroy {
  readonly network = input<NetworkResponse | null>(null);
  readonly geo = input<GeoDocument | null>(null);
  readonly stations = input<PositionedStation[]>([]);
  readonly selected = input<string | null>(null);
  readonly trains = input<MapTrain[]>([]);
  readonly pickedTrain = input<string | null>(null);

  readonly stationSelect = output<string>();
  readonly trainPick = output<string>();

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('map');

  private map: L.Map | null = null;
  private svg: SVGSVGElement | null = null;
  private zoom = 10;
  private slotPx = 1.7;
  private toXY: ((lon: number, lat: number) => XY) | null = null;
  private readonly segCache = new Map<string, Segment>();
  private readonly xy = new Map<string, XY>();
  private fitted = false;

  constructor() {
    // Redraw everything when the data changes; move trains when they change.
    effect(() => {
      this.network();
      this.geo();
      this.stations();
      untracked(() => this.redraw());
    });
    effect(() => {
      const abbr = this.selected();
      untracked(() => this.showSelection(abbr));
    });
    effect(() => {
      const list = this.trains();
      const picked = this.pickedTrain();
      untracked(() => this.renderTrains(list, picked));
    });
  }

  ngAfterViewInit(): void {
    const map = L.map(this.host().nativeElement, { zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 9, maxZoom: 17 });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.createPane('network').style.zIndex = '450';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'network-svg');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', 'Network map: rings are stations, colored dots are trains');
    map.getPane('network')!.append(svg);
    map.on('zoomstart', () => { svg.style.visibility = 'hidden'; });
    map.on('zoomend', () => { this.redraw(); svg.style.visibility = ''; });
    svg.addEventListener('click', (e) => {
      const id = (e.target as Element).closest<SVGElement>('[data-train]')?.dataset['train'];
      if (id) this.trainPick.emit(id);
    });
    map.setView([37.8, -122.2], 10);
    this.map = map;
    this.svg = svg;
    this.redraw();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private get growFactor(): number {
    return Math.max(1, 1 + (this.zoom - 10) * 0.18);
  }

  private redraw(): void {
    const map = this.map;
    const svg = this.svg;
    const net = this.network();
    const stations = this.stations();
    if (!map || !svg || !net || !stations.length) return;

    const geo = this.geo();
    if (!this.fitted) {
      const pts: L.LatLngExpression[] = [
        ...stations.map((s) => [s.lat, s.lon] as L.LatLngTuple),
        ...(geo ? geo.track.flat().map(([lon, lat]) => [lat, lon] as L.LatLngTuple) : []),
      ];
      map.fitBounds(L.latLngBounds(pts), { padding: [12, 12] });
      this.fitted = true;
    }

    svg.replaceChildren();
    this.segCache.clear();
    this.zoom = map.getZoom();
    const grow = this.growFactor;
    this.slotPx = 1.7 * grow;
    svg.style.setProperty('--grow', String(grow));
    const trackPoints = geo ? geo.track.flat() : [];
    this.toXY = this.makeProjector([...stations.map((s) => [s.lon, s.lat] as [number, number]), ...trackPoints]);
    const toXY = this.toXY;

    if (geo) {
      const g = svgEl('g', { class: 'track', 'aria-hidden': 'true' });
      for (const line of geo.track) {
        g.append(svgEl('path', { d: pathD(line.map(([lon, lat]) => toXY(lon, lat))) }));
      }
      svg.append(g);
    }

    // Colored service lines along the real track, side by side where they share it. A dark
    // casing underneath keeps the pale lines (Yellow, Beige) readable on the street map.
    const casing = svgEl('g', { class: 'route-casing', 'aria-hidden': 'true' });
    const routes = svgEl('g', { class: 'routes', 'aria-hidden': 'true' });
    for (const line of net.lines) {
      let d = '';
      for (let i = 1; i < line.stops.length; i++) d += pathD(this.lineSegment(line, line.stops[i - 1], line.stops[i]).pts);
      casing.append(svgEl('path', { d }));
      routes.append(svgEl('path', { d, stroke: line.hex, class: `route route-${line.id}` }));
    }
    svg.append(casing, routes);

    this.xy.clear();
    for (const s of stations) {
      const { x, y } = toXY(s.lon, s.lat);
      this.xy.set(s.abbr, { x, y });
      const g = svgEl('g', { class: 'station', tabindex: '0', role: 'button', 'aria-label': s.name, 'data-abbr': s.abbr });
      g.append(svgEl('circle', { cx: x, cy: y, r: 3.6 * grow }));
      if (this.zoom >= 12) {
        const name = svgEl('text', { x: x + 8 * grow, y: y + 4, class: 'station-name' });
        name.textContent = s.name;
        g.append(name);
      }
      const title = svgEl('title');
      title.textContent = s.name;
      g.append(title);
      g.addEventListener('click', () => this.stationSelect.emit(s.abbr));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.stationSelect.emit(s.abbr); }
      });
      svg.append(g);
    }
    svg.append(svgEl('g', { class: 'entrance-marks', 'aria-hidden': 'true' }));
    svg.append(svgEl('g', { class: 'trains' }));
    svg.append(svgEl('text', { class: 'map-label' }));

    this.showSelection(this.selected());
    this.renderTrains(this.trains(), this.pickedTrain());
  }

  private makeProjector(lonLats: [number, number][]): (lon: number, lat: number) => XY {
    const map = this.map!;
    const svg = this.svg!;
    const pts = lonLats.map(([lon, lat]) => map.latLngToLayerPoint([lat, lon]));
    const minX = Math.min(...pts.map((p) => p.x)) - PAD_PX;
    const minY = Math.min(...pts.map((p) => p.y)) - PAD_PX;
    const w = Math.ceil(Math.max(...pts.map((p) => p.x)) + PAD_PX - minX);
    const h = Math.ceil(Math.max(...pts.map((p) => p.y)) + PAD_PX - minY);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    L.DomUtil.setPosition(svg as unknown as HTMLElement, L.point(minX, minY));
    return (lon, lat) => {
      const p = map.latLngToLayerPoint([lat, lon]);
      return { x: p.x - minX, y: p.y - minY };
    };
  }

  /**
   * Screen polyline for one line between two neighbouring stations, offset by the line's slot.
   * The offset is computed in one fixed orientation per stretch so every line agrees on "left".
   */
  private lineSegment(line: Pick<LineDef, 'id'>, a: string, b: string): Segment {
    const key = `${line.id}:${a}>${b}`;
    const cached = this.segCache.get(key);
    if (cached) return cached;
    const [p, q] = a < b ? [a, b] : [b, a];
    const path = this.network()?.paths[`${p}>${q}`];
    const toXY = this.toXY!;
    let pts = path ? path.pts.map(([lon, lat]) => toXY(lon, lat)) : [];
    pts = offsetPolyline(pts, (LINE_SLOT[line.id] ?? 0) * this.slotPx);
    if (a !== p) pts = [...pts].reverse();
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const seg = { pts, cum, total: cum[cum.length - 1] || 0 };
    this.segCache.set(key, seg);
    return seg;
  }

  private trainXY(t: MapTrain): XY | null {
    if (t.at) {
      const s = this.xy.get(t.at);
      if (!s) return null;
      const next = t.next || t.at;
      const seg = next !== t.at ? this.lineSegment({ id: t.line }, t.at, next) : null;
      return (seg && seg.pts[0]) || s;
    }
    return pointAlong(this.lineSegment({ id: t.line }, t.from, t.to), t.progress);
  }

  private renderTrains(list: MapTrain[], picked: string | null): void {
    const layer = this.svg?.querySelector('.trains');
    if (!layer || !this.toXY) return;
    const grow = this.growFactor;
    const seen = new Set<string>();
    const existing = new Map<string, SVGCircleElement>();
    for (const node of Array.from(layer.children) as SVGCircleElement[]) existing.set(node.dataset['train']!, node);
    for (const t of list) {
      const p = this.trainXY(t);
      if (!p) continue;
      seen.add(t.id);
      let node = existing.get(t.id);
      if (!node) {
        node = svgEl('circle', { r: 4.6 * grow, class: 'train', 'data-train': t.id, tabindex: '-1' }) as SVGCircleElement;
        node.append(svgEl('title'));
        layer.append(node);
      }
      node.setAttribute('cx', p.x.toFixed(1));
      node.setAttribute('cy', p.y.toFixed(1));
      node.setAttribute('fill', t.hex);
      node.classList.toggle('picked', picked === t.id);
      node.firstChild!.textContent = this.describe(t);
    }
    for (const [id, node] of existing) if (!seen.has(id)) node.remove();
  }

  private describe(t: MapTrain): string {
    return describeTrain(this.network(), t);
  }

  private showSelection(abbr: string | null): void {
    const svg = this.svg;
    if (!svg || !this.toXY) return;
    svg.querySelectorAll<SVGGElement>('.station').forEach((g) => g.classList.toggle('selected', g.dataset['abbr'] === abbr));
    const label = svg.querySelector('.map-label');
    const marks = svg.querySelector('.entrance-marks');
    marks?.replaceChildren();
    if (!abbr || !label) return;
    const s = this.stations().find((st) => st.abbr === abbr);
    const p = this.xy.get(abbr);
    if (!s || !p) return;

    const nearRightEdge = p.x > Number(svg.getAttribute('width')) * 0.6;
    label.textContent = s.name;
    label.setAttribute('x', String(nearRightEdge ? p.x - 12 : p.x + 12));
    label.setAttribute('y', String(p.y + 5));
    label.setAttribute('text-anchor', nearRightEdge ? 'end' : 'start');

    // Entrance dots are pushed out from the station when zoomed out, so they're visible.
    // From zoom 15 on they sit on their true spots.
    const k = Math.min(25, Math.max(1, 2 ** (15 - this.zoom)));
    for (const e of this.geo()?.entrances[abbr] ?? []) {
      const q = this.toXY(e.lon, e.lat);
      const dot = svgEl('circle', { cx: p.x + (q.x - p.x) * k, cy: p.y + (q.y - p.y) * k, r: 3 * this.growFactor });
      const title = svgEl('title');
      title.textContent = e.name;
      dot.append(title);
      marks?.append(dot);
    }
    if (this.map && !this.map.getBounds().pad(-0.1).contains([s.lat, s.lon])) this.map.panTo([s.lat, s.lon]);
  }
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pathD(pts: XY[]): string {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
}

/** Shifts a screen polyline sideways by d pixels, so lines sharing a track sit side by side. */
export function offsetPolyline(pts: XY[], d: number): XY[] {
  if (!d) return pts;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x - (dy / len) * d, y: p.y + (dx / len) * d };
  });
}

export function pointAlong(seg: Segment, u: number): XY | null {
  if (!seg.pts.length) return null;
  const target = Math.min(1, Math.max(0, u)) * seg.total;
  let i = 1;
  while (i < seg.cum.length - 1 && seg.cum[i] < target) i++;
  const span = seg.cum[i] - seg.cum[i - 1] || 1;
  const t = (target - seg.cum[i - 1]) / span;
  const A = seg.pts[i - 1];
  const B = seg.pts[i] || A;
  return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
}
