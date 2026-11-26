package com.transittwin.layout;

import java.util.List;

/**
 * Meters around a station. Over a few hundred meters the earth is flat enough for an
 * equirectangular projection (error well under a centimeter).
 */
final class LocalFrame {

    private static final double M_PER_DEG = 6_371_000 * Math.PI / 180;

    private final double lat0;
    private final double lon0;
    private final double cosLat;
    private final double sinB;
    private final double cosB;

    /** @param bearingDeg the direction of +z, degrees clockwise from north */
    LocalFrame(double lat0, double lon0, double bearingDeg) {
        this.lat0 = lat0;
        this.lon0 = lon0;
        this.cosLat = Math.cos(Math.toRadians(lat0));
        this.sinB = Math.sin(Math.toRadians(bearingDeg));
        this.cosB = Math.cos(Math.toRadians(bearingDeg));
    }

    /** East and north in meters from (lat0, lon0), before rotating. */
    static double[] eastNorth(double lat0, double lon0, double lat, double lon) {
        return new double[] {(lon - lon0) * Math.cos(Math.toRadians(lat0)) * M_PER_DEG, (lat - lat0) * M_PER_DEG};
    }

    /** {@code [x, z]}: z along the bearing, x to its right. */
    double[] toLocal(double lat, double lon) {
        double e = (lon - lon0) * cosLat * M_PER_DEG;
        double n = (lat - lat0) * M_PER_DEG;
        return new double[] {e * cosB - n * sinB, e * sinB + n * cosB};
    }

    List<double[]> toLocal(List<OsmData.LatLon> pts) {
        return pts.stream().map(p -> toLocal(p.lat(), p.lon())).toList();
    }

    /** Back to latitude and longitude. */
    OsmData.LatLon toLatLon(double x, double z) {
        double e = x * cosB + z * sinB;
        double n = -x * sinB + z * cosB;
        return new OsmData.LatLon(lat0 + n / M_PER_DEG, lon0 + e / (cosLat * M_PER_DEG));
    }
}
