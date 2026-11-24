package com.transittwin.config;

import com.transittwin.geo.GeoDocument;
import com.transittwin.geo.GeoImportService;
import com.transittwin.network.NetworkService;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Makes sure track lines and entrances are in the database, then builds the network model.
 * Runs before scheduled jobs start, so the BART station sync never races the first import.
 * <ul>
 *   <li>{@code app.geo.kml-file} set: re-import from BART's KML (replaces the old build-geo.mjs).</li>
 *   <li>Otherwise, on an empty database: import the bundled geo/geo.json.</li>
 * </ul>
 */
@Component
public class ReferenceDataBootstrap implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(ReferenceDataBootstrap.class);

    private final GeoImportService geo;
    private final NetworkService network;
    private final AppProperties props;

    public ReferenceDataBootstrap(GeoImportService geo, NetworkService network, AppProperties props) {
        this.geo = geo;
        this.network = network;
        this.props = props;
    }

    @Override
    public void afterSingletonsInstantiated() {
        GeoDocument doc = null;
        if (props.geo() != null && props.geo().hasKmlFile()) {
            Path kml = Path.of(props.geo().kmlFile());
            try {
                doc = geo.fromKml(Files.readString(kml, StandardCharsets.UTF_8));
            } catch (IOException e) {
                throw new UncheckedIOException("Could not read KML file " + kml, e);
            }
            log.info("Importing track and entrances from {}", kml);
        } else if (geo.isEmpty()) {
            try (InputStream in = new ClassPathResource("geo/geo.json").getInputStream()) {
                doc = geo.readGeoJson(in);
            } catch (IOException e) {
                log.warn("geo/geo.json is missing, so stations without coordinates won't be drawn ({})", e.getMessage());
            }
        }
        if (doc != null) {
            GeoImportService.ImportResult r = geo.replaceAll(doc);
            log.info("Imported {} track segments and {} entrances; positioned {} stations",
                r.segments(), r.entrances(), r.stationsPositioned());
        }
        network.rebuild();
    }
}
