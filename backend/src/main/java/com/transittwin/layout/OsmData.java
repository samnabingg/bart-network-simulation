package com.transittwin.layout;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The parts of an Overpass {@code out tags geom} answer the layout builder needs. */
record OsmData(List<Element> elements) {

    record LatLon(double lat, double lon) {
    }

    /** A node (one point) or a way (its points, in order). Relations are not used. */
    record Element(String type, long id, Map<String, String> tags, List<LatLon> points) {

        String osmId() {
            return type + "/" + id;
        }

        String tag(String key) {
            return tags.getOrDefault(key, "");
        }

        boolean is(String key, String value) {
            return value.equals(tags.get(key));
        }

        boolean yes(String key) {
            return is(key, "yes");
        }

        boolean isWay() {
            return "way".equals(type);
        }

        boolean closed() {
            if (!isWay() || points.size() < 4) return false;
            LatLon a = points.get(0), b = points.get(points.size() - 1);
            return a.lat() == b.lat() && a.lon() == b.lon();
        }

        LatLon center() {
            double la = 0, lo = 0;
            int n = closed() ? points.size() - 1 : points.size();
            for (int i = 0; i < n; i++) {
                la += points.get(i).lat();
                lo += points.get(i).lon();
            }
            return new LatLon(la / n, lo / n);
        }
    }

    static OsmData parse(JsonNode body) {
        List<Element> out = new ArrayList<>();
        for (JsonNode e : body.path("elements")) {
            String type = e.path("type").asText();
            Map<String, String> tags = new LinkedHashMap<>();
            e.path("tags").properties().forEach(t -> tags.put(t.getKey(), t.getValue().asText()));
            List<LatLon> pts = new ArrayList<>();
            if ("node".equals(type)) {
                pts.add(new LatLon(e.path("lat").asDouble(), e.path("lon").asDouble()));
            } else if ("way".equals(type)) {
                for (JsonNode p : e.path("geometry")) pts.add(new LatLon(p.path("lat").asDouble(), p.path("lon").asDouble()));
            } else {
                continue;
            }
            if (!pts.isEmpty()) out.add(new Element(type, e.path("id").asLong(), tags, pts));
        }
        return new OsmData(out);
    }
}
