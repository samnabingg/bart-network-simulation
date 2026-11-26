package com.transittwin.layout;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * One station's physical layout, imported from OpenStreetMap.
 * <p>
 * Coordinates are meters in a station frame: the origin is the middle of the BART platforms, +z
 * runs along the platforms in the direction {@code bearingDeg} (degrees clockwise from north), and
 * +x points to the right of that. Points are {@code [x, z]}. The 3D scenes use the same axes: trains
 * run along z.
 *
 * @param layout        island, side, mixed or unknown, from which sides of each platform have track
 * @param platformLevel the OSM level of the BART platforms (negative is underground), if tagged
 * @param levels        every level mentioned by the imported features, lowest first
 * @param coverage      how many of each feature kind OSM had, so gaps are easy to see
 * @param warnings      what is missing or disagrees with the reference data
 */
public record StationLayout(
    String abbr,
    String name,
    Source source,
    Origin origin,
    double bearingDeg,
    String layout,
    String platformLevel,
    List<String> levels,
    List<Platform> platforms,
    List<Track> tracks,
    List<Feature> features,
    List<Area> areas,
    List<double[]> building,
    Map<String, Integer> coverage,
    List<String> warnings) {

    /** Where the data came from. OSM data must be credited (ODbL). */
    public record Source(String name, String license, String attribution, Instant importedAt) {
    }

    public record Origin(double lat, double lon) {
    }

    /**
     * @param shape            "area" when OSM has the platform outline, "line" when only an edge line
     * @param widthM           null for a line
     * @param tracksAlongside  both, left, right or none: which long sides have a track next to them
     */
    public record Platform(String osmId, String ref, String level, String shape, double lengthM, Double widthM,
                           double centerX, double zMin, double zMax, String tracksAlongside, List<double[]> outline) {
    }

    /** A track running past the platforms, at a fixed x. */
    public record Track(String osmId, double x, double zMin, double zMax) {
    }

    /**
     * @param kind   entrance, elevator, escalator, stairs, fare_gate, ticket_machine or platform_edge
     * @param points one point for things, the line for escalators, stairs and platform edges
     */
    public record Feature(String kind, String osmId, String level, String name, List<double[]> points) {
    }

    /** Indoor space mapped in OSM (concourse rooms, corridors). */
    public record Area(String kind, String osmId, String level, List<double[]> outline) {
    }
}
