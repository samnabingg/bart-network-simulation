package com.transittwin.live;

import com.transittwin.bart.BartProperties;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.stereotype.Service;

/** Tracks poll outcomes and decides whether live data is fresh enough to show. */
@Service
public class LiveStatusService {

    /** Older than this, live data is treated as gone (several polls missed). */
    public static final Duration MAX_AGE = Duration.ofMinutes(3);

    private final BartProperties props;
    private final LiveDepartureStore store;
    private final Clock clock;

    private volatile String lastError;

    public LiveStatusService(BartProperties props, LiveDepartureStore store, Clock clock) {
        this.props = props;
        this.store = store;
        this.clock = clock;
    }

    public void recordSuccess() {
        lastError = null;
    }

    public void recordFailure(String message) {
        lastError = message;
    }

    public LiveStatus status() {
        Instant latest = store.latestFetch().orElse(null);
        boolean fresh = latest != null && Duration.between(latest, clock.instant()).compareTo(MAX_AGE) <= 0;
        String error = props.hasKey() ? lastError : "BART_API_KEY is not set on the server";
        if (props.hasKey() && !fresh && error == null) {
            error = latest == null ? "Waiting for the first live update" : "Live data is out of date";
        }
        return new LiveStatus(props.hasKey(), props.hasKey() && fresh, latest, error, store.size());
    }
}
