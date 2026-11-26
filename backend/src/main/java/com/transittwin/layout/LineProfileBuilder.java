package com.transittwin.layout;

import com.transittwin.geo.Geo;
import com.transittwin.geo.LonLat;
import com.transittwin.network.TrackPath;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Builds the {@link LineProfile}: walks each track path between neighbouring stations in steps of
 * {@value #STEP_M} m, finds the nearest BART track in OpenStreetMap and reads whether it is a tunnel,
 * a bridge (viaduct) or on the ground.
 */
final class LineProfileBuilder {

    static final double STEP_M = 20;
    /** BART's KML track and OSM's track can be this far apart and still be the same track. */
    static final double MATCH_M = 35;
    /** Shorter stretches are folded into their neighbours (a short road bridge on an at-grade line). */
    static final double MIN_RUN_M = 90;

    private LineProfileBuilder() {
    }

    /** Every BART track way, with its tags and points. */
    static String overpassQuery() {
        return """
            [out:json][timeout:250];
            relation["network"="BART"]["route"~"^(subway|light_rail|train|monorail)$"];
            way(r)["railway"];
            out tags geom;""";
    }

    /** Track itself, not the platforms that are also members of the route relations. */
    static boolean isTrack(OsmData.Element e) {
        return e.isWay() && List.of("subway", "rail", "light_rail", "monorail", "funicular").contains(e.tag("railway"));
    }

    /** What an OSM track way is: tunnel, elevated or grade. */
    static String kindOf(OsmData.Element w) {
        String tunnel = w.tag("tunnel"), bridge = w.tag("bridge");
        if (!tunnel.isEmpty() && !tunnel.equals("no")) return LineProfile.TUNNEL;
        if (!bridge.isEmpty() && !bridge.equals("no")) return LineProfile.ELEVATED;
        int layer = parseLayer(w.tag("layer"));
        if (layer < 0) return LineProfile.TUNNEL;
        if (layer > 0) return LineProfile.ELEVATED;
        return LineProfile.GRADE;
    }

    /** The tunnel's or bridge's own name, never the line's name. */
    static String nameOf(OsmData.Element w) {
        for (String k : List.of("tunnel:name", "bridge:name")) if (!w.tag(k).isEmpty()) return w.tag(k);
        String n = w.tag("name");
        return n.matches("(?i).*\\b(tube|tunnel|viaduct|bridge)\\b.*") ? n : null;
    }

    private static int parseLayer(String v) {
        try {
            return v.isEmpty() ? 0 : Integer.parseInt(v.split(";")[0].trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static LineProfile build(OsmData osm, Map<String, TrackPath> paths, Instant now) {
        Index index = new Index(osm.elements().stream().filter(LineProfileBuilder::isTrack).toList());
        Map<String, List<LineProfile.Segment>> legs = new TreeMap<>();
        for (Map.Entry<String, TrackPath> e : paths.entrySet()) {
            List<Sample> samples = sample(e.getValue().pts(), index);
            if (samples.isEmpty()) continue;
            legs.put(e.getKey(), segments(samples));
        }
        return new LineProfile(new LineProfile.Source("OpenStreetMap", "ODbL 1.0 (https://opendatacommons.org/licenses/odbl/)",
            "© OpenStreetMap contributors", now), legs);
    }

    /** One point along a leg: meters from its start, and the nearest OSM track's kind (null: none near). */
    record Sample(double at, String kind, String name) {
    }

    static List<Sample> sample(List<LonLat> pts, Index index) {
        List<Sample> out = new ArrayList<>();
        if (pts.size() < 2) return out;
        double walked = 0, next = 0;
        for (int i = 1; i < pts.size(); i++) {
            LonLat a = pts.get(i - 1), b = pts.get(i);
            double d = Geo.meters(a, b);
            while (next <= walked + d) {
                double f = d == 0 ? 0 : (next - walked) / d;
                LonLat p = new LonLat(a.lon() + (b.lon() - a.lon()) * f, a.lat() + (b.lat() - a.lat()) * f);
                OsmData.Element w = index.nearest(p, MATCH_M);
                out.add(new Sample(next, w == null ? null : kindOf(w), w == null ? null : nameOf(w)));
                next += STEP_M;
            }
            walked += d;
        }
        if (out.get(out.size() - 1).at < walked - 1) {
            OsmData.Element w = index.nearest(pts.get(pts.size() - 1), MATCH_M);
            out.add(new Sample(walked, w == null ? null : kindOf(w), w == null ? null : nameOf(w)));
        }
        return out;
    }

    /** Runs of the same kind, short runs folded into their neighbours, as fractions of the leg. */
    static List<LineProfile.Segment> segments(List<Sample> samples) {
        int n = samples.size();
        String[] kinds = new String[n];
        for (int i = 0; i < n; i++) kinds[i] = samples.get(i).kind;
        // gaps (no OSM track close enough) take the kind of the nearest known sample
        for (int i = 0; i < n; i++) {
            if (kinds[i] != null) continue;
            String k = null;
            for (int d = 1; d < n && k == null; d++) {
                if (i - d >= 0 && samples.get(i - d).kind != null) k = samples.get(i - d).kind;
                else if (i + d < n && samples.get(i + d).kind != null) k = samples.get(i + d).kind;
            }
            kinds[i] = k == null ? LineProfile.GRADE : k;
        }
        double len = Math.max(1, samples.get(n - 1).at);
        List<int[]> runs = runs(kinds);
        // fold the shortest short run into a neighbour until none is left
        while (runs.size() > 1) {
            int shortest = -1;
            double best = MIN_RUN_M;
            for (int r = 0; r < runs.size(); r++) {
                double m = span(samples, runs.get(r));
                if (m < best) { best = m; shortest = r; }
            }
            if (shortest < 0) break;
            int[] run = runs.get(shortest);
            int into = shortest == 0 ? 1 : shortest == runs.size() - 1 ? shortest - 1
                : span(samples, runs.get(shortest - 1)) >= span(samples, runs.get(shortest + 1)) ? shortest - 1 : shortest + 1;
            String k = kinds[runs.get(into)[0]];
            for (int i = run[0]; i <= run[1]; i++) kinds[i] = k;
            runs = runs(kinds);
        }
        List<LineProfile.Segment> out = new ArrayList<>();
        for (int r = 0; r < runs.size(); r++) {
            int[] run = runs.get(r);
            double from = r == 0 ? 0 : boundary(samples, run[0]) / len;
            double to = r == runs.size() - 1 ? 1 : boundary(samples, run[1] + 1) / len;
            out.add(new LineProfile.Segment(round3(from), round3(to), kinds[run[0]], commonName(samples, run, kinds[run[0]])));
        }
        return out;
    }

    private static List<int[]> runs(String[] kinds) {
        List<int[]> runs = new ArrayList<>();
        int start = 0;
        for (int i = 1; i <= kinds.length; i++) {
            if (i == kinds.length || !kinds[i].equals(kinds[start])) {
                runs.add(new int[] {start, i - 1});
                start = i;
            }
        }
        return runs;
    }

    /** Meters a run covers: from halfway to the previous sample to halfway to the next. */
    private static double span(List<Sample> s, int[] run) {
        return boundary(s, run[1] + 1) - boundary(s, run[0]);
    }

    private static double boundary(List<Sample> s, int i) {
        if (i <= 0) return 0;
        if (i >= s.size()) return s.get(s.size() - 1).at;
        return (s.get(i - 1).at + s.get(i).at) / 2;
    }

    private static String commonName(List<Sample> s, int[] run, String kind) {
        if (LineProfile.GRADE.equals(kind)) return null;
        Map<String, Integer> votes = new LinkedHashMap<>();
        for (int i = run[0]; i <= run[1]; i++) {
            Sample x = s.get(i);
            if (x.name != null && kind.equals(x.kind)) votes.merge(x.name, 1, Integer::sum);
        }
        // a name only when it covers a good part of the run
        return votes.entrySet().stream().max(Map.Entry.comparingByValue())
            .filter(e -> e.getValue() * 3 >= run[1] - run[0] + 1).map(Map.Entry::getKey).orElse(null);
    }

    private static double round3(double v) {
        return Math.round(v * 1000) / 1000.0;
    }

    /** OSM track segments bucketed on a grid of about 100 m, for nearest-track lookups. */
    static final class Index {
        private static final double CELL = 0.001; // degrees
        private final Map<Long, List<Seg>> cells = new HashMap<>();

        private record Seg(OsmData.Element way, double lon0, double lat0, double lon1, double lat1) {
        }

        Index(List<OsmData.Element> ways) {
            for (OsmData.Element w : ways) {
                List<OsmData.LatLon> p = w.points();
                for (int i = 1; i < p.size(); i++) {
                    Seg s = new Seg(w, p.get(i - 1).lon(), p.get(i - 1).lat(), p.get(i).lon(), p.get(i).lat());
                    long x0 = cell(Math.min(s.lon0, s.lon1)), x1 = cell(Math.max(s.lon0, s.lon1));
                    long y0 = cell(Math.min(s.lat0, s.lat1)), y1 = cell(Math.max(s.lat0, s.lat1));
                    for (long x = x0; x <= x1; x++) for (long y = y0; y <= y1; y++) cells.computeIfAbsent(key(x, y), k -> new ArrayList<>()).add(s);
                }
            }
        }

        private static long cell(double deg) {
            return (long) Math.floor(deg / CELL);
        }

        private static long key(long x, long y) {
            return (x << 32) ^ (y & 0xffffffffL);
        }

        /** The way nearest to p, if one is within maxM meters. */
        OsmData.Element nearest(LonLat p, double maxM) {
            long cx = cell(p.lon()), cy = cell(p.lat());
            double kx = Math.cos(Geo.toRad(p.lat())) * 111_320, ky = 110_540;
            OsmData.Element best = null;
            double bestD = maxM;
            for (long x = cx - 1; x <= cx + 1; x++) {
                for (long y = cy - 1; y <= cy + 1; y++) {
                    for (Seg s : cells.getOrDefault(key(x, y), List.of())) {
                        double ax = (s.lon0 - p.lon()) * kx, ay = (s.lat0 - p.lat()) * ky;
                        double bx = (s.lon1 - p.lon()) * kx, by = (s.lat1 - p.lat()) * ky;
                        double dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
                        double t = l2 == 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2));
                        double d = Math.hypot(ax + t * dx, ay + t * dy);
                        if (d < bestD) { bestD = d; best = s.way; }
                    }
                }
            }
            return best;
        }
    }
}
