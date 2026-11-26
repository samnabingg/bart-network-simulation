package com.transittwin.layout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Asks an Overpass API server for OpenStreetMap data. The public servers are busy and often answer
 * 429 or 50x, so those are retried with growing pauses.
 */
class OverpassClient {

    private static final Logger log = LoggerFactory.getLogger(OverpassClient.class);
    private static final Set<Integer> RETRY = Set.of(429, 502, 503, 504);

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final URI url;
    private final ObjectMapper json;
    private final int attempts;
    private final Duration firstPause;

    OverpassClient(String url, ObjectMapper json, int attempts, Duration firstPause) {
        this.url = URI.create(url);
        this.json = json;
        this.attempts = attempts;
        this.firstPause = firstPause;
    }

    JsonNode query(String overpassQl) throws IOException, InterruptedException {
        HttpRequest req = HttpRequest.newBuilder(url)
            .timeout(Duration.ofSeconds(120))
            .header("Content-Type", "application/x-www-form-urlencoded")
            .header("User-Agent", "transit-twin-osm-import/0.2")
            .POST(HttpRequest.BodyPublishers.ofString("data=" + URLEncoder.encode(overpassQl, StandardCharsets.UTF_8)))
            .build();
        Duration pause = firstPause;
        for (int i = 1; ; i++) {
            HttpResponse<String> res;
            try {
                res = http.send(req, HttpResponse.BodyHandlers.ofString());
            } catch (IOException e) {
                if (i >= attempts) throw e;
                log.warn("Overpass not reachable ({}), retrying in {} s", e.getClass().getSimpleName(), pause.toSeconds());
                Thread.sleep(pause);
                pause = pause.multipliedBy(2);
                continue;
            }
            if (res.statusCode() == 200) return json.readTree(res.body());
            if (!RETRY.contains(res.statusCode()) || i >= attempts) {
                throw new IOException("Overpass answered HTTP " + res.statusCode());
            }
            log.warn("Overpass answered HTTP {}, retrying in {} s", res.statusCode(), pause.toSeconds());
            Thread.sleep(pause);
            pause = pause.multipliedBy(2);
        }
    }
}
