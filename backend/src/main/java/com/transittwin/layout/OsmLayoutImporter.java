package com.transittwin.layout;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.transittwin.config.AppProperties;
import com.transittwin.network.NetworkService;
import com.transittwin.network.StationInfo;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * One-off import, not part of normal startup: run with the {@code osm-import} profile, it asks
 * Overpass about each station, writes one layout file per station and exits.
 *
 * <pre>
 * .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local,osm-import" "-Dspring-boot.run.arguments=--app.osm.stations=MCAR,16TH,EMBR"
 * </pre>
 *
 * The files go to {@code app.osm.output-dir} (src/main/resources/stations by default) and are
 * committed, so the app never depends on Overpass being up.
 */
@Component
@Profile("osm-import")
class OsmLayoutImporter implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(OsmLayoutImporter.class);

    private final NetworkService network;
    private final AppProperties props;
    private final ObjectMapper json;
    private final Clock clock;
    private final ApplicationContext context;

    OsmLayoutImporter(NetworkService network, AppProperties props, ObjectMapper json, Clock clock, ApplicationContext context) {
        this.network = network;
        this.props = props;
        this.json = json.copy().enable(SerializationFeature.INDENT_OUTPUT);
        this.clock = clock;
        this.context = context;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        AppProperties.Osm osm = props.osm();
        OverpassClient overpass = new OverpassClient(osm.overpassUrl(), json, 4, Duration.ofSeconds(10));
        Path out = Path.of(osm.outputDir());
        Files.createDirectories(out);
        Path raw = osm.rawDir() == null || osm.rawDir().isBlank() ? null : Files.createDirectories(Path.of(osm.rawDir()));

        List<StationInfo> wanted = select(osm.stations());
        List<String> failed = new ArrayList<>();
        for (StationInfo st : wanted) {
            try {
                JsonNode body = overpass.query(StationLayoutBuilder.overpassQuery(st.lat(), st.lon()));
                if (raw != null) json.writeValue(raw.resolve(st.abbr() + ".json").toFile(), body);
                StationLayout layout = StationLayoutBuilder.build(st, OsmData.parse(body), clock.instant());
                json.writeValue(out.resolve(st.abbr() + ".json").toFile(), layout);
                log.info("{}: {} platforms, layout {}, {}{}", st.abbr(), layout.platforms().size(), layout.layout(),
                    layout.coverage(), layout.warnings().isEmpty() ? "" : " | " + String.join(" | ", layout.warnings()));
            } catch (Exception e) {
                failed.add(st.abbr());
                log.error("{}: import failed: {}", st.abbr(), e.getMessage());
            }
            Thread.sleep(osm.pause().toMillis()); // be kind to the public Overpass server
        }
        log.info("OSM import done: {} of {} stations written to {}{}", wanted.size() - failed.size(), wanted.size(),
            out.toAbsolutePath(), failed.isEmpty() ? "" : "; failed: " + failed);
        System.exit(SpringApplication.exit(context, () -> failed.isEmpty() ? 0 : 1));
    }

    private List<StationInfo> select(String stations) {
        List<StationInfo> all = network.model().stations().values().stream().filter(StationInfo::hasPosition).toList();
        if (stations == null || stations.isBlank() || stations.equalsIgnoreCase("ALL")) return all;
        List<String> codes = Arrays.stream(stations.split(",")).map(s -> s.trim().toUpperCase(Locale.ROOT)).toList();
        List<StationInfo> picked = all.stream().filter(s -> codes.contains(s.abbr())).toList();
        if (picked.size() < codes.size()) {
            log.warn("Unknown or unpositioned station codes ignored: {}",
                codes.stream().filter(c -> picked.stream().noneMatch(s -> s.abbr().equals(c))).toList());
        }
        return picked;
    }
}
