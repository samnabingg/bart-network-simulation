package com.transittwin.live;

import com.transittwin.departures.DepartureRow;
import java.time.Instant;
import java.util.List;

/**
 * One station's departure board at one moment, as read from BART. Published once per station per
 * poll, keyed by station code, so a station's snapshots stay in order on one Kafka partition.
 */
public record DepartureSnapshotEvent(String station, Instant fetchedAt, List<DepartureRow> rows) {

    public DepartureSnapshotEvent {
        rows = rows == null ? List.of() : List.copyOf(rows);
    }
}
