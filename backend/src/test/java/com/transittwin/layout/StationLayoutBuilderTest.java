package com.transittwin.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.transittwin.network.StationInfo;
import java.io.InputStream;
import java.time.Instant;
import org.junit.jupiter.api.Test;

/**
 * Runs the builder on real Overpass answers saved in src/test/resources/osm
 * (© OpenStreetMap contributors, ODbL), covering the ways OSM maps BART platforms.
 */
class StationLayoutBuilderTest {

    private static final Instant AT = Instant.parse("2026-11-25T00:00:00Z");
    private final ObjectMapper json = new ObjectMapper();

    private StationLayout build(String abbr, String platform, double lat, double lon) throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/osm/" + abbr + ".json")) {
            OsmData osm = OsmData.parse(json.readTree(in));
            return StationLayoutBuilder.build(new StationInfo(abbr, abbr, "x", platform, lat, lon, null, null), osm, AT);
        }
    }

    @Test
    void bayFairIsOneIslandWithATrackEachSide() throws Exception {
        StationLayout l = build("BAYF", "island", 37.696975, -122.12673);
        assertThat(l.layout()).isEqualTo("island");
        assertThat(l.platforms()).singleElement().satisfies(p -> {
            assertThat(p.ref()).isEqualTo("1;2");
            assertThat(p.lengthM()).isCloseTo(213, within(5.0));
            assertThat(p.tracksAlongside()).isEqualTo("both");
        });
        assertThat(l.tracks()).hasSize(2);
        // the edge lines say which side is platform 1 and which is 2
        assertThat(l.features()).filteredOn(f -> f.kind().equals("platform_edge")).extracting(StationLayout.Feature::name)
            .containsExactlyInAnyOrder("1", "2");
        assertThat(l.warnings()).anyMatch(w -> w.contains("No escalators"));
    }

    @Test
    void macArthurHasTwoIslandsAndFourTracks() throws Exception {
        StationLayout l = build("MCAR", "island", 37.82907, -122.26686);
        assertThat(l.layout()).isEqualTo("island");
        assertThat(l.platforms()).hasSize(2).allMatch(p -> p.tracksAlongside().equals("both"));
        assertThat(l.tracks()).hasSize(4);
        assertThat(l.platformLevel()).isEqualTo("1");
        assertThat(l.coverage()).containsEntry("elevator", 2).containsEntry("escalator", 4);
        // MacArthur runs roughly north-south down the freeway median
        assertThat(l.bearingDeg()).isBetween(0.0, 20.0);
    }

    @Test
    void embarcaderoIslandMappedAsTwoTouchingHalves() throws Exception {
        StationLayout l = build("EMBR", "island", 37.792878, -122.396848);
        assertThat(l.layout()).isEqualTo("island");
        assertThat(l.platforms()).hasSize(2).extracting(StationLayout.Platform::ref).containsExactlyInAnyOrder("1", "2");
        assertThat(l.platformLevel()).isEqualTo("-3");
        assertThat(l.coverage().get("fare_gate")).isEqualTo(8);
        assertThat(l.coverage().get("indoor_areas")).isPositive();
        assertThat(l.levels()).contains("-3", "-2", "-1");
        assertThat(l.warnings()).noneMatch(w -> w.contains("reference data"));
    }

    @Test
    void edgeLinesWithTracksBetweenThemAreSidePlatforms() throws Exception {
        StationLayout l = build("FTVL", "island", 37.77508, -122.22451);
        assertThat(l.layout()).isEqualTo("side");
        assertThat(l.platforms()).hasSize(2).allMatch(p -> p.shape().equals("line"));
        // disagrees with the (approximate) reference data, and says so
        assertThat(l.warnings()).anyMatch(w -> w.contains("reference data says island"));
    }

    @Test
    void edgeLinesBetweenTracksAreAnIsland() throws Exception {
        StationLayout l = build("16TH", "side", 37.765123, -122.419643);
        assertThat(l.layout()).isEqualTo("island");
        assertThat(l.platformLevel()).isEqualTo("-2");
        assertThat(l.warnings()).anyMatch(w -> w.contains("reference data says side"));
    }

    @Test
    void platformTaggedOnlyWithBartAsOperatorCounts() throws Exception {
        // eBART at Antioch: no subway/train tag, just operator=San Francisco Bay Area Rapid Transit District
        StationLayout l = build("ANTC", "island", 37.99581, -121.77998);
        assertThat(l.platforms()).singleElement().satisfies(p -> assertThat(p.ref()).isEqualTo("1;2"));
    }

    @Test
    void untaggedPlatformIsUsedWhenNothingIsTaggedBart() throws Exception {
        // Oakland Airport connector: the platform has no operator, network or mode tag
        StationLayout l = build("OAKL", "island", 37.71293, -122.21254);
        assertThat(l.platforms()).hasSize(1);
        assertThat(l.warnings()).anyMatch(w -> w.contains("untagged"));
    }

    @Test
    void framePointsRoundTripToLatLon() {
        LocalFrame f = new LocalFrame(37.8, -122.27, 37.5);
        double[] p = f.toLocal(37.801, -122.268);
        OsmData.LatLon back = f.toLatLon(p[0], p[1]);
        assertThat(back.lat()).isCloseTo(37.801, within(1e-9));
        assertThat(back.lon()).isCloseTo(-122.268, within(1e-9));
        // +z points along the bearing
        double[] ahead = f.toLocal(37.8 + 0.001 * Math.cos(Math.toRadians(37.5)),
            -122.27 + 0.001 * Math.sin(Math.toRadians(37.5)) / Math.cos(Math.toRadians(37.8)));
        assertThat(ahead[0]).isCloseTo(0, within(0.01));
        assertThat(ahead[1]).isPositive();
    }

    @Test
    void busAndMuniPlatformsAreNotBart() {
        var bus = new OsmData.Element("way", 1, java.util.Map.of("public_transport", "platform", "bus", "yes"), java.util.List.of());
        var muni = new OsmData.Element("way", 2, java.util.Map.of("railway", "platform", "network", "Muni", "light_rail", "yes"), java.util.List.of());
        var bart = new OsmData.Element("way", 3, java.util.Map.of("railway", "platform", "subway", "yes"), java.util.List.of());
        assertThat(StationLayoutBuilder.isBartPlatform(bus)).isFalse();
        assertThat(StationLayoutBuilder.isBartPlatform(muni)).isFalse();
        assertThat(StationLayoutBuilder.isBartPlatform(bart)).isTrue();
    }
}
