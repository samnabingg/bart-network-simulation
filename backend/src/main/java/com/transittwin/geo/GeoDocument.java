package com.transittwin.geo;

import java.util.List;
import java.util.Map;

/**
 * Track lines and station entrances, in the same shape as the prototype's geo.json:
 * {@code {"track": [[[lon, lat], ...], ...], "entrances": {"12TH": [{"name", "lat", "lon"}]}}}.
 */
public record GeoDocument(List<List<LonLat>> track, Map<String, List<Entrance>> entrances) {

    public record Entrance(String name, double lat, double lon) {
    }
}
