package com.transittwin.bart;

import com.fasterxml.jackson.databind.JsonNode;
import com.transittwin.departures.DepartureRow;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Turns BART Legacy API JSON into plain records. Shapes follow https://api2.bart.gov/docs/.
 * <p>
 * The API converts XML to JSON, so a list with one item can arrive as a plain object instead of
 * an array; {@link #toArray} normalizes both.
 */
public final class BartResponseParser {

    public record ParsedStation(String abbr, String name, double lat, double lon, String address, String city) {
    }

    public record StationDepartures(String stationName, List<DepartureRow> rows, String message) {
    }

    static final String FALLBACK_HEX = "#8a8f98";
    private static final Pattern HEX = Pattern.compile("^#[0-9a-fA-F]{6}$");

    private BartResponseParser() {
    }

    public static List<JsonNode> toArray(JsonNode v) {
        if (v == null || v.isNull() || v.isMissingNode() || (v.isTextual() && v.asText().isEmpty())) {
            return List.of();
        }
        if (v.isArray()) {
            List<JsonNode> out = new ArrayList<>();
            v.forEach(out::add);
            return out;
        }
        return List.of(v);
    }

    /** Best-effort text from the API's "message" field (warnings, errors). */
    public static String parseMessage(JsonNode data) {
        JsonNode m = data == null ? null : data.path("root").path("message");
        if (m == null || m.isMissingNode() || m.isNull()) {
            return "";
        }
        if (m.isTextual()) {
            return m.asText();
        }
        String warning = text(m.path("warning"));
        if (!warning.isEmpty()) {
            return warning;
        }
        return text(m.path("error").path("text"));
    }

    /** Stations sorted by name; stations without usable coordinates are dropped. */
    public static List<ParsedStation> parseStations(JsonNode data) {
        if (data == null) {
            return List.of();
        }
        List<ParsedStation> out = new ArrayList<>();
        for (JsonNode s : toArray(data.path("root").path("stations").path("station"))) {
            String abbr = text(s.path("abbr"));
            String name = text(s.has("name") ? s.path("name") : s.path("n")); // JSON uses "name"; the XML sample "n"
            Double lat = number(s.path("gtfs_latitude"));
            Double lon = number(s.path("gtfs_longitude"));
            if (abbr.isEmpty() || name.isEmpty() || lat == null || lon == null) {
                continue;
            }
            out.add(new ParsedStation(abbr, name, lat, lon, nullIfEmpty(text(s.path("address"))), nullIfEmpty(text(s.path("city")))));
        }
        Collator collator = Collator.getInstance(Locale.ENGLISH);
        out.sort(Comparator.comparing(ParsedStation::name, collator));
        return out;
    }

    /** For a single-station etd response: every departure, sorted by time. */
    public static StationDepartures parseDepartures(JsonNode data) {
        String message = parseMessage(data);
        List<JsonNode> stations = data == null ? List.of() : toArray(data.path("root").path("station"));
        if (stations.isEmpty()) {
            return new StationDepartures(null, List.of(), message);
        }
        JsonNode station = stations.get(0);
        String name = text(station.has("name") ? station.path("name") : station.path("n"));
        return new StationDepartures(nullIfEmpty(name), stationRows(station), message);
    }

    /** For etd.aspx?orig=ALL: every station's rows, keyed by station code, in response order. */
    public static Map<String, List<DepartureRow>> parseAllDepartures(JsonNode data) {
        Map<String, List<DepartureRow>> byStation = new LinkedHashMap<>();
        if (data == null) {
            return byStation;
        }
        for (JsonNode station : toArray(data.path("root").path("station"))) {
            String abbr = text(station.path("abbr"));
            if (!abbr.isEmpty()) {
                byStation.put(abbr, stationRows(station));
            }
        }
        return byStation;
    }

    private static List<DepartureRow> stationRows(JsonNode station) {
        List<DepartureRow> rows = new ArrayList<>();
        for (JsonNode etd : toArray(station.path("etd"))) {
            for (JsonNode est : toArray(etd.path("estimate"))) {
                String rawMinutes = text(est.path("minutes"));
                Integer minutes = "Leaving".equals(rawMinutes) ? Integer.valueOf(0) : leadingInt(rawMinutes);
                Double delay = number(est.path("delay"));
                rows.add(new DepartureRow(
                    text(etd.path("destination")),
                    text(etd.path("abbreviation")),
                    minutes,
                    DepartureRow.timeLabel(minutes),
                    nullIfEmpty(text(est.path("platform"))),
                    nullIfEmpty(text(est.path("direction"))),
                    nullIfEmpty(text(est.path("length"))),
                    nullIfEmpty(text(est.path("color"))),
                    safeHex(text(est.path("hexcolor"))),
                    delay == null ? 0 : delay.intValue(),
                    "1".equals(text(est.path("cancelflag"))),
                    null,
                    null));
            }
        }
        rows.sort(Comparator.comparing(DepartureRow::minutes, Comparator.nullsLast(Comparator.naturalOrder())));
        return rows;
    }

    static String safeHex(String h) {
        return h != null && HEX.matcher(h).matches() ? h : FALLBACK_HEX;
    }

    private static String text(JsonNode n) {
        return n == null || n.isMissingNode() || n.isNull() ? "" : n.asText("");
    }

    private static String nullIfEmpty(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    private static Double number(JsonNode n) {
        String s = text(n).trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            double d = Double.parseDouble(s);
            return Double.isFinite(d) ? d : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** Like JavaScript's parseInt: reads leading digits, so "13" and "13 " both give 13. */
    private static Integer leadingInt(String s) {
        String t = s.trim();
        int end = 0;
        if (end < t.length() && (t.charAt(0) == '-' || t.charAt(0) == '+')) {
            end++;
        }
        while (end < t.length() && Character.isDigit(t.charAt(end))) {
            end++;
        }
        try {
            return Integer.valueOf(t.substring(0, end));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
