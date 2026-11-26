package com.transittwin.layout;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Where the track runs in a tunnel, on a viaduct or on the ground, between every pair of
 * neighbouring stations, read from OpenStreetMap's {@code tunnel}, {@code bridge} and {@code layer}
 * tags along the real track.
 *
 * <p>Not used for the stations themselves: a road bridge or a station roof right over the platform
 * makes OSM's tags there misleading, so a station's level comes from the reference data.
 *
 * @param legs keyed "ABBR>ABBR" like the network's track paths; the segments run from the first
 *             station (0) to the second (1) and cover the whole leg
 */
public record LineProfile(Source source, Map<String, List<Segment>> legs) {

    public static final String TUNNEL = "tunnel";
    public static final String ELEVATED = "elevated";
    public static final String GRADE = "grade";

    public record Source(String name, String license, String attribution, Instant importedAt) {
    }

    /**
     * One stretch of a leg.
     *
     * @param from fraction of the leg where it starts (0..1)
     * @param to   fraction where it ends
     * @param kind tunnel, elevated or grade
     * @param name the tunnel's or bridge's name when OSM has one (e.g. "Transbay Tube")
     */
    public record Segment(double from, double to, String kind, String name) {
    }
}
