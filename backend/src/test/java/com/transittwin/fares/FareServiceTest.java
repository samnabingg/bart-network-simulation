package com.transittwin.fares;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class FareServiceTest {

    private final ObjectMapper json = new ObjectMapper();

    @Test
    void readsTheAdultClipperFare() throws Exception {
        // Trimmed from a real sched.aspx?cmd=fare&orig=BAYF&dest=DALY answer.
        String body = """
            {"root":{"origin":"BAYF","destination":"DALY","trip":{"fare":"6.90","discount":{"clipper":"2.55"}},
             "fares":{"@level":"normal","fare":[
               {"@amount":"6.90","@class":"clipper","@name":"Clipper"},
               {"@amount":"3.45","@class":"start","@name":"Clipper START"},
               {"@amount":"2.55","@class":"rtcclipper","@name":"Senior/Disabled Clipper"}]}}}""";
        assertThat(FareService.parseClipperFare(json.readTree(body))).isEqualByComparingTo(new BigDecimal("6.90"));
    }

    @Test
    void fallsBackToTheTripFareAndRejectsJunk() throws Exception {
        assertThat(FareService.parseClipperFare(json.readTree("{\"root\":{\"trip\":{\"fare\":\"2.55\"}}}")))
            .isEqualByComparingTo(new BigDecimal("2.55"));
        assertThat(FareService.parseClipperFare(json.readTree("{\"root\":{\"trip\":{\"fare\":\"n/a\"}}}"))).isNull();
    }
}
