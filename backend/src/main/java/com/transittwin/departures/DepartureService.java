package com.transittwin.departures;

import com.transittwin.live.DepartureSnapshotEvent;
import com.transittwin.live.LiveDepartureStore;
import com.transittwin.live.LiveStatus;
import com.transittwin.live.LiveStatusService;
import com.transittwin.network.NetworkModel;
import com.transittwin.network.NetworkService;
import com.transittwin.network.TripRef;
import com.transittwin.network.TripResolver;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.stereotype.Service;

/** Station departure boards from either source, each row matched to its line and next stop. */
@Service
public class DepartureService {

    public enum Source { LIVE, DEMO }

    public record Departures(String station, String stationName, String source, Instant fetchedAt,
                             Double simTime, List<DepartureRow> rows) {
    }

    static final int DEMO_PER_TRIP = 3;

    private final NetworkService network;
    private final LiveDepartureStore store;
    private final LiveStatusService status;
    private final Clock clock;

    public DepartureService(NetworkService network, LiveDepartureStore store, LiveStatusService status, Clock clock) {
        this.network = network;
        this.store = store;
        this.status = status;
        this.clock = clock;
    }

    /**
     * @param simTime demo only: simulated time in epoch seconds (the browser's demo clock can run 60x);
     *                defaults to now
     */
    public Departures departures(String abbr, Source source, Double simTime) {
        NetworkModel model = network.model();
        if (!model.stations().containsKey(abbr)) {
            throw new StationNotFoundException(abbr);
        }
        String name = model.stationName(abbr);
        if (source == Source.DEMO) {
            double t = simTime != null ? simTime : clock.millis() / 1000.0;
            return new Departures(abbr, name, "demo", null, t, DemoSchedule.departures(model, abbr, t, DEMO_PER_TRIP));
        }

        LiveStatus live = status.status();
        if (!live.available()) {
            throw new LiveDataUnavailableException(live.error() != null ? live.error() : "No live data");
        }
        DepartureSnapshotEvent board = store.forStation(abbr).orElse(null);
        if (board == null) {
            return new Departures(abbr, name, "live", live.fetchedAt(), null, List.of());
        }
        List<DepartureRow> rows = board.rows().stream().map(r -> withTrip(model, abbr, r)).toList();
        return new Departures(abbr, name, "live", board.fetchedAt(), null, rows);
    }

    private static DepartureRow withTrip(NetworkModel model, String abbr, DepartureRow r) {
        TripRef trip = TripResolver.resolve(model, abbr, r.destAbbr(), r.hex(), r.direction()).orElse(null);
        if (trip == null) {
            return r;
        }
        return r.withTrip(trip.line(), TripResolver.nextStopOn(model, trip, abbr).orElse(null));
    }
}
