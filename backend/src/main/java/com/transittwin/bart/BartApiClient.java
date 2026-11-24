package com.transittwin.bart;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import java.net.http.HttpClient;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Calls BART's Legacy API (https://api2.bart.gov/docs/) with {@code json=y}.
 * <p>
 * Each call has connect and read timeouts, is retried with exponential backoff on server errors and
 * network failures, and goes through a circuit breaker so a BART outage doesn't keep the poller
 * waiting on timeouts. Settings are under {@code resilience4j.*.instances.bart}.
 */
@Component
public class BartApiClient {

    public static final String RESILIENCE_NAME = "bart";

    private final RestClient rest;
    private final BartProperties props;
    private final ObjectMapper json;

    public BartApiClient(RestClient.Builder builder, BartProperties props, ObjectMapper json) {
        HttpClient http = HttpClient.newBuilder().connectTimeout(props.connectTimeout()).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
        factory.setReadTimeout(props.readTimeout());
        this.rest = builder.baseUrl(props.baseUrl()).requestFactory(factory).build();
        this.props = props;
        this.json = json;
    }

    /** stn.aspx?cmd=stns: every station with coordinates and address. */
    @Retry(name = RESILIENCE_NAME)
    @CircuitBreaker(name = RESILIENCE_NAME)
    public JsonNode fetchStations() {
        return get("/stn.aspx", Map.of("cmd", "stns"));
    }

    /** etd.aspx?cmd=etd&amp;orig=ALL: departure estimates for every station in one request. */
    @Retry(name = RESILIENCE_NAME)
    @CircuitBreaker(name = RESILIENCE_NAME)
    public JsonNode fetchAllDepartures() {
        return get("/etd.aspx", Map.of("cmd", "etd", "orig", "ALL"));
    }

    private JsonNode get(String path, Map<String, String> params) {
        if (!props.hasKey()) {
            throw new BartClientErrorException("BART_API_KEY is not set");
        }
        String body;
        try {
            body = rest.get()
                .uri(b -> {
                    b.path(path);
                    params.forEach(b::queryParam);
                    return b.queryParam("key", props.apiKey()).queryParam("json", "y").build();
                })
                .accept(MediaType.APPLICATION_JSON)
                .retrieve()
                .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                    throw new BartClientErrorException("BART API rejected the request (HTTP " + res.getStatusCode().value() + ")");
                })
                .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                    throw new BartApiException("BART API returned HTTP " + res.getStatusCode().value());
                })
                .body(String.class);
        } catch (BartApiException e) {
            throw e;
        } catch (RestClientException e) {
            // RestClient's own messages include the full URL, and with it the key: don't pass them on.
            throw new BartApiException("Could not reach the BART API (" + rootCauseName(e) + ")");
        }
        if (body == null || body.isBlank()) {
            throw new BartApiException("BART API returned an empty response");
        }
        try {
            return json.readTree(body);
        } catch (JsonProcessingException e) {
            throw new BartApiException("BART API returned something that isn't JSON");
        }
    }

    private static String rootCauseName(Throwable e) {
        Throwable t = e;
        while (t.getCause() != null && t.getCause() != t) {
            t = t.getCause();
        }
        return t.getClass().getSimpleName();
    }
}
