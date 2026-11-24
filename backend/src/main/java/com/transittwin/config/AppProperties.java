package com.transittwin.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param events where live departure snapshots travel: Kafka, or in-process for the local profile
 * @param geo    optional KML to re-import track lines and entrances from on startup
 */
@ConfigurationProperties("app")
public record AppProperties(Events events, Geo geo) {

    public record Events(String transport, String departuresTopic) {
    }

    public record Geo(String kmlFile) {
        public boolean hasKmlFile() {
            return kmlFile != null && !kmlFile.isBlank();
        }
    }
}
