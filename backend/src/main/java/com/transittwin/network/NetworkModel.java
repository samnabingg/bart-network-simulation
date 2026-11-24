package com.transittwin.network;

import com.transittwin.geo.GeoDocument;
import java.time.Instant;
import java.util.Map;

/**
 * Everything the simulation needs, built once from the database and swapped atomically when the
 * reference data changes. All maps keep a stable order (lines in display order).
 */
public record NetworkModel(
    Map<String, StationInfo> stations,
    Map<String, LineDef> lines,
    Map<String, TrackPath> paths,
    Map<String, Trip> timetable,
    GeoDocument geo,
    Instant builtAt) {

    public String stationName(String abbr) {
        StationInfo s = stations.get(abbr);
        return s != null ? s.name() : abbr;
    }

    public Trip trip(String line, int dir) {
        return timetable.get(Trip.key(line, dir));
    }
}
