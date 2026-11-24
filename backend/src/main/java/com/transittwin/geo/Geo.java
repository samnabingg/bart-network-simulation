package com.transittwin.geo;

import java.util.List;

/** Small-distance geometry on the earth's surface (equirectangular approximation). */
public final class Geo {

    private static final double EARTH_RADIUS_M = 6_371_000;

    private Geo() {
    }

    public static double toRad(double degrees) {
        return degrees * Math.PI / 180;
    }

    /** Meters between two points; accurate to well under 1% at the scale of the BART network. */
    public static double meters(LonLat a, LonLat b) {
        double x = toRad(b.lon() - a.lon()) * Math.cos(toRad((a.lat() + b.lat()) / 2));
        double y = toRad(b.lat() - a.lat());
        return Math.hypot(x, y) * EARTH_RADIUS_M;
    }

    public static double polyLength(List<LonLat> pts) {
        double sum = 0;
        for (int i = 1; i < pts.size(); i++) {
            sum += meters(pts.get(i - 1), pts.get(i));
        }
        return sum;
    }

    /** 5 decimals, roughly 1 meter. Rounds half up like JavaScript's Math.round. */
    public static double round5(double v) {
        return Math.round(v * 1e5) / 1e5;
    }
}
