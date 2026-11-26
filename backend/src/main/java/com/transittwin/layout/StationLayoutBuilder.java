package com.transittwin.layout;

import com.transittwin.layout.OsmData.Element;
import com.transittwin.layout.OsmData.LatLon;
import com.transittwin.network.StationInfo;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Turns the OpenStreetMap data around one station into a {@link StationLayout}. Pure: the same
 * input always gives the same layout, so it is tested against saved Overpass answers.
 */
public final class StationLayoutBuilder {

    /** How far around the station to ask Overpass for (m). Underground entrances can be ~150 m out. */
    static final int QUERY_RADIUS_M = 250;
    /** How far a track may be from a platform edge to count as running alongside it (m). */
    static final double TRACK_GAP_M = 4.5;
    /** Margins around the platforms within which stairs, elevators, gates etc. belong to the station (m). */
    static final double ZONE_X_M = 70;
    static final double ZONE_Z_M = 100;

    public static final String ATTRIBUTION = "© OpenStreetMap contributors";
    public static final String LICENSE = "ODbL 1.0 (https://opendatacommons.org/licenses/odbl/)";

    private StationLayoutBuilder() {
    }

    /** One Overpass request for everything the builder looks at around a point. */
    public static String overpassQuery(double lat, double lon) {
        String a = String.format(Locale.ROOT, "(around:%d,%.6f,%.6f)", QUERY_RADIUS_M, lat, lon);
        return "[out:json][timeout:90];("
            + "nw" + a + "[railway~\"^(platform|platform_edge|subway_entrance|train_station_entrance)$\"];"
            + "nw" + a + "[public_transport=platform];"
            + "way" + a + "[railway~\"^(subway|rail)$\"];"
            + "nw" + a + "[highway~\"^(elevator|steps)$\"];"
            + "nw" + a + "[conveying];"
            + "nw" + a + "[barrier~\"turnstile\"];"
            + "nw" + a + "[vending=public_transport_tickets];"
            + "way" + a + "[indoor~\"^(room|area|corridor)$\"];"
            + "way" + a + "[building~\"^(train_station|transportation)$\"];"
            + ");out tags geom;";
    }

