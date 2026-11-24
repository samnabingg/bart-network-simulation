package com.transittwin.network;

import static org.assertj.core.api.Assertions.assertThat;

import com.transittwin.departures.DemoSchedule;
import com.transittwin.departures.DepartureRow;
import com.transittwin.live.DepartureSnapshotEvent;
import com.transittwin.live.LiveTrain;
import com.transittwin.live.LiveTrainService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** The prototype's network.test.mjs, run against the model built from the database. */
@SpringBootTest
@ActiveProfiles("test")
class NetworkSimulationTest {

    private static final double T = 1_800_000_000;

    @Autowired
    NetworkService network;

    NetworkModel model;

    @BeforeEach
    void setUp() {
        model = network.model();
    }

    @Test
    void everyStationOnEveryLineIsAKnownStationWithCoordinates() {
        for (LineDef line : model.lines().values()) {
            for (String s : line.stops()) {
                assertThat(model.stations()).as(line.id() + ": unknown station " + s).containsKey(s);
                assertThat(model.stations().get(s).hasPosition()).as(line.id() + ": no coordinates for " + s).isTrue();
            }
        }
        assertThat(model.stations()).hasSize(50);
        assertThat(model.lines()).hasSize(6);
    }

    @Test
    void everyStretchBetweenNeighbouringStationsFollowsTheTrackWithoutDetours() {
        for (LineDef line : model.lines().values()) {
            for (int i = 1; i < line.stops().size(); i++) {
                String key = line.stops().get(i - 1) + ">" + line.stops().get(i);
                assertThat(model.paths()).as("missing " + key).containsKey(key);
                assertThat(model.paths().get(key).onTrack()).as(key + " fell back to a straight line").isTrue();
            }
        }
    }

    @Test
    void endToEndTripTimesAreInABelievableRange() {
        double yellow = model.trip("yellow", 0).total() / 60.0;
        double blue = model.trip("blue", 0).total() / 60.0;
        assertThat(yellow).isBetween(80.0, 115.0);
        assertThat(blue).isBetween(50.0, 80.0);
    }

    @Test
    void demoDeparturesCountDownAndNeverListATerminalAsADeparture() {
        List<DepartureRow> rows = DemoSchedule.departures(model, "BAYF", T, 3);
        assertThat(rows.size()).isGreaterThanOrEqualTo(4);
        for (int i = 1; i < rows.size(); i++) {
            assertThat(rows.get(i).minutes()).isGreaterThanOrEqualTo(rows.get(i - 1).minutes());
        }
        assertThat(rows.stream().map(DepartureRow::destAbbr).distinct().count()).isGreaterThanOrEqualTo(3);
        assertThat(DemoSchedule.departures(model, "OAKL", T, 3)).noneMatch(r -> r.destAbbr().equals("OAKL"));
        assertThat(rows).allSatisfy(r -> assertThat(r.nextStop()).isNotNull());
    }

    @Test
    void demoDeparturesAreDeterministic() {
        assertThat(DemoSchedule.departures(model, "MONT", T, 3)).isEqualTo(DemoSchedule.departures(model, "MONT", T, 3));
    }

    @Test
    void liveTrainsAreMatchedToTheRightLineRedAndYellowIncluded() {
        assertThat(TripResolver.resolve(model, "BAYF", "DALY", "#0099cc", "North")).contains(new TripRef("blue", 0));
        assertThat(TripResolver.resolve(model, "BAYF", "DALY", "#339933", "North")).contains(new TripRef("green", 0));
        assertThat(TripResolver.resolve(model, "CONC", "MLBR", "#ffff33", "South")).contains(new TripRef("yellow", 0));
        assertThat(TripResolver.nextStop(model, "BAYF", "BERY", "#339933", "South")).map(NextStop::abbr).contains("HAYW");
        assertThat(TripResolver.nextStop(model, "BAYF", "DUBL", "#0099cc", "South")).map(NextStop::abbr).contains("CAST");
        assertThat(TripResolver.nextStop(model, "SFIA", "SFIA", "#ffff33", "South")).isEmpty();
    }

    @Test
    void livePositionsOneTrainPerStretchLeavingMeansAtThePlatform() {
        Instant now = Instant.ofEpochSecond((long) T);
        List<DepartureSnapshotEvent> boards = List.of(
            board("SANL", now, row("DALY", 1, "#0099cc", "North")), // between Bay Fair and San Leandro
            board("COLS", now, row("DALY", 5, "#0099cc", "North")), // same train further on: must not be drawn twice
            board("HAYW", now, row("BERY", 0, "#339933", "South"))); // standing at Hayward

        List<LiveTrain> trains = LiveTrainService.estimate(model, boards, now);

        assertThat(trains).hasSize(2);
        LiveTrain blue = trains.stream().filter(t -> t.line().equals("blue")).findFirst().orElseThrow();
        assertThat(blue.from()).isEqualTo("BAYF");
        assertThat(blue.to()).isEqualTo("SANL");
        assertThat(blue.progress()).isStrictlyBetween(0.0, 1.0);
        assertThat(blue.remainSec()).isEqualTo(60.0);
        assertThat(trains.stream().filter(t -> t.line().equals("green")).findFirst().orElseThrow().at()).isEqualTo("HAYW");
    }

    @Test
    void liveTrainsAgeWithTheData() {
        Instant fetched = Instant.ofEpochSecond((long) T);
        List<DepartureSnapshotEvent> boards = List.of(board("SANL", fetched, row("DALY", 1, "#0099cc", "North")));

        LiveTrain fresh = LiveTrainService.estimate(model, boards, fetched).get(0);
        LiveTrain later = LiveTrainService.estimate(model, boards, fetched.plusSeconds(30)).get(0);
        LiveTrain arrived = LiveTrainService.estimate(model, boards, fetched.plusSeconds(61)).get(0);

        assertThat(later.progress()).isGreaterThan(fresh.progress());
        assertThat(arrived.at()).isEqualTo("SANL");
    }

    private static DepartureRow row(String destAbbr, int minutes, String hex, String direction) {
        return new DepartureRow(destAbbr, destAbbr, minutes, DepartureRow.timeLabel(minutes), "2", direction, "9", null,
            hex, 0, false, null, null);
    }

    private static DepartureSnapshotEvent board(String abbr, Instant at, DepartureRow... rows) {
        return new DepartureSnapshotEvent(abbr, at, List.of(rows));
    }
}
