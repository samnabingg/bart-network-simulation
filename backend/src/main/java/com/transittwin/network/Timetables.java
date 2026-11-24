package com.transittwin.network;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Running-time model. Estimated from track length: no published timetable is loaded. */
public final class Timetables {

    /** Seconds a train stands at each station (estimate). */
    public static final int DWELL_SEC = 25;

    /** Used when two neighbouring stations have no path (no coordinates). */
    static final double FALLBACK_LENGTH_M = 2000;

    private Timetables() {
    }

    /**
     * About 35 s to speed up and brake, then 22 m/s (about 80 km/h).
     * Bay Fair to San Leandro comes out near 3 minutes.
     */
    public static int runSeconds(double lengthM) {
        return (int) Math.round(35 + lengthM / 22);
    }

    public static Map<String, Trip> build(Collection<LineDef> lines, Map<String, TrackPath> paths) {
        Map<String, Trip> tt = new LinkedHashMap<>();
        for (LineDef line : lines) {
            for (int dir = 0; dir <= 1; dir++) {
                List<String> stops = line.stopsFor(dir);
                int n = stops.size();
                int[] arrive = new int[n];
                int[] depart = new int[n];
                int[] run = new int[n];
                for (int i = 1; i < n; i++) {
                    TrackPath p = paths.get(stops.get(i - 1) + ">" + stops.get(i));
                    run[i] = runSeconds(p != null ? p.len() : FALLBACK_LENGTH_M);
                    arrive[i] = depart[i - 1] + run[i];
                    depart[i] = arrive[i] + DWELL_SEC;
                }
                tt.put(Trip.key(line.id(), dir), new Trip(line.id(), dir, stops, arrive, depart, run, arrive[n - 1]));
            }
        }
        return tt;
    }
}
