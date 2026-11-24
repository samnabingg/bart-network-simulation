package com.transittwin.api;

import com.transittwin.geo.GeoDocument;
import com.transittwin.network.LineDef;
import com.transittwin.network.NetworkModel;
import com.transittwin.network.NetworkService;
import com.transittwin.network.StationInfo;
import com.transittwin.network.TrackPath;
import com.transittwin.network.Trip;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Network", description = "Stations, lines, track and the running-time model")
public class NetworkController {

    /** Everything the browser needs to draw the network and run the demo trains. */
    public record NetworkResponse(
        List<StationInfo> stations,
        List<LineDef> lines,
        Map<String, TrackPath> paths,
        Map<String, Trip> timetable,
        int dwellSec) {
    }

    private static final CacheControl REFERENCE_CACHE = CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic();

    private final NetworkService network;

    public NetworkController(NetworkService network) {
        this.network = network;
    }

    @GetMapping("/network")
    @Operation(summary = "Stations, lines, track paths between neighbouring stations, and the timetable model")
    public ResponseEntity<NetworkResponse> network() {
        NetworkModel m = network.model();
        NetworkResponse body = new NetworkResponse(
            List.copyOf(m.stations().values()),
            List.copyOf(m.lines().values()),
            m.paths(),
            m.timetable(),
            com.transittwin.network.Timetables.DWELL_SEC);
        return ResponseEntity.ok().cacheControl(REFERENCE_CACHE).body(body);
    }

    @GetMapping("/geo")
    @Operation(summary = "Track centerlines and station entrances, from BART's KML (same shape as the old geo.json)")
    public ResponseEntity<GeoDocument> geo() {
        return ResponseEntity.ok().cacheControl(REFERENCE_CACHE).body(network.model().geo());
    }
}
