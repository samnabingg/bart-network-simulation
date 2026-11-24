package com.transittwin.bart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.sun.net.httpserver.HttpServer;
import com.transittwin.live.EtdPoller;
import com.transittwin.live.LiveDepartureStore;
import com.transittwin.live.LiveStatusService;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The whole live path against a stub BART server: poll, publish, consume, estimate trains, serve.
 * Also checks the resilience settings: retries, no retry on 4xx, circuit breaker, and that the
 * API key never shows up in an error.
 */
@SpringBootTest(properties = {
    "resilience4j.retry.instances.bart.wait-duration=10ms",
    "resilience4j.circuitbreaker.instances.bart.wait-duration-in-open-state=1h",
})
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BartIntegrationTest {

    private static final String KEY = "secret-test-key";

    private record Reply(int status, String body) {
    }

    private static final AtomicReference<Reply> REPLY = new AtomicReference<>();
    private static final AtomicInteger CALLS = new AtomicInteger();
    private static final AtomicReference<String> LAST_QUERY = new AtomicReference<>();
    private static final HttpServer STUB = startStub();

    /** SANL: blue train 1 min out (between Bay Fair and San Leandro). HAYW: green train leaving. */
    static final String ETD_ALL = """
        {"root": {"station": [
          {"name": "San Leandro", "abbr": "SANL", "etd": {"destination": "Daly City", "abbreviation": "DALY",
            "estimate": {"minutes": "1", "platform": "2", "direction": "North", "length": "9", "color": "BLUE", "hexcolor": "#0099cc", "delay": "0", "cancelflag": "0"}}},
          {"name": "Hayward", "abbr": "HAYW", "etd": {"destination": "Berryessa", "abbreviation": "BERY",
            "estimate": {"minutes": "Leaving", "platform": "1", "direction": "South", "length": "10", "color": "GREEN", "hexcolor": "#339933", "delay": "120", "cancelflag": "0"}}},
          {"name": "Bay Fair", "abbr": "BAYF", "etd": [
            {"destination": "Dublin/Pleasanton", "abbreviation": "DUBL",
             "estimate": {"minutes": "7", "platform": "1", "direction": "South", "length": "9", "color": "BLUE", "hexcolor": "#0099cc", "delay": "0", "cancelflag": "0"}},
            {"destination": "Berryessa", "abbreviation": "BERY",
             "estimate": {"minutes": "3", "platform": "1", "direction": "South", "length": "10", "color": "GREEN", "hexcolor": "#339933", "delay": "0", "cancelflag": "0"}}
          ]}
        ], "message": ""}}
        """;

    @DynamicPropertySource
    static void bart(DynamicPropertyRegistry registry) {
        registry.add("bart.api-key", () -> KEY);
        registry.add("bart.base-url", () -> "http://localhost:" + STUB.getAddress().getPort() + "/api");
    }

    @Autowired
    MockMvc mvc;
    @Autowired
    EtdPoller poller;
    @Autowired
    LiveDepartureStore store;
    @Autowired
    LiveStatusService status;
    @Autowired
    CircuitBreakerRegistry breakers;

    @BeforeEach
    void reset() {
        breakers.circuitBreaker(BartApiClient.RESILIENCE_NAME).reset();
        store.clear();
        status.recordSuccess();
        CALLS.set(0);
        REPLY.set(new Reply(200, ETD_ALL));
    }

    @AfterAll
    static void stop() {
        STUB.stop(0);
    }

    @Test
    void pollPublishesEveryStationAndTheApiServesLiveTrainsAndBoards() throws Exception {
        assertThat(poller.poll()).isEqualTo(3);
        assertThat(LAST_QUERY.get()).contains("cmd=etd", "orig=ALL", "key=" + KEY, "json=y");

        mvc.perform(get("/api/live/status"))
            .andExpect(jsonPath("$.configured").value(true))
            .andExpect(jsonPath("$.available").value(true))
            .andExpect(jsonPath("$.stations").value(3));

        mvc.perform(get("/api/live/trains"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.trains.length()").value(greaterThan(1)))
            .andExpect(jsonPath("$.trains[?(@.line == 'blue' && @.to == 'SANL')].from").value("BAYF"))
            .andExpect(jsonPath("$.trains[?(@.id == 'green-1@HAYW')].at").value("HAYW"))
            // the green train due at Bay Fair in 3 minutes is on the stretch from San Leandro
            .andExpect(jsonPath("$.trains[?(@.id == 'green-1>BAYF')].from").value("SANL"));

        mvc.perform(get("/api/stations/BAYF/departures").param("source", "live"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.source").value("live"))
            .andExpect(jsonPath("$.rows[0].destAbbr").value("BERY"))
            .andExpect(jsonPath("$.rows[0].nextStop.abbr").value("HAYW"))
            .andExpect(jsonPath("$.rows[1].nextStop.abbr").value("CAST"))
            .andExpect(jsonPath("$.rows[*].line", everyItem(notNullValue())));
    }

    @Test
    void serverErrorsAreRetriedAndTheKeyNeverAppearsInTheError() {
        REPLY.set(new Reply(500, "oops"));

        assertThat(poller.poll()).isEqualTo(-1);

        assertThat(CALLS.get()).isEqualTo(3);
        assertThat(status.status().error()).contains("HTTP 500").doesNotContain(KEY);
        assertThat(status.status().available()).isFalse();
    }

    @Test
    void aRejectedKeyIsNotRetried() {
        REPLY.set(new Reply(401, "Invalid key"));

        poller.poll();

        assertThat(CALLS.get()).isEqualTo(1);
        assertThat(status.status().error()).contains("rejected").doesNotContain(KEY);
    }

    @Test
    void theCircuitOpensAfterRepeatedFailuresAndStopsCallingBart() {
        REPLY.set(new Reply(503, "down"));
        poller.poll();
        poller.poll(); // 6 failed calls: over the minimum of 5, 100% failure rate
        assertThat(breakers.circuitBreaker(BartApiClient.RESILIENCE_NAME).getState()).isEqualTo(CircuitBreaker.State.OPEN);

        int before = CALLS.get();
        poller.poll();

        assertThat(CALLS.get()).isEqualTo(before);
        assertThat(status.status().error()).contains("paused");
    }

    @Test
    void anEmptyResponseIsReportedWithBartsMessage() {
        REPLY.set(new Reply(200, "{\"root\": {\"message\": {\"error\": {\"text\": \"Invalid key\"}}}}"));

        assertThat(poller.poll()).isEqualTo(-1);
        assertThat(status.status().error()).isEqualTo("Invalid key");
    }

    private static HttpServer startStub() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
            server.createContext("/api/", exchange -> {
                CALLS.incrementAndGet();
                LAST_QUERY.set(exchange.getRequestURI().getRawQuery());
                Reply reply = REPLY.get();
                byte[] body = reply.body().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(reply.status(), body.length);
                try (OutputStream out = exchange.getResponseBody()) {
                    out.write(body);
                }
            });
            server.start();
            return server;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
