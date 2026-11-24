package com.transittwin.network;

import com.transittwin.geo.Geo;
import com.transittwin.geo.LonLat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.PriorityQueue;

/**
 * Turns the loose track polylines into a graph and finds the track path between every pair of
 * neighbouring stations. Falls back to a straight line where the track has a gap.
 */
public final class TrackPathfinder {

    /** Loose track ends are joined to the nearest point on another line within this distance. */
    static final double GAP_BRIDGE_M = 60;
    /** A station farther than this from any track is drawn with straight lines. */
    static final double MAX_SNAP_M = 400;

    private record Edge(int to, double w) {
    }

    private record Snap(int id, double d) {
    }

    private final List<LonLat> nodes = new ArrayList<>();
    private final Map<LonLat, Integer> index = new HashMap<>();
    private final List<List<Edge>> adj = new ArrayList<>();
    private final List<int[]> edges = new ArrayList<>();

    private TrackPathfinder() {
    }

    public static Map<String, TrackPath> buildPaths(List<List<LonLat>> track, Map<String, LonLat> coords,
                                                    Collection<LineDef> lines) {
        return new TrackPathfinder().build(track == null ? List.of() : track, coords, lines);
    }

    private Map<String, TrackPath> build(List<List<LonLat>> track, Map<String, LonLat> coords, Collection<LineDef> lines) {
        List<int[]> lineNodes = new ArrayList<>();
        for (List<LonLat> line : track) {
            int[] ids = line.stream().mapToInt(this::nodeOf).toArray();
            lineNodes.add(ids);
            for (int i = 1; i < ids.length; i++) {
                link(ids[i - 1], ids[i]);
            }
        }
        bridgeGaps(lineNodes);

        // The track is simplified, so long straight stretches have few points. Snapping looks at
        // the original segments only, not at the points added while snapping.
        for (int[] ids : lineNodes) {
            for (int i = 1; i < ids.length; i++) {
                edges.add(new int[] {ids[i - 1], ids[i]});
            }
        }

        Map<String, TrackPath> paths = new LinkedHashMap<>();
        Map<String, Snap> snapped = new HashMap<>();
        for (LineDef line : lines) {
            List<String> stops = line.stops();
            for (int i = 1; i < stops.size(); i++) {
                String a = stops.get(i - 1);
                String b = stops.get(i);
                String key = a + ">" + b;
                LonLat ca = coords.get(a);
                LonLat cb = coords.get(b);
                if (paths.containsKey(key) || ca == null || cb == null) {
                    continue;
                }
                double straight = Geo.meters(ca, cb);
                List<LonLat> pts = null;
                if (!nodes.isEmpty()) {
                    Snap na = snapped.computeIfAbsent(a, k -> nearest(ca));
                    Snap nb = snapped.computeIfAbsent(b, k -> nearest(cb));
                    if (na.d() < MAX_SNAP_M && nb.d() < MAX_SNAP_M) {
                        pts = dijkstra(na.id(), nb.id());
                    }
                    // Reject detours: a path far longer than the straight line went the wrong way at a junction.
                    if (pts != null && Geo.polyLength(pts) > straight * 1.5 + 300) {
                        pts = null;
                    }
                }
                List<LonLat> full = new ArrayList<>();
                full.add(ca);
                if (pts != null) {
                    full.addAll(pts);
                }
                full.add(cb);
                double len = Geo.polyLength(full);
                boolean onTrack = full.size() > 2;
                List<LonLat> reversed = new ArrayList<>(full);
                Collections.reverse(reversed);
                paths.put(key, new TrackPath(List.copyOf(full), len, onTrack));
                paths.put(b + ">" + a, new TrackPath(List.copyOf(reversed), len, onTrack));
            }
        }
        return paths;
    }

    private int nodeOf(LonLat p) {
        Integer id = index.get(p);
        if (id != null) {
            return id;
        }
        int next = nodes.size();
        index.put(p, next);
        nodes.add(p);
        adj.add(new ArrayList<>());
        return next;
    }

    private void link(int a, int b) {
        if (a == b) {
            return;
        }
        double w = Geo.meters(nodes.get(a), nodes.get(b));
        adj.get(a).add(new Edge(b, w));
        adj.get(b).add(new Edge(a, w));
    }

    private void bridgeGaps(List<int[]> lineNodes) {
        for (int li = 0; li < lineNodes.size(); li++) {
            int[] ids = lineNodes.get(li);
            for (int end : new int[] {ids[0], ids[ids.length - 1]}) {
                if (adj.get(end).size() > 1) {
                    continue;
                }
                int best = -1;
                double bd = GAP_BRIDGE_M;
                for (int lj = 0; lj < lineNodes.size(); lj++) {
                    if (lj == li) {
                        continue;
                    }
                    for (int n : lineNodes.get(lj)) {
                        double d = Geo.meters(nodes.get(end), nodes.get(n));
                        if (d < bd) {
                            bd = d;
                            best = n;
                        }
                    }
                }
                if (best >= 0) {
                    link(end, best);
                }
            }
        }
    }

    /** Snaps a station onto the closest point of the closest segment and adds that point to the graph. */
    private Snap nearest(LonLat p) {
        double k = Math.cos(Geo.toRad(p.lat()));
        int bestA = -1;
        int bestB = -1;
        LonLat bestQ = null;
        double bd = Double.POSITIVE_INFINITY;
        for (int[] e : edges) {
            LonLat a = nodes.get(e[0]);
            LonLat b = nodes.get(e[1]);
            double ax = (a.lon() - p.lon()) * k;
            double ay = a.lat() - p.lat();
            double bx = (b.lon() - p.lon()) * k;
            double by = b.lat() - p.lat();
            double dx = bx - ax;
            double dy = by - ay;
            double l2 = dx * dx + dy * dy;
            double u = l2 != 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / l2)) : 0;
            LonLat q = new LonLat(a.lon() + (b.lon() - a.lon()) * u, a.lat() + (b.lat() - a.lat()) * u);
            double d = Geo.meters(p, q);
            if (d < bd) {
                bd = d;
                bestA = e[0];
                bestB = e[1];
                bestQ = q;
            }
        }
        if (bestQ == null) {
            return new Snap(-1, Double.POSITIVE_INFINITY);
        }
        int id = nodeOf(bestQ);
        link(id, bestA);
        link(id, bestB);
        return new Snap(id, bd);
    }

    private List<LonLat> dijkstra(int src, int dst) {
        double[] dist = new double[nodes.size()];
        int[] prev = new int[nodes.size()];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(prev, -1);
        dist[src] = 0;
        PriorityQueue<double[]> heap = new PriorityQueue<>((x, y) -> Double.compare(x[0], y[0]));
        heap.add(new double[] {0, src});
        while (!heap.isEmpty()) {
            double[] top = heap.poll();
            double d = top[0];
            int u = (int) top[1];
            if (u == dst) {
                break;
            }
            if (d > dist[u]) {
                continue;
            }
            for (Edge e : adj.get(u)) {
                if (d + e.w() < dist[e.to()]) {
                    dist[e.to()] = d + e.w();
                    prev[e.to()] = u;
                    heap.add(new double[] {dist[e.to()], e.to()});
                }
            }
        }
        if (!Double.isFinite(dist[dst])) {
            return null;
        }
        List<LonLat> out = new ArrayList<>();
        for (int u = dst; u != -1; u = prev[u]) {
            out.add(nodes.get(u));
        }
        Collections.reverse(out);
        return out;
    }
}
