package com.transittwin.bart;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.transittwin.departures.DepartureRow;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Fixtures follow the sample responses in the BART Legacy API docs. */
class BartResponseParserTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    static final String STATIONS = """
        {"root": {"stations": {"station": [
          {"name": "Warm Springs / South Fremont", "abbr": "WARM", "gtfs_latitude": "37.502171", "gtfs_longitude": "-121.939313", "address": "45193 Warm Springs Blvd", "city": "Fremont"},
          {"name": "12th St. Oakland City Center", "abbr": "12TH", "gtfs_latitude": "37.803768", "gtfs_longitude": "-122.271450", "address": "1245 Broadway", "city": "Oakland"},
          {"name": "Broken", "abbr": "BAD", "gtfs_latitude": "n/a", "gtfs_longitude": ""}
        ]}, "message": ""}}
        """;

    static final String RICHMOND = """
        {"name": "Richmond", "abbr": "RICH", "etd": [
          {"destination": "Fremont", "abbreviation": "FRMT", "estimate": [
            {"minutes": "13", "platform": "2", "direction": "South", "length": "4", "color": "ORANGE", "hexcolor": "#ff9933", "delay": "0", "cancelflag": "0"},
            {"minutes": "Leaving", "platform": "2", "direction": "South", "length": "4", "color": "ORANGE", "hexcolor": "#ff9933", "delay": "238", "cancelflag": "0"}
          ]},
          {"destination": "Millbrae", "abbreviation": "MLBR",
           "estimate": {"minutes": "6", "platform": "2", "direction": "South", "length": "5", "color": "RED", "hexcolor": "not-a-color", "delay": "0", "cancelflag": "1"}}
        ]}
        """;

    static final String ETD = "{\"root\": {\"station\": [" + RICHMOND + "], \"message\": \"\"}}";

    private static JsonNode json(String s) throws Exception {
        return JSON.readTree(s);
    }

    @Test
    void toArrayHandlesMissingSingleAndListValues() throws Exception {
        assertThat(BartResponseParser.toArray(null)).isEmpty();
        assertThat(BartResponseParser.toArray(json("\"\""))).isEmpty();
        assertThat(BartResponseParser.toArray(json("{\"a\":1}"))).hasSize(1);
        assertThat(BartResponseParser.toArray(json("[1,2]"))).hasSize(2);
    }

    @Test
    void parseStationsSortsByNameAndDropsStationsWithoutUsableCoordinates() throws Exception {
        List<BartResponseParser.ParsedStation> stations = BartResponseParser.parseStations(json(STATIONS));
        assertThat(stations).extracting(BartResponseParser.ParsedStation::abbr).containsExactly("12TH", "WARM");
        assertThat(stations.get(0).lat()).isEqualTo(37.803768);
        assertThat(stations.get(0).lon()).isEqualTo(-122.27145);
    }

    @Test
    void parseStationsAcceptsASingleStationReturnedAsAnObject() throws Exception {
        JsonNode one = json(STATIONS);
        JsonNode first = one.path("root").path("stations").path("station").get(0);
        String wrapped = "{\"root\": {\"stations\": {\"station\": " + first + "}}}";
        assertThat(BartResponseParser.parseStations(json(wrapped))).hasSize(1);
    }

    @Test
    void parseStationsReturnsAnEmptyListForAnUnexpectedPayload() throws Exception {
        assertThat(BartResponseParser.parseStations(json("{}"))).isEmpty();
        assertThat(BartResponseParser.parseStations(null)).isEmpty();
    }

    @Test
    void parseDeparturesFlattensDestinationsAndSortsByMinutesLeavingFirst() throws Exception {
        BartResponseParser.StationDepartures out = BartResponseParser.parseDepartures(json(ETD));
        assertThat(out.stationName()).isEqualTo("Richmond");
        assertThat(out.rows()).extracting(DepartureRow::timeLabel).containsExactly("Leaving", "6 min", "13 min");
        assertThat(out.rows().get(0).delaySec()).isEqualTo(238);
    }

    @Test
    void parseDeparturesHandlesASingleEstimateObjectCancelledFlagAndBadColors() throws Exception {
        DepartureRow millbrae = BartResponseParser.parseDepartures(json(ETD)).rows().stream()
            .filter(r -> r.destination().equals("Millbrae")).findFirst().orElseThrow();
        assertThat(millbrae.cancelled()).isTrue();
        assertThat(millbrae.hex()).matches("^#[0-9a-fA-F]{6}$"); // invalid color replaced by a safe fallback
    }

    @Test
    void parseDeparturesReportsAMessageWhenThereIsNoStation() throws Exception {
        BartResponseParser.StationDepartures out =
            BartResponseParser.parseDepartures(json("{\"root\": {\"message\": {\"warning\": \"No data matched your criteria.\"}}}"));
        assertThat(out.rows()).isEmpty();
        assertThat(out.message()).isEqualTo("No data matched your criteria.");
    }

    @Test
    void parseMessageReadsStringsWarningsAndErrorText() throws Exception {
        assertThat(BartResponseParser.parseMessage(json("{\"root\": {\"message\": \"hello\"}}"))).isEqualTo("hello");
        assertThat(BartResponseParser.parseMessage(json("{\"root\": {\"message\": {\"error\": {\"text\": \"Invalid key\"}}}}")))
            .isEqualTo("Invalid key");
        assertThat(BartResponseParser.parseMessage(json("{}"))).isEmpty();
    }

    @Test
    void rowsKeepTheDestinationStationCode() throws Exception {
        assertThat(BartResponseParser.parseDepartures(json(ETD)).rows())
            .filteredOn(r -> r.destination().equals("Fremont"))
            .allSatisfy(r -> assertThat(r.destAbbr()).isEqualTo("FRMT"));
    }

    @Test
    void parseAllDeparturesKeysEveryStationByItsCode() throws Exception {
        String bayFair = """
            {"name": "Bay Fair", "abbr": "BAYF", "etd": {"destination": "Daly City", "abbreviation": "DALY",
             "estimate": {"minutes": "4", "platform": "2", "direction": "North", "length": "9", "color": "BLUE", "hexcolor": "#0099cc", "delay": "0", "cancelflag": "0"}}}
            """;
        Map<String, List<DepartureRow>> all =
            BartResponseParser.parseAllDepartures(json("{\"root\": {\"station\": [" + RICHMOND + "," + bayFair + "]}}"));
        assertThat(all.keySet()).containsExactlyInAnyOrder("BAYF", "RICH");
        assertThat(all.get("BAYF").get(0).destAbbr()).isEqualTo("DALY");
        assertThat(all.get("BAYF").get(0).minutes()).isEqualTo(4);
        assertThat(BartResponseParser.parseAllDepartures(json("{}"))).isEmpty();
    }

    @Test
    void unparseableMinutesBecomeNullAndSortLast() throws Exception {
        String odd = """
            {"root": {"station": {"name": "X", "abbr": "XX", "etd": {"destination": "D", "abbreviation": "DD", "estimate": [
              {"minutes": "?", "hexcolor": "#000000"}, {"minutes": "2", "hexcolor": "#000000"}]}}}}
            """;
        List<DepartureRow> rows = BartResponseParser.parseAllDepartures(json(odd)).get("XX");
        assertThat(rows).extracting(DepartureRow::minutes).containsExactly(2, null);
        assertThat(rows.get(1).timeLabel()).isEqualTo("—");
    }
}
