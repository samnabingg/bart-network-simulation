package com.transittwin.api;

import com.transittwin.departures.DepartureService;
import com.transittwin.departures.DepartureService.Departures;
import com.transittwin.departures.DepartureService.Source;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import java.util.Locale;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stations")
@Tag(name = "Departures", description = "Station departure boards, live or from the demo timetable")
public class DepartureController {

    private final DepartureService departures;

    public DepartureController(DepartureService departures) {
        this.departures = departures;
    }

    @GetMapping("/{abbr}/departures")
    @Operation(summary = "Departures for a station, each matched to its line and next stop")
    public ResponseEntity<Departures> departures(
        @PathVariable @Pattern(regexp = "[A-Za-z0-9]{2,4}", message = "must be a 2 to 4 character station code") String abbr,
        @Parameter(description = "live (BART's estimates, 503 if unavailable) or demo (simulated timetable)")
        @RequestParam(defaultValue = "demo") @Pattern(regexp = "live|demo", message = "must be live or demo") String source,
        @Parameter(description = "Demo only: simulated time in epoch seconds; defaults to now")
        @RequestParam(required = false) @Positive Double t) {
        Departures body = departures.departures(abbr.toUpperCase(Locale.ROOT),
            "live".equals(source) ? Source.LIVE : Source.DEMO, t);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