    public static StationLayout build(StationInfo st, OsmData osm, Instant importedAt) {
        List<String> warnings = new ArrayList<>();
        List<Element> els = osm.elements();

        List<Element> tagged = els.stream().filter(Element::isWay).filter(StationLayoutBuilder::isBartPlatform).toList();
        List<Element> bart = !tagged.isEmpty() ? tagged
            : els.stream().filter(Element::isWay).filter(StationLayoutBuilder::isUntaggedRailPlatform).toList();
        if (tagged.isEmpty() && !bart.isEmpty()) {
            warnings.add("No platform here is tagged as BART; using untagged rail platforms.");
        }
        List<Element> areas = bart.stream().filter(e -> e.closed() && !e.is("railway", "platform_edge") && !e.is("area", "no")).toList();
        List<Element> lines = bart.stream().filter(e -> !areas.contains(e)).toList();
        List<Element> main = areas.isEmpty() ? lines : areas;

        // Frame: centred on the platforms, +z along the longest one.
        LatLon origin;
        double bearing;
        if (!main.isEmpty()) {
            origin = average(main.stream().map(Element::center).toList());
            Element longest = main.stream().max(Comparator.comparingDouble(e -> axis(e, origin)[1])).orElseThrow();
            bearing = axis(longest, origin)[0];
        } else {
            warnings.add("OpenStreetMap has no BART platform here; the layout is centred on the station point.");
            origin = new LatLon(st.lat(), st.lon());
            bearing = tracksBearing(els, origin);
        }
        LocalFrame f = new LocalFrame(origin.lat(), origin.lon(), bearing);

        // Tracks first: they decide which sides of each platform face a train.
        double[] span = span(main, f);
        List<StationLayout.Track> tracks = tracks(els, f, span);

        List<StationLayout.Platform> platforms = new ArrayList<>();
        for (Element e : main) {
            List<double[]> loc = f.toLocal(e.points());
            double[] b = bounds(loc);
            boolean area = !areas.isEmpty();
            double cx = area ? (b[0] + b[1]) / 2 : loc.stream().mapToDouble(p -> p[0]).average().orElse(0);
            String sides = area ? sidesWithTrack(b[0], b[1], tracks) : sideOfLine(cx, tracks);
            platforms.add(new StationLayout.Platform(e.osmId(), blankToNull(e.tag("ref")), blankToNull(e.tag("level")),
                area ? "area" : "line", r(b[3] - b[2]), area ? r(b[1] - b[0]) : null, r(cx), r(b[2]), r(b[3]), sides,
                round(loc)));
        }
        String layout = layoutKind(platforms, tracks);

        // Everything else that belongs to the station.
        List<StationLayout.Feature> features = new ArrayList<>();
        List<StationLayout.Area> indoor = new ArrayList<>();
        List<double[]> building = null;
        double bestBuilding = Double.MAX_VALUE;
        for (Element e : els) {
            double[] c = f.toLocal(e.center().lat(), e.center().lon());
            boolean near = inZone(c, span);
            String kind = featureKind(e, !areas.isEmpty() && lines.contains(e));
            if (kind != null && ("entrance".equals(kind) || near)) {
                List<double[]> pts = e.isWay() && !"elevator".equals(kind) ? round(f.toLocal(e.points())) : List.of(round(c));
                String name = blankToNull(!e.tag("name").isBlank() ? e.tag("name") : e.tag("ref"));
                features.add(new StationLayout.Feature(kind, e.osmId(), blankToNull(e.tag("level")), name, pts));
            }
            String in = e.tag("indoor");
            if (near && e.closed() && Set.of("room", "area", "corridor").contains(in)) {
                indoor.add(new StationLayout.Area(in, e.osmId(), blankToNull(e.tag("level")), round(f.toLocal(e.points()))));
            }
            String bld = e.tag("building");
            if (e.closed() && (bld.equals("train_station") || bld.equals("transportation")) && near) {
                double d = Math.hypot(c[0], c[1]);
                if (d < bestBuilding) {
                    bestBuilding = d;
                    building = round(f.toLocal(e.points()));
                }
            }
        }

        Map<String, Integer> coverage = new LinkedHashMap<>();
        coverage.put("platforms", platforms.size());
        coverage.put("tracks", tracks.size());
        for (String k : List.of("entrance", "elevator", "escalator", "stairs", "fare_gate", "ticket_machine")) {
            coverage.put(k, (int) features.stream().filter(x -> x.kind().equals(k)).count());
        }
        coverage.put("indoor_areas", indoor.size());

        warn(st, layout, platforms, coverage, building, warnings);

        Set<String> levelSet = new LinkedHashSet<>();
        platforms.forEach(p -> addLevels(levelSet, p.level()));
        features.forEach(x -> addLevels(levelSet, x.level()));
        indoor.forEach(x -> addLevels(levelSet, x.level()));
        List<String> levels = levelSet.stream().sorted(Comparator.comparingDouble(StationLayoutBuilder::levelValue)).toList();
        String platformLevel = platforms.stream().map(StationLayout.Platform::level).filter(l -> l != null)
            .distinct().reduce((a, b) -> a + ";" + b).orElse(null);

        return new StationLayout(st.abbr(), st.name(),
            new StationLayout.Source("OpenStreetMap", LICENSE, ATTRIBUTION, importedAt),
            new StationLayout.Origin(r6(origin.lat()), r6(origin.lon())), r(bearing), layout, platformLevel, levels,
            platforms, tracks, features, indoor, building, coverage, warnings);
    }

    /* ---------- What counts as what ---------- */

    static boolean isBartPlatform(Element e) {
        boolean platformish = e.is("railway", "platform") || e.is("railway", "platform_edge") || e.is("public_transport", "platform");
        if (!platformish || e.yes("bus") || e.yes("trolleybus")) return false;
        String net = (e.tag("network") + ";" + e.tag("operator")).toLowerCase(Locale.ROOT);
        // BART's own platforms count whatever the mode tag: eBART (Antioch, Pittsburg Center) is light_rail=yes
        if (net.contains("bart") || net.contains("bay area rapid transit")) return true;
        if (!net.replace(";", "").isBlank()) return false; // another operator's platform
        if (e.yes("tram") || e.yes("light_rail")) return false; // Muni and the like, untagged by operator
        return e.yes("subway") || e.yes("train");
    }

    /** Fallback when nothing is tagged as BART: a rail platform with no operator, network or mode at all. */
    static boolean isUntaggedRailPlatform(Element e) {
        return e.is("railway", "platform") && e.tag("network").isBlank() && e.tag("operator").isBlank()
            && !e.yes("bus") && !e.yes("tram") && !e.yes("light_rail") && !e.yes("trolleybus");
    }

