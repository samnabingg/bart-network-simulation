package com.transittwin.live;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * The latest departure board per station, fed by the event consumer.
 * <p>
 * Applying is idempotent and order-safe: a snapshot that is not newer than the one already held
 * (a redelivery or a late message) is ignored, so Kafka's at-least-once delivery can't move the
 * board backwards.
 */
@Component
public class LiveDepartureStore {

    private final Map<String, DepartureSnapshotEvent> byStation = new ConcurrentHashMap<>();

    /** Returns true if the snapshot replaced what was held. */
    public boolean apply(DepartureSnapshotEvent event) {
        if (event == null || event.station() == null || event.fetchedAt() == null) {
            throw new IllegalArgumentException("Snapshot needs a station and a fetchedAt time");
        }
        boolean[] changed = {false};
        byStation.compute(event.station(), (k, held) -> {
            if (held == null || event.fetchedAt().isAfter(held.fetchedAt())) {
                changed[0] = true;
                return event;
            }
            return held;
        });
        return changed[0];
    }

    public Optional<DepartureSnapshotEvent> forStation(String abbr) {
        return Optional.ofNullable(byStation.get(abbr));
    }

    public Map<String, DepartureSnapshotEvent> snapshot() {
        return Map.copyOf(byStation);
    }

    public Optional<Instant> latestFetch() {
        return byStation.values().stream().map(DepartureSnapshotEvent::fetchedAt).max(Instant::compareTo);
    }

    public int size() {
        return byStation.size();
    }

    public void clear() {
        byStation.clear();
    }
}
