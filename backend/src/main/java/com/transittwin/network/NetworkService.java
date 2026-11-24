package com.transittwin.network;

import com.transittwin.geo.GeoDocument;
import com.transittwin.geo.GeoImportService;
import com.transittwin.geo.LonLat;
import com.transittwin.reference.Station;
import com.transittwin.reference.StationRepository;
import com.transittwin.reference.TransitLine;
import com.transittwin.reference.TransitLineRepository;
import java.text.Collator;
import java.time.Clock;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Builds the {@link NetworkModel} from the database and keeps the current one. Readers get an
 * immutable snapshot, so a rebuild never shows them a half-built network.
 */
@Service
public class NetworkService {

    private static final Logger log = LoggerFactory.getLogger(NetworkService.class);

    private final StationRepository stations;
    private final TransitLineRepository lines;
    private final GeoImportService geo;
    private final Clock clock;

    private volatile NetworkModel current;

    public NetworkService(StationRepository stations, TransitLineRepository lines, GeoImportService geo, Clock clock) {
        this.stations = stations;
        this.lines = lines;
        this.geo = geo;
        this.clock = clock;
    }

    public NetworkModel model() {
        NetworkModel m = current;
        return m != null ? m : rebuild();
    }

    public synchronized NetworkModel rebuild() {
        long started = System.nanoTime();
        Collator collator = Collator.getInstance(Locale.ENGLISH);

        Map<String, StationInfo> stationMap = new LinkedHashMap<>();
        stations.findAll().stream()
            .sorted(Comparator.comparing(Station::getName, collator))
            .forEach(s -> stationMap.put(s.getAbbr(), new StationInfo(s.getAbbr(), s.getName(), s.getKind(),
                s.getPlatform(), s.getLat(), s.getLon(), s.getAddress(), s.getCity())));

        Map<String, LineDef> lineMap = new LinkedHashMap<>();
        for (TransitLine l : lines.findAllByOrderByDisplayOrderAsc()) {
            lineMap.put(l.getId(), new LineDef(l.getId(), l.getName(), l.getHex(), l.getApiHex(), l.getHeadwayMin(),
                l.getForwardDirection(), l.getDemoOffsetSec(), l.getStops()));
        }

        Map<String, LonLat> coords = new LinkedHashMap<>();
        stationMap.values().stream()
            .filter(StationInfo::hasPosition)
            .forEach(s -> coords.put(s.abbr(), new LonLat(s.lon(), s.lat())));

        GeoDocument geoDoc = geo.currentDocument();
        Map<String, TrackPath> paths = TrackPathfinder.buildPaths(geoDoc.track(), coords, lineMap.values());
        Map<String, Trip> timetable = Timetables.build(lineMap.values(), paths);

        NetworkModel model = new NetworkModel(
            Collections.unmodifiableMap(stationMap),
            Collections.unmodifiableMap(lineMap),
            Collections.unmodifiableMap(paths),
            Collections.unmodifiableMap(timetable),
            geoDoc,
            clock.instant());
        current = model;
        long offTrack = paths.values().stream().filter(p -> !p.onTrack()).count();
        log.info("Network built: {} stations ({} positioned), {} lines, {} stretches ({} off the track) in {} ms",
            stationMap.size(), coords.size(), lineMap.size(), paths.size() / 2, offTrack / 2,
            (System.nanoTime() - started) / 1_000_000);
        return model;
    }
}
