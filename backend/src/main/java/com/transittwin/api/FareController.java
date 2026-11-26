package com.transittwin.api;

import com.transittwin.fares.Fare;
import com.transittwin.fares.FareService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.util.Locale;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Validated
@RequestMapping("/api/fares")
@Tag(name = "Fares", description = "Real BART fares from its schedule API")
public class FareController {

    private final FareService fares;

    public FareController(FareService fares) {
        this.fares = fares;
    }

    @GetMapping
    @Operation(summary = "Today's Clipper fare between two stations (503 when BART can't be asked)")
    public ResponseEntity<Fare> fare(
        @RequestParam @Pattern(regexp = "[A-Za-z0-9]{2,4}", message = "must be a 2 to 4 character station code") String orig,
        @RequestParam @Pattern(regexp = "[A-Za-z0-9]{2,4}", message = "must be a 2 to 4 character station code") String dest) {
        Fare fare = fares.fare(orig.toUpperCase(Locale.ROOT), dest.toUpperCase(Locale.ROOT));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1))).body(fare);
    }
}
