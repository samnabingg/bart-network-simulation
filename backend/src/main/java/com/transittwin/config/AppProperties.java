package com.transittwin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param events where live departure snapshots travel: Kafka, or in-process for the local profile
 * @param geo    optional KML to re-import track lines and entrances from on startup
 */
@ConfigurationProperties("app")
public record AppProperties(Events events, Geo geo, Osm osm) {

    /**
     * The one-off OpenStreetMap layout import (profile osm-import).
     *
     * @param stations  comma-separated station codes, or ALL
     * @param outputDir where the layout files are written (committed and loaded from the classpath)
     * @param rawDir    optional: also save Overpass's raw answers here (for tests and debugging)
     * @param pause     wait between requests, to be kind to the public Overpass server
     */
    public record Osm(String overpassUrl, String stations, String outputDir, String rawDir, java.time.Duration pause) {
    }

    public record Events(String transport, String departuresTopic) {
    }

    public record Geo(String kmlFile) {
        public boolean hasKmlFile() {
            return kmlFile != null && !kmlFile.isBlank();
        }
    }
}
