package com.transittwin.fares;

import com.fasterxml.jackson.databind.JsonNode;
import com.transittwin.bart.BartApiClient;
import com.transittwin.bart.BartApiException;
import com.transittwin.departures.StationNotFoundException;
import com.transittwin.network.NetworkService;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Real fares from BART's schedule API. Fares change rarely, so each trip is fetched at most once per
 * service day (Pacific time) and kept in memory.
 */
@Service
public class FareService {

    private static final ZoneId BART_ZONE = ZoneId.of("America/Los_Angeles");

    private final BartApiClient bart;
    private final NetworkService network;
    private final Clock clock;
    private final Map<String, Fare> cache = new ConcurrentHashMap<>();

    public FareService(BartApiClient bart, NetworkService network, Clock clock) {
        this.bart = bart;
        this.network = network;
        this.clock = clock;
    }

    /**
     * @throws ExcursionTripException    when orig and dest are the same station (BART charges an
     *                                   excursion fare for that, which its fare API does not give)
     * @throws StationNotFoundException  for an unknown station code
     * @throws FareUnavailableException  when BART can't be asked or gives no fare
     */
    public Fare fare(String orig, String dest) {
        var stations = network.model().stations();
        if (!stations.containsKey(orig)) throw new StationNotFoundException(orig);
        if (!stations.containsKey(dest)) throw new StationNotFoundException(dest);
        if (orig.equals(dest)) {
            throw new ExcursionTripException();
        }
        LocalDate today = LocalDate.now(clock.withZone(BART_ZONE));
        String key = orig + ">" + dest;
        Fare cached = cache.get(key);
        if (cached != null && cached.date().equals(today)) return cached;
        JsonNode body;
        try {
            body = bart.fetchFare(orig, dest);
        } catch (BartApiException e) {
            throw new FareUnavailableException(e.getMessage());
        }
        BigDecimal clipper = parseClipperFare(body);
        if (clipper == null) throw new FareUnavailableException("BART's answer had no Clipper fare");
        Fare fare = new Fare(orig, dest, clipper, today);
        cache.put(key, fare);
        return fare;
    }

    /** The adult Clipper amount from a sched.aspx?cmd=fare answer, or null if there is none. */
    static BigDecimal parseClipperFare(JsonNode body) {
        JsonNode root = body.path("root");
        JsonNode list = root.path("fares").path("fare");
        Iterable<JsonNode> fares = list.isArray() ? list : java.util.List.of(list);
        for (JsonNode f : fares) {
            if ("clipper".equals(f.path("@class").asText())) {
                BigDecimal v = toAmount(f.path("@amount").asText());
                if (v != null) return v;
            }
        }
        return toAmount(root.path("trip").path("fare").asText());
    }

    private static BigDecimal toAmount(String s) {
        try {
            BigDecimal v = new BigDecimal(s.trim());
            return v.signum() > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
