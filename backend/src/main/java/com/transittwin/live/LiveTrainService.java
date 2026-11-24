package com.transittwin.live;

import com.transittwin.departures.DepartureRow;
import com.transittwin.network.NetworkModel;
import com.transittwin.network.NetworkService;
import com.transittwin.network.Trip;
import com.transittwin.network.TripRef;
import com.transittwin.network.TripResolver;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * Estimates where every train is from all stations' departure boards.
 * <p>
 * For each line and direction, a train due at station S in less than the running time from the
 * previous station must be on that stretch of track; "Leaving" (0 min) means it is standing at S.
 * Only the soonest train per line, direction and station counts, so one train is drawn once.
 * A train on the last stretch into a terminal can't be placed: the data only lists departures.
 */
@Service
public class LiveTrainService {

    private final NetworkService network;
    private final LiveDepartureStore store;
    private final Clock clock;

    public LiveTrainService(NetworkService network, LiveDepartureStore store, Clock clock) {
        this.network = network;
        this.store = store;
        this.clock = clock;
    }

    public List<LiveTrain> trains() {
        return estimate(network.model(), store.snapshot().values(), clock.instant());
    }

    public static List<LiveTrain> estimate(NetworkModel model, Collection<DepartureSnapshotEvent> boards, Instant now) {
        record Soonest(TripRef trip, String abbr, DepartureRow row, double elapsedSec) {
        }
        Map<String, Soonest> soonest = new LinkedHashMap<>();
        for (DepartureSnapshotEvent board : boards) {
            double elapsed = Math.max(0, Duration.between(board.fetchedAt(), now).toMillis() / 1000.0);
            for (DepartureRow r : board.rows()) {
                if (r.cancelled() || r.minutes() == null) {
                    continue;
                }
                TripRef trip = TripResolver.resolve(model, board.station(), r.destAbbr(), r.hex(), r.direction()).orElse(null);
                if (trip == null) {
                    continue;
                }
                String key = trip.line() + ":" + trip.dir() + ":" + board.station();
                Soonest cur = soonest.get(key);
                if (cur == null || r.minutes() < cur.row().minutes()) {
                    soonest.put(key, new Soonest(trip, board.station(), r, elapsed));
                }
            }
        }

        List<LiveTrain> out = new ArrayList<>();
        for (Soonest s : soonest.values()) {
            Trip t = model.trip(s.trip().line(), s.trip().dir());
            int i = t.stops().indexOf(s.abbr());
            String hex = model.lines().get(s.trip().line()).hex();
            String key4 = s.trip().line() + "-" + s.trip().dir();
            DepartureRow r = s.row();
            Integer cars = parseCars(r.cars());
            double remain = r.minutes() * 60 - s.elapsedSec();
            if (r.minutes() == 0 || remain <= 0) {
                String next = i + 1 < t.stops().size() ? t.stops().get(i + 1) : null;
                out.add(new LiveTrain(key4 + "@" + s.abbr(), s.trip().line(), s.trip().dir(), hex, r.destAbbr(), cars,
                    r.delaySec(), s.abbr(), s.abbr(), s.abbr(), 0, next, t.run()[i], 0));
            } else if (i > 0 && remain < t.run()[i]) {
                out.add(new LiveTrain(key4 + ">" + s.abbr(), s.trip().line(), s.trip().dir(), hex, r.destAbbr(), cars,
                    r.delaySec(), t.stops().get(i - 1), s.abbr(), null, 1 - remain / t.run()[i], s.abbr(), t.run()[i], remain));
            }
        }
        out.sort(Comparator.comparing(LiveTrain::id));
        return out;
    }

    private static Integer parseCars(String cars) {
        if (cars == null) {
            return null;
        }
        try {
            int n = Integer.parseInt(cars.trim());
            return n > 0 ? n : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
