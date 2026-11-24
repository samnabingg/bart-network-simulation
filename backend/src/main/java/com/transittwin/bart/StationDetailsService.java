package com.transittwin.bart;

import com.transittwin.reference.Station;
import com.transittwin.reference.StationRepository;
import java.time.Clock;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Writes BART's official station coordinates and addresses over the entrance-based estimates. */
@Service
public class StationDetailsService {

    private final StationRepository stations;
    private final Clock clock;

    public StationDetailsService(StationRepository stations, Clock clock) {
        this.stations = stations;
        this.clock = clock;
    }

    /** Returns how many known stations were updated. Unknown station codes are ignored. */
    @Transactional
    public int applyApiStations(List<BartResponseParser.ParsedStation> parsed) {
        int updated = 0;
        for (BartResponseParser.ParsedStation p : parsed) {
            Station s = stations.findById(p.abbr()).orElse(null);
            if (s != null) {
                s.applyApiDetails(p.lat(), p.lon(), p.address(), p.city(), clock.instant());
                updated++;
            }
        }
        return updated;
    }
}
