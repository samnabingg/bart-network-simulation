package com.transittwin.api;

import com.transittwin.layout.StationLayout;
import com.transittwin.layout.StationLayoutService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Pattern;
import java.time.Duration;
import java.util.Locale;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@Validated
@RequestMapping("/api/stations")
@Tag(name = "Layouts", description = "Station layouts imported from OpenStreetMap (© OpenStreetMap contributors, ODbL)")
public class StationLayoutController {

    private final StationLayoutService layouts;

    public StationLayoutController(StationLayoutService layouts) {
        this.layouts = layouts;
    }

    @GetMapping("/{abbr}/layout")
    @Operation(summary = "Platforms, tracks, entrances, escalators, elevators and gates in station meters (404 if not imported)")
    public ResponseEntity<StationLayout> layout(
        @PathVariable @Pattern(regexp = "[A-Za-z0-9]{2,4}", message = "must be a 2 to 4 character station code") String abbr) {
        String code = abbr.toUpperCase(Locale.ROOT);
        StationLayout l = layouts.layout(code).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "No layout has been imported for " + code));
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofHours(1))).body(l);
    }
}
