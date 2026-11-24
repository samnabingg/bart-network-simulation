package com.transittwin.api;

import com.transittwin.departures.LiveDataUnavailableException;
import com.transittwin.live.LiveStatus;
import com.transittwin.live.LiveStatusService;
import com.transittwin.live.LiveTrain;
import com.transittwin.live.LiveTrainService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/live")
@Tag(name = "Live", description = "Trains estimated from BART's real-time departures")
public class LiveController {

    /** @param asOf the server time the positions were computed for; the browser extrapolates from it */
    public record LiveTrainsResponse(Instant asOf, Instant fetchedAt, List<LiveTrain> trains) {
    }

    private final LiveStatusService status;
    private final LiveTrainService trains;
    private final Clock clock;

    public LiveController(LiveStatusService status, LiveTrainService trains, Clock clock) {
        this.status = status;
        this.trains = trains;
        this.clock = clock;
    }

    @GetMapping("/status")
    @Operation(summary = "Whether live data is configured and fresh")
    public ResponseEntity<LiveStatus> status() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(status.status());
    }

    @GetMapping("/trains")
    @Operation(summary = "Estimated positions of every live train (503 when live data is unavailable)")
    public ResponseEntity<LiveTrainsResponse> trains() {
        LiveStatus s = status.status();
        if (!s.available()) {
            throw new LiveDataUnavailableException(s.error() != null ? s.error() : "No live data");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(new LiveTrainsResponse(clock.instant(), s.fetchedAt(), trains.trains()));
    }
}
