package com.transittwin.bart;

import com.transittwin.network.NetworkService;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Refreshes station positions and addresses from BART once an hour (when a key is set). */
@Component
public class BartStationSync {

    private static final Logger log = LoggerFactory.getLogger(BartStationSync.class);

    private final BartApiClient client;
    private final BartProperties props;
    private final StationDetailsService details;
    private final NetworkService network;

    public BartStationSync(BartApiClient client, BartProperties props, StationDetailsService details, NetworkService network) {
        this.client = client;
        this.props = props;
        this.details = details;
        this.network = network;
    }

    @Scheduled(fixedDelayString = "${bart.station-sync-interval}", initialDelayString = "${bart.initial-delay:PT1S}")
    public void sync() {
        if (!props.hasKey()) {
            return;
        }
        try {
            List<BartResponseParser.ParsedStation> parsed = BartResponseParser.parseStations(client.fetchStations());
            if (parsed.isEmpty()) {
                log.warn("BART station list was empty; keeping the stored positions");
                return;
            }
            int updated = details.applyApiStations(parsed);
            network.rebuild();
            log.info("Updated {} stations from the BART station list", updated);
        } catch (RuntimeException e) {
            log.warn("BART station sync failed: {}", e.getMessage());
        }
    }
}