    static boolean isBartTrack(Element e) {
        if (!e.isWay() || e.is("service", "yard")) return false;
        if (e.is("railway", "subway")) return true;
        String who = (e.tag("network") + ";" + e.tag("operator") + ";" + e.tag("name")).toLowerCase(Locale.ROOT);
        return e.is("railway", "rail") && (who.contains("bart") || who.contains("bay area rapid transit"));
    }

    /** null when the element isn't a station feature. */
    static String featureKind(Element e, boolean extraPlatformLine) {
        if (extraPlatformLine) return "platform_edge";
        String rw = e.tag("railway");
        if (rw.equals("subway_entrance") || rw.equals("train_station_entrance")) return "entrance";
        if (e.is("highway", "elevator")) return "elevator";
        String conveying = e.tag("conveying");
        boolean moving = !conveying.isBlank() && !conveying.equals("no");
        if (e.is("highway", "steps")) return moving ? "escalator" : "stairs";
        if (moving && e.isWay()) return "escalator";
        String barrier = e.tag("barrier");
        if (barrier.equals("turnstile") || barrier.equals("full-height_turnstile")) return "fare_gate";
        if (e.is("vending", "public_transport_tickets")) return "ticket_machine";
        return null;
    }

    /* ---------- Geometry ---------- */

    /** {bearing of the long axis in degrees [0, 180), its length in m} for a platform. */
    static double[] axis(Element e, LatLon at) {
        List<double[]> en = e.points().stream().map(p -> LocalFrame.eastNorth(at.lat(), at.lon(), p.lat(), p.lon())).toList();
        if (!e.closed()) {
            double[] a = en.get(0), b = en.get(en.size() - 1);
            return new double[] {bearingOf(b[0] - a[0], b[1] - a[1]), Math.hypot(b[0] - a[0], b[1] - a[1])};
        }
        // Smallest rectangle around the outline: one of its sides lies along an outline edge.
        double bestArea = Double.MAX_VALUE, bestBearing = 0, bestLen = 0;
        for (int i = 0; i + 1 < en.size(); i++) {
            double dx = en.get(i + 1)[0] - en.get(i)[0], dy = en.get(i + 1)[1] - en.get(i)[1];
            if (Math.hypot(dx, dy) < 0.01) continue;
            double ang = Math.atan2(dy, dx), c = Math.cos(ang), s = Math.sin(ang);
            double u0 = Double.MAX_VALUE, u1 = -Double.MAX_VALUE, v0 = Double.MAX_VALUE, v1 = -Double.MAX_VALUE;
            for (double[] p : en) {
                double u = p[0] * c + p[1] * s, v = -p[0] * s + p[1] * c;
                u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
            }
            double area = (u1 - u0) * (v1 - v0);
            if (area < bestArea) {
                bestArea = area;
                boolean alongU = u1 - u0 >= v1 - v0;
                double la = alongU ? ang : ang + Math.PI / 2;
                bestBearing = bearingOf(Math.cos(la), Math.sin(la));
                bestLen = Math.max(u1 - u0, v1 - v0);
            }
        }
        return new double[] {bestBearing, bestLen};
    }

    /** Compass bearing in [0, 180) of the direction (east, north). */
    static double bearingOf(double east, double north) {
        double b = Math.toDegrees(Math.atan2(east, north));
        return ((b % 180) + 180) % 180;
    }

    private static double tracksBearing(List<Element> els, LatLon at) {
        return els.stream().filter(StationLayoutBuilder::isBartTrack)
            .max(Comparator.comparingInt(e -> e.points().size()))
            .map(e -> axis(new Element("way", e.id(), Map.of(), List.of(e.points().get(0), e.points().get(e.points().size() - 1))), at)[0])
            .orElse(0.0);
    }

    /** {xMin, xMax, zMin, zMax} over all main platforms (a small box at the origin if there are none). */
    private static double[] span(List<Element> main, LocalFrame f) {
        if (main.isEmpty()) return new double[] {-5, 5, -105, 105};
        double[] b = {Double.MAX_VALUE, -Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE};
        for (Element e : main) {
            double[] x = bounds(f.toLocal(e.points()));
            b[0] = Math.min(b[0], x[0]); b[1] = Math.max(b[1], x[1]); b[2] = Math.min(b[2], x[2]); b[3] = Math.max(b[3], x[3]);
        }
        return b;
    }

