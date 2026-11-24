package com.transittwin.geo;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class KmlParserTest {

    /** Small fixture in the same shape as BART's KML: three folders. */
    static final String FIXTURE = """
        <?xml version="1.0" encoding="UTF-8"?>
        <kml><Document>
          <Folder id="FeatureLayer0"><name>Station Entrance</name>
            <Placemark id="1"><name>B2 13th St &amp; Broadway Entrance / Exit</name>
              <description><![CDATA[<table><tr><td>Name</td><td>x</td></tr>
        <tr><td>parent_station</td>
        <td>place_12TH</td></tr></table>]]></description>
              <Point><coordinates>-122.2717025,37.8033157,0</coordinates></Point></Placemark>
            <Placemark id="2"><name>No station code</name><description><![CDATA[<table></table>]]></description>
              <Point><coordinates>-122.1,37.7,0</coordinates></Point></Placemark>
          </Folder>
          <Folder id="FeatureLayer1"><name>BART Station</name>
            <Placemark id="3"><name>Lake Merritt</name><Point><coordinates>-122.265,37.797,0</coordinates></Point></Placemark>
          </Folder>
          <Folder id="FeatureLayer2"><name>BART Track Centerline</name>
            <Placemark id="4"><name>1</name><MultiGeometry>
              <LineString><coordinates>-122.0,37.0,0 -121.9,37.1,0 -121.8,37.2,0</coordinates></LineString>
              <LineString><coordinates>-122.5,37.5,0 -122.4,37.6,0</coordinates></LineString>
            </MultiGeometry></Placemark>
          </Folder>
        </Document></kml>
        """;

    @Test
    void readsEntrancesStationsAndTrackSegments() {
        KmlParser.KmlData out = KmlParser.parse(FIXTURE);
        assertThat(out.entrances()).hasSize(2);
        assertThat(out.stations()).hasSize(1);
        assertThat(out.track()).hasSize(2);
        assertThat(out.track().get(0)).hasSize(3);
    }

    @Test
    void keepsLongitudeFirstAndDecodesNames() {
        KmlParser.KmlEntrance first = KmlParser.parse(FIXTURE).entrances().get(0);
        assertThat(first.name()).isEqualTo("B2 13th St & Broadway Entrance / Exit");
        assertThat(first.lon()).isEqualTo(-122.2717025);
        assertThat(first.lat()).isEqualTo(37.8033157);
    }

    @Test
    void decodesNumericEntities() {
        String kml = FIXTURE.replace("B2 13th St &amp; Broadway", "B2 13th St &#38; Broadway &#x26; Oak");
        assertThat(KmlParser.parse(kml).entrances().get(0).name()).isEqualTo("B2 13th St & Broadway & Oak Entrance / Exit");
    }

    @Test
    void decodesAmpersandLast() {
        assertThat(KmlParser.decode("&amp;lt;")).isEqualTo("&lt;");
    }

    @Test
    void takesTheStationCodeFromParentStationEvenAcrossLineBreaks() {
        KmlParser.KmlData out = KmlParser.parse(FIXTURE);
        assertThat(out.entrances().get(0).station()).isEqualTo("12TH");
        assertThat(out.entrances().get(1).station()).isEmpty(); // missing code is reported, not guessed
    }

    @Test
    void simplifyDropsPointsOnAStraightLineAndKeepsTheCorners() {
        List<LonLat> straight = pts(0, 0, 1, 0, 2, 0, 3, 0);
        assertThat(LineSimplifier.simplify(straight, 0.001)).isEqualTo(pts(0, 0, 3, 0));

        List<LonLat> corner = pts(0, 0, 1, 0, 2, 0, 2, 1, 2, 2);
        assertThat(LineSimplifier.simplify(corner, 0.001)).isEqualTo(pts(0, 0, 2, 0, 2, 2));
    }

    @Test
    void simplifyLeavesShortLinesAloneAndNeverMutatesItsInput() {
        List<LonLat> two = pts(0, 0, 1, 1);
        assertThat(LineSimplifier.simplify(two, 1)).isEqualTo(two);
        List<LonLat> original = new ArrayList<>(pts(0, 0, 1, 0, 2, 0));
        LineSimplifier.simplify(original, 0.001);
        assertThat(original).hasSize(3);
    }

    private static List<LonLat> pts(double... xy) {
        List<LonLat> out = new ArrayList<>();
        for (int i = 0; i < xy.length; i += 2) {
            out.add(new LonLat(xy[i], xy[i + 1]));
        }
        return out;
    }
}
