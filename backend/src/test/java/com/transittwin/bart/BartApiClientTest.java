package com.transittwin.bart;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class BartApiClientTest {

    @Test
    void networkFailuresDoNotLeakTheKey() {
        // Port 1 refuses connections. RestClient's own message would include the URL and the key.
        BartProperties props = new BartProperties("very-secret", "http://localhost:1/api",
            Duration.ofSeconds(30), Duration.ofHours(1), Duration.ofSeconds(2), Duration.ofSeconds(2));
        BartApiClient client = new BartApiClient(RestClient.builder(), props, new ObjectMapper());

        assertThatThrownBy(client::fetchAllDepartures)
            .isInstanceOf(BartApiException.class)
            .hasMessageStartingWith("Could not reach the BART API")
            .hasMessageNotContaining("very-secret");
    }

    @Test
    void noKeyMeansNoCall() {
        BartProperties props = new BartProperties("", "http://localhost:1/api",
            Duration.ofSeconds(30), Duration.ofHours(1), Duration.ofSeconds(2), Duration.ofSeconds(2));
        BartApiClient client = new BartApiClient(RestClient.builder(), props, new ObjectMapper());

        assertThatThrownBy(client::fetchStations).isInstanceOf(BartClientErrorException.class);
    }
}