    private static double[] bounds(List<double[]> pts) {
        double[] b = {Double.MAX_VALUE, -Double.MAX_VALUE, Double.MAX_VALUE, -Double.MAX_VALUE};
        for (double[] p : pts) {
            b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]);
        }
        return b;
    }

    private static boolean inZone(double[] c, double[] span) {
        return c[0] > span[0] - ZONE_X_M && c[0] < span[1] + ZONE_X_M && c[1] > span[2] - ZONE_Z_M && c[1] < span[3] + ZONE_Z_M;
    }

    /**
     * BART tracks that run straight past the platforms. Each is sampled every 10 m along the
     * platforms; a track counts if it covers at least half of them and stays within 3 m sideways.
     */
    static List<StationLayout.Track> tracks(List<Element> els, LocalFrame f, double[] span) {
        List<double[]> found = new ArrayList<>(); // {x, zMin, zMax}
        List<String> ids = new ArrayList<>();
        int samples = Math.max(2, (int) ((span[3] - span[2]) / 10) + 1);
        for (Element e : els) {
            if (!isBartTrack(e)) continue;
            List<double[]> loc = f.toLocal(e.points());
            List<Double> xs = new ArrayList<>();
            double zLo = Double.MAX_VALUE, zHi = -Double.MAX_VALUE;
            for (int i = 0; i < samples; i++) {
                double z = span[2] + (span[3] - span[2]) * i / (samples - 1);
                Double x = xAt(loc, z);
                if (x != null) {
                    xs.add(x);
                    zLo = Math.min(zLo, z);
                    zHi = Math.max(zHi, z);
                }
            }
            if (xs.size() * 2 < samples) continue;
            double lo = xs.stream().mapToDouble(d -> d).min().orElse(0), hi = xs.stream().mapToDouble(d -> d).max().orElse(0);
            if (hi - lo > 3) continue; // crossover or curve, not a platform track
            double x = xs.stream().sorted().toList().get(xs.size() / 2);
            if (x < span[0] - 25 || x > span[1] + 25) continue;
            boolean dup = false;
            for (double[] t : found) {
                if (Math.abs(t[0] - x) < 1.2) {
                    t[1] = Math.min(t[1], zLo);
                    t[2] = Math.max(t[2], zHi);
                    dup = true;
                }
            }
            if (!dup) {
                found.add(new double[] {x, zLo, zHi});
                ids.add(e.osmId());
            }
        }
        List<StationLayout.Track> out = new ArrayList<>();
        for (int i = 0; i < found.size(); i++) {
            double[] t = found.get(i);
            out.add(new StationLayout.Track(ids.get(i), r(t[0]), r(t[1]), r(t[2])));
        }
        out.sort(Comparator.comparingDouble(StationLayout.Track::x));
        return out;
    }

    private static Double xAt(List<double[]> line, double z) {
        for (int i = 0; i + 1 < line.size(); i++) {
            double[] a = line.get(i), b = line.get(i + 1);
            if ((a[1] - z) * (b[1] - z) <= 0 && a[1] != b[1]) {
                return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]);
            }
        }
        return null;
    }

    private static String sidesWithTrack(double xMin, double xMax, List<StationLayout.Track> tracks) {
        boolean left = tracks.stream().anyMatch(t -> t.x() < xMin + 0.5 && xMin - t.x() < TRACK_GAP_M);
        boolean right = tracks.stream().anyMatch(t -> t.x() > xMax - 0.5 && t.x() - xMax < TRACK_GAP_M);
        return left && right ? "both" : left ? "left" : right ? "right" : "none";
    }

    private static String sideOfLine(double x, List<StationLayout.Track> tracks) {
        return tracks.stream().filter(t -> Math.abs(t.x() - x) < TRACK_GAP_M)
            .min(Comparator.comparingDouble(t -> Math.abs(t.x() - x)))
            .map(t -> t.x() < x ? "left" : "right").orElse("none");
    }

    /** island: every platform has track on both sides; side: on one side; otherwise use the refs. */
    static String layoutKind(List<StationLayout.Platform> platforms, List<StationLayout.Track> tracks) {
        if (platforms.isEmpty()) return "unknown";
        boolean lineOnly = platforms.stream().allMatch(p -> p.shape().equals("line"));
        if (!tracks.isEmpty() && !lineOnly) {
            // Some islands are mapped as two touching halves (one per ref): judge touching areas together.
            List<double[]> groups = new ArrayList<>(); // {xMin, xMax}
            platforms.stream()
                .map(p -> new double[] {p.centerX() - p.widthM() / 2, p.centerX() + p.widthM() / 2})
                .sorted(Comparator.comparingDouble(g -> g[0]))
                .forEach(g -> {
                    double[] last = groups.isEmpty() ? null : groups.get(groups.size() - 1);
                    if (last != null && g[0] <= last[1] + 1.0) last[1] = Math.max(last[1], g[1]);
                    else groups.add(g);
                });
            long both = groups.stream().filter(g -> sidesWithTrack(g[0], g[1], tracks).equals("both")).count();
            long one = groups.stream().filter(g -> Set.of("left", "right").contains(sidesWithTrack(g[0], g[1], tracks))).count();
            if (both == groups.size()) return "island";
            if (one == groups.size()) return "side";
            if (both + one == groups.size()) return "mixed";
        }
        if (!tracks.isEmpty() && lineOnly && platforms.size() >= 2) {
            double lo = platforms.stream().mapToDouble(StationLayout.Platform::centerX).min().orElse(0);
            double hi = platforms.stream().mapToDouble(StationLayout.Platform::centerX).max().orElse(0);
            boolean tracksBetween = tracks.stream().anyMatch(t -> t.x() > lo && t.x() < hi);
            boolean tracksOutside = tracks.stream().anyMatch(t -> t.x() < lo || t.x() > hi);
            if (tracksBetween && !tracksOutside) return "side";
            if (tracksOutside && !tracksBetween) return "island";
        }
        if (platforms.size() == 1 && platforms.get(0).ref() != null && platforms.get(0).ref().contains(";")) return "island";
        if (platforms.size() == 2 && platforms.stream().allMatch(p -> p.ref() != null && !p.ref().contains(";"))) return "side";
        return "unknown";
    }

    private static void warn(StationInfo st, String layout, List<StationLayout.Platform> platforms,
                             Map<String, Integer> coverage, List<double[]> building, List<String> warnings) {
        if (layout.equals("unknown") && !platforms.isEmpty()) warnings.add("Couldn't tell island from side platforms.");
        if (st.platform() != null && (layout.equals("island") || layout.equals("side")) && !layout.equals(st.platform())) {
            warnings.add("OSM looks like " + layout + " platforms; the reference data says " + st.platform() + ".");
        }
        for (StationLayout.Platform p : platforms) {
            if (p.lengthM() < 150 || p.lengthM() > 260) {
                warnings.add("Platform " + p.osmId() + " is " + p.lengthM() + " m long; BART platforms are about 213 m.");
            }
        }
        if (platforms.stream().allMatch(p -> p.level() == null) && !platforms.isEmpty()) warnings.add("Platform level isn't tagged.");
        Map<String, String> label = Map.of("escalator", "escalators", "elevator", "elevators", "fare_gate", "fare gates",
            "entrance", "entrances");
        for (String k : List.of("entrance", "escalator", "elevator", "fare_gate")) {
            if (coverage.get(k) == 0) warnings.add("No " + label.get(k) + " mapped in OSM: fill in by hand.");
        }
        if (building == null) warnings.add("No station building outline in OSM.");
    }

    /* ---------- Small helpers ---------- */

    private static LatLon average(List<LatLon> pts) {
        return new LatLon(pts.stream().mapToDouble(LatLon::lat).average().orElse(0), pts.stream().mapToDouble(LatLon::lon).average().orElse(0));
    }

    private static void addLevels(Set<String> out, String level) {
        if (level == null) return;
        for (String l : level.split(";")) if (!l.isBlank()) out.add(l.trim());
    }

    private static double levelValue(String l) {
        try {
            return Double.parseDouble(l);
        } catch (NumberFormatException e) {
            return Double.MAX_VALUE;
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    static double r(double v) {
        return Math.round(v * 10) / 10.0;
    }

    private static double r6(double v) {
        return Math.round(v * 1e6) / 1e6;
    }

    private static double[] round(double[] p) {
        return new double[] {r(p[0]), r(p[1])};
    }

    private static List<double[]> round(List<double[]> pts) {
        return pts.stream().map(StationLayoutBuilder::round).toList();
    }
}
