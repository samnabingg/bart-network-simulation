package com.transittwin.layout;

import static org.assertj.core.api.Assertions.assertThat;

import com.transittwin.geo.LonLat;
import com.transittwin.network.TrackPath;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LineProfileBuilderTest {

    private static OsmData.Element way(long id, Map<String, String> tags, double lon0, double lon1) {
        return new OsmData.Element("way", id, tags, List.of(new OsmData.LatLon(37.8, lon0), new OsmData.LatLon(37.8, lon1)));
    }

    private static List<LineProfileBuilder.Sample> samples(String... kindsEvery20m) {
        List<LineProfileBuilder.Sample> out = new ArrayList<>();
        for (int i = 0; i < kindsEvery20m.length; i++) out.add(new LineProfileBuilder.Sample(i * 20.0, kindsEvery20m[i], null));
        return out;
    }

    @Test
    void readsTunnelsBridgesAndLayers() {
        assertThat(LineProfileBuilder.kindOf(way(1, Map.of("railway", "subway", "tunnel", "yes", "layer", "-1"), 0, 0))).isEqualTo("tunnel");
        assertThat(LineProfileBuilder.kindOf(way(2, Map.of("railway", "subway", "bridge", "viaduct"), 0, 0))).isEqualTo("elevated");
        assertThat(LineProfileBuilder.kindOf(way(3, Map.of("railway", "subway", "layer", "-2"), 0, 0))).isEqualTo("tunnel");
        assertThat(LineProfileBuilder.kindOf(way(4, Map.of("railway", "subway", "layer", "1"), 0, 0))).isEqualTo("elevated");
        assertThat(LineProfileBuilder.kindOf(way(5, Map.of("railway", "subway", "bridge", "no"), 0, 0))).isEqualTo("grade");
        assertThat(LineProfileBuilder.nameOf(way(6, Map.of("tunnel", "yes", "name", "Transbay Tube"), 0, 0))).isEqualTo("Transbay Tube");
        assertThat(LineProfileBuilder.nameOf(way(7, Map.of("tunnel", "yes", "name", "M-Line"), 0, 0))).isNull();
    }

    @Test
    void foldsShortStretchesIntoTheirNeighbours() {
        // 400 m on a viaduct, a 40 m road bridge gap at grade, 200 m more viaduct, then 300 m of tunnel
        String[] kinds = new String[48];
        for (int i = 0; i < 48; i++) kinds[i] = i < 20 ? "elevated" : i < 22 ? "grade" : i < 32 ? "elevated" : "tunnel";
        List<LineProfile.Segment> segs = LineProfileBuilder.segments(samples(kinds));
        assertThat(segs).extracting(LineProfile.Segment::kind).containsExactly("elevated", "tunnel");
        assertThat(segs.get(0).from()).isZero();
        assertThat(segs.get(1).to()).isEqualTo(1.0);
        assertThat(segs.get(0).to()).isEqualTo(segs.get(1).from());
        assertThat(segs.get(1).from()).isCloseTo(630.0 / 940, org.assertj.core.data.Offset.offset(0.01));
    }

    @Test
    void fillsGapsWithoutATrackFromTheNearestKnownStretch() {
        List<LineProfile.Segment> segs = LineProfileBuilder.segments(samples(
            "grade", "grade", "grade", "grade", "grade", null, null, "tunnel", "tunnel", "tunnel", "tunnel", "tunnel", "tunnel"));
        assertThat(segs).extracting(LineProfile.Segment::kind).containsExactly("grade", "tunnel");
    }

    @Test
    void walksTheTrackPathAndMatchesTheNearestOsmTrack() {
        // about 1.3 km east-west: ground-level track, then a tunnel; plus a platform way that must be ignored
        OsmData osm = new OsmData(List.of(
            way(1, Map.of("railway", "subway"), -122.300, -122.293),
            way(2, Map.of("railway", "subway", "tunnel", "yes", "tunnel:name", "Test Tunnel"), -122.293, -122.285),
            way(3, Map.of("railway", "platform", "bridge", "yes"), -122.300, -122.285)));
        TrackPath path = new TrackPath(List.of(new LonLat(-122.300, 37.8001), new LonLat(-122.285, 37.8001)), 1300, true);
        LineProfile p = LineProfileBuilder.build(osm, Map.of("AAA>BBB", path), Instant.EPOCH);
        List<LineProfile.Segment> segs = p.legs().get("AAA>BBB");
        assertThat(segs).extracting(LineProfile.Segment::kind).containsExactly("grade", "tunnel");
        assertThat(segs.get(1).from()).isCloseTo(7.0 / 15, org.assertj.core.data.Offset.offset(0.03));
        assertThat(segs.get(1).name()).isEqualTo("Test Tunnel");
        assertThat(p.source().attribution()).contains("OpenStreetMap");
    }
}
