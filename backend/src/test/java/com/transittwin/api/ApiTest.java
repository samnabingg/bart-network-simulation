package com.transittwin.api;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ApiTest {

    @Autowired
    MockMvc mvc;

    @Test
    void networkHasStationsLinesPathsAndTimetable() throws Exception {
        mvc.perform(get("/api/network"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.stations", hasSize(50)))
            .andExpect(jsonPath("$.lines", hasSize(6)))
            .andExpect(jsonPath("$.lines[0].id").value("yellow"))
            .andExpect(jsonPath("$.paths['BAYF>SANL'].onTrack").value(true))
            .andExpect(jsonPath("$.paths['BAYF>SANL'].pts[0]", hasSize(2))) // [lon, lat]
            .andExpect(jsonPath("$.timetable['blue:0'].total", greaterThan(3000)))
            .andExpect(header().string("Cache-Control", "max-age=600, public"));
    }

    @Test
    void importedLayoutsAreServedWithTheirOsmCredit() throws Exception {
        mvc.perform(get("/api/stations/mcar/layout"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.abbr").value("MCAR"))
            .andExpect(jsonPath("$.layout").value("island"))
            .andExpect(jsonPath("$.platforms", hasSize(2)))
            .andExpect(jsonPath("$.source.attribution").value("© OpenStreetMap contributors"));
        mvc.perform(get("/api/stations/ZZZ/layout"))
            .andExpect(status().isNotFound());
    }

    @Test
    void rideProfileHasTunnelsAndDoorSides() throws Exception {
        mvc.perform(get("/api/stations/ride-profile"))
            .andExpect(status().isOk())
            // San Leandro has side platforms: the doors open on the right
            .andExpect(jsonPath("$.stations.SANL.layout").value("side"))
            .andExpect(jsonPath("$.stations.SANL.doors").value("right"))
            .andExpect(jsonPath("$.stations.LAKE.level").value("tunnel"))
            // Fruitvale to Lake Merritt ends in the tunnel under downtown Oakland
            .andExpect(jsonPath("$.legs['FTVL>LAKE'][-1:].kind").value(org.hamcrest.Matchers.contains("tunnel")))
            .andExpect(jsonPath("$.legs['WOAK>EMBR'][-1:].name").value(org.hamcrest.Matchers.contains("Transbay Tube")));
    }

    @Test
    void geoHasTrackAndEntrancesInTheOldGeoJsonShape() throws Exception {
        mvc.perform(get("/api/geo"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.track", hasSize(96)))
            .andExpect(jsonPath("$.entrances.BAYF[0].name", notNullValue()));
    }

    @Test
    void demoDeparturesAreMatchedToALineAndNextStop() throws Exception {
        mvc.perform(get("/api/stations/bayf/departures").param("t", "1800000000"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.station").value("BAYF"))
            .andExpect(jsonPath("$.source").value("demo"))
            .andExpect(jsonPath("$.simTime").value(1.8e9))
            .andExpect(jsonPath("$.rows[*].nextStop", everyItem(notNullValue())))
            .andExpect(jsonPath("$.rows[0].timeLabel").value("Leaving"));
    }

    @Test
    void liveDeparturesAre503WithoutAKey() throws Exception {
        mvc.perform(get("/api/stations/BAYF/departures").param("source", "live"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.detail").value("BART_API_KEY is not set on the server"));
        mvc.perform(get("/api/live/trains")).andExpect(status().isServiceUnavailable());
        mvc.perform(get("/api/live/status"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.configured").value(false))
            .andExpect(jsonPath("$.available").value(false));
    }

    @Test
    void badInputIsAProblemDetail() throws Exception {
        mvc.perform(get("/api/stations/TOOLONG/departures"))
            .andExpect(status().isBadRequest())
            .andExpect(header().string("Content-Type", MediaType.APPLICATION_PROBLEM_JSON_VALUE));
        mvc.perform(get("/api/stations/BAYF/departures").param("source", "maybe")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/stations/BAYF/departures").param("t", "-5")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/stations/ZZZ/departures"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.title").value("Unknown station"));
    }

    @Test
    void correlationIdIsEchoedOrGenerated() throws Exception {
        mvc.perform(get("/api/live/status").header("X-Correlation-Id", "abc-123"))
            .andExpect(header().string("X-Correlation-Id", "abc-123"));
        mvc.perform(get("/api/live/status").header("X-Correlation-Id", "bad id\nwith newline"))
            .andExpect(header().string("X-Correlation-Id", org.hamcrest.Matchers.matchesPattern("[0-9a-f-]{36}")));
    }
}
