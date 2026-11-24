package com.transittwin.live;

import com.fasterxml.jackson.databind.JsonNode;
import com.transittwin.bart.BartApiClient;
import com.transittwin.bart.BartApiException;
import com.transittwin.bart.BartProperties;
import com.transittwin.bart.BartResponseParser;
import com.transittwin.departures.DepartureRow;
import io.github.resilience4j.circuitbreaker.CallNotPermittedException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Every 30 seconds, reads departures for every station in one request (etd orig=ALL) and
 * publishes one snapshot per station. This replaces the browser polling the API itself: one
 * server poll feeds every viewer.
 */
@Component
public class EtdPoller {

    private static final Logger log = LoggerFactory.getLogger(EtdPoller.class);

    private final BartApiClient client;
    private final BartProperties props;
    private final DeparturePublisher publisher;
    private final LiveStatusService status;
    private final Clock clock;

    public EtdPoller(BartApiClient client, BartProperties props, DeparturePublisher publisher,
                     LiveStatusService status, Clock clock) {
        this.client = client;
        this.props = props;
        this.publisher = publisher;
        this.status = status;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "${bart.poll-interval}", initialDelayString = "${bart.initial-delay:PT2S}")
    public void scheduledPoll() {
        if (props.hasKey()) {
            poll();
        }
    }

    /** Returns the number of stations published, or -1 if the poll failed. */
    public int poll() {
        try {
            JsonNode data = client.fetchAllDepartures();
            Map<String, List<DepartureRow>> byStation = BartResponseParser.parseAllDepartures(data);
            if (byStation.isEmpty()) {
                String msg = BartResponseParser.parseMessage(data);
                throw new BartApiException(msg.isEmpty() ? "no stations in the response" : msg);
            }
            Instant at = clock.instant();
            byStation.forEach((abbr, rows) -> publisher.publish(new DepartureSnapshotEvent(abbr, at, rows)));
            status.recordSuccess();
            log.debug("Published departures for {} stations", byStation.size());
            return byStation.size();
        } catch (CallNotPermittedException e) {
            status.recordFailure("BART API is failing; paused for a minute before trying again");
        } catch (RuntimeException e) {
            status.recordFailure(e.getMessage());
            log.warn("Live departures poll failed: {}", e.getMessage());
        }
        return -1;
    }
}
