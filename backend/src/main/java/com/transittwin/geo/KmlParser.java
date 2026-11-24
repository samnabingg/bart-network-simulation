package com.transittwin.geo;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads BART's "Stations, tracks and entrances" KML export. A light regex reader for BART's
 * machine-generated KML, not a general KML parser.
 */
public final class KmlParser {

    public record KmlStation(String name, double lon, double lat) {
    }

    /** {@code station} is the BART station code from parent_station, or "" when missing. */
    public record KmlEntrance(String name, String station, double lon, double lat) {
    }

    public record KmlData(List<KmlStation> stations, List<KmlEntrance> entrances, List<List<LonLat>> track) {
    }

    private static final Pattern NAME = Pattern.compile("<name>([^<]*)</name>");
    private static final Pattern POINT = Pattern.compile("<Point>.*?<coordinates>\\s*([^<\\s]+)\\s*</coordinates>", Pattern.DOTALL);
    private static final Pattern PLACEMARK = Pattern.compile("<Placemark.*?</Placemark>", Pattern.DOTALL);
    private static final Pattern LINE_STRING = Pattern.compile("<LineString>.*?</LineString>", Pattern.DOTALL);
    private static final Pattern COORDINATES = Pattern.compile("<coordinates>(.*?)</coordinates>", Pattern.DOTALL);
    private static final Pattern PARENT_STATION = Pattern.compile("<td>parent_station</td>\\s*<td>([^<]*)</td>");
    private static final Pattern DEC_ENTITY = Pattern.compile("&#(\\d+);");
    private static final Pattern HEX_ENTITY = Pattern.compile("&#x([0-9a-fA-F]+);");

    private KmlParser() {
    }

    public static KmlData parse(String kml) {
        List<KmlStation> stations = new ArrayList<>();
        List<KmlEntrance> entrances = new ArrayList<>();
        List<List<LonLat>> track = new ArrayList<>();

        String[] chunks = kml.split("<Folder", -1);
        for (int c = 1; c < chunks.length; c++) {
            String chunk = chunks[c];
            String folder = firstGroup(NAME, chunk).map(KmlParser::decode).orElse("").trim().toLowerCase();
            List<String> placemarks = allMatches(PLACEMARK, chunk);

            if (folder.contains("entrance")) {
                for (String pm : placemarks) {
                    LonLat pt = pointOf(pm);
                    if (pt == null) {
                        continue;
                    }
                    String parent = firstGroup(PARENT_STATION, pm).orElse("");
                    entrances.add(new KmlEntrance(placemarkName(pm), parent.replaceFirst("^place_", "").trim(), pt.lon(), pt.lat()));
                }
            } else if (folder.contains("track")) {
                for (String pm : placemarks) {
                    for (String ls : allMatches(LINE_STRING, pm)) {
                        String raw = firstGroup(COORDINATES, ls).orElse(null);
                        if (raw == null) {
                            continue;
                        }
                        List<LonLat> coords = new ArrayList<>();
                        for (String tuple : raw.trim().split("\\s+")) {
                            LonLat p = lonLat(tuple);
                            if (p != null) {
                                coords.add(p);
                            }
                        }
                        if (coords.size() >= 2) {
                            track.add(coords);
                        }
                    }
                }
            } else if (folder.contains("station")) {
                for (String pm : placemarks) {
                    LonLat pt = pointOf(pm);
                    if (pt != null) {
                        stations.add(new KmlStation(placemarkName(pm), pt.lon(), pt.lat()));
                    }
                }
            }
        }
        return new KmlData(stations, entrances, track);
    }

    /** Decodes numeric and named XML entities. &amp;amp; goes last so "&amp;amp;lt;" becomes "&amp;lt;". */
    static String decode(String s) {
        String out = DEC_ENTITY.matcher(s).replaceAll(m -> Matcher.quoteReplacement(Character.toString(Integer.parseInt(m.group(1)))));
        out = HEX_ENTITY.matcher(out).replaceAll(m -> Matcher.quoteReplacement(Character.toString(Integer.parseInt(m.group(1), 16))));
        return out.replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&amp;", "&");
    }

    private static String placemarkName(String pm) {
        return decode(firstGroup(NAME, pm).orElse("")).trim();
    }

    private static LonLat pointOf(String pm) {
        return firstGroup(POINT, pm).map(KmlParser::lonLat).orElse(null);
    }

    /** KML order is longitude, latitude, altitude. */
    private static LonLat lonLat(String tuple) {
        String[] parts = tuple.split(",");
        if (parts.length < 2) {
            return null;
        }
        try {
            double lon = Double.parseDouble(parts[0]);
            double lat = Double.parseDouble(parts[1]);
            return Double.isFinite(lon) && Double.isFinite(lat) ? new LonLat(lon, lat) : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static java.util.Optional<String> firstGroup(Pattern p, String s) {
        Matcher m = p.matcher(s);
        return m.find() ? java.util.Optional.of(m.group(1)) : java.util.Optional.empty();
    }

    private static List<String> allMatches(Pattern p, String s) {
        List<String> out = new ArrayList<>();
        Matcher m = p.matcher(s);
        while (m.find()) {
            out.add(m.group());
        }
        return out;
    }
}
