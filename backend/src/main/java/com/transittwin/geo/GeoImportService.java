package com.transittwin.geo;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.transittwin.reference.Station;
import com.transittwin.reference.StationEntrance;
import com.transittwin.reference.StationEntranceRepository;
import com.transittwin.reference.StationRepository;
import com.transittwin.reference.TrackSegment;
import com.transittwin.reference.TrackSegmentRepository;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.text.Collator;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Loads track lines and entrances into the database, from geo.json or from BART's KML. */
@Service
public class GeoImportService {

    private static final Logger log = LoggerFactory.getLogger(GeoImportService.class);

    /** Degrees, roughly 2 meters: drops points that don't change the shape. */
    static final double SIMPLIFY_TOLERANCE = 0.00002;

    private static final TypeReference<List<LonLat>> POINTS = new TypeReference<>() {
    };

    public record ImportResult(int segments, int entrances, int stationsPositioned, List<String> unknownStations) {
    }

    private final TrackSegmentRepository tracks;
    private final StationEntranceRepository entrances;
    private final StationRepository stations;
    private final ObjectMapper json;
    private final Clock clock;

    public GeoImportService(TrackSegmentRepository tracks, StationEntranceRepository entrances,
                            StationRepository stations, ObjectMapper json, Clock clock) {
        this.tracks = tracks;
        this.entrances = entrances;
        this.stations = stations;
        this.json = json;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public boolean isEmpty() {
        return tracks.count() == 0;
    }

    public GeoDocument readGeoJson(InputStream in) {
        try {
            return json.readValue(in, GeoDocument.class);
        } catch (IOException e) {
            throw new UncheckedIOException("geo.json could not be read", e);
        }
    }

    /** Same output as the prototype's build-geo.mjs: simplified track, rounded points, entrances by station. */
    public GeoDocument fromKml(String kmlText) {
        KmlParser.KmlData kml = KmlParser.parse(kmlText);
        if (kml.track().isEmpty() || kml.entrances().isEmpty()) {
            throw new IllegalArgumentException(
                "This does not look like the BART stations, entrances and tracks KML (no track lines or entrances found).");
        }
        List<List<LonLat>> track = kml.track().stream()
            .map(line -> LineSimplifier.simplify(line, SIMPLIFY_TOLERANCE).stream()
                .map(p -> new LonLat(Geo.round5(p.lon()), Geo.round5(p.lat())))
                .toList())
            .toList();

        Collator collator = Collator.getInstance(Locale.ENGLISH);
        Map<String, List<GeoDocument.Entrance>> byStation = new LinkedHashMap<>();
        int unmatched = 0;
        for (KmlParser.KmlEntrance e : kml.entrances()) {
            if (e.station().isEmpty()) {
                unmatched++;
                continue;
            }
            byStation.computeIfAbsent(e.station(), k -> new ArrayList<>())
                .add(new GeoDocument.Entrance(e.name(), Geo.round5(e.lat()), Geo.round5(e.lon())));
        }
        byStation.values().forEach(list -> list.sort(Comparator.comparing(GeoDocument.Entrance::name, collator)));

        int before = kml.track().stream().mapToInt(List::size).sum();
        int after = track.stream().mapToInt(List::size).sum();
        log.info("KML: {} track segments, {} points simplified to {}; {} entrances skipped without a station code",
            track.size(), before, after, unmatched);
        return new GeoDocument(track, byStation);
    }

    /**
     * Replaces all track lines and entrances in one transaction, then positions every station
     * that BART's station API hasn't positioned yet at the average of its entrances.
     */
    @Transactional
    public ImportResult replaceAll(GeoDocument doc) {
        entrances.deleteAllInBatch();
        tracks.deleteAllInBatch();

        List<TrackSegment> segments = new ArrayList<>();
        for (int i = 0; i < doc.track().size(); i++) {
            segments.add(new TrackSegment(i, writePoints(doc.track().get(i))));
        }
        tracks.saveAll(segments);

        Map<String, Station> known = stations.findAll().stream()
            .collect(Collectors.toMap(Station::getAbbr, Function.identity()));
        List<String> unknown = new ArrayList<>();
        List<StationEntrance> rows = new ArrayList<>();
        int positioned = 0;
        for (Map.Entry<String, List<GeoDocument.Entrance>> entry : doc.entrances().entrySet()) {
            Station station = known.get(entry.getKey());
            List<GeoDocument.Entrance> list = entry.getValue();
            if (station == null) {
                unknown.add(entry.getKey()); // not a station in the reference data: skip rather than guess
                continue;
            }
            if (list.isEmpty()) {
                continue;
            }
            for (GeoDocument.Entrance e : list) {
                rows.add(new StationEntrance(station.getAbbr(), e.name(), e.lat(), e.lon()));
            }
            double lat = list.stream().mapToDouble(GeoDocument.Entrance::lat).average().orElseThrow();
            double lon = list.stream().mapToDouble(GeoDocument.Entrance::lon).average().orElseThrow();
            if (station.applyEntranceCentroid(lat, lon, clock.instant())) {
                positioned++;
            }
        }
        entrances.saveAll(rows);
        if (!unknown.isEmpty()) {
            log.warn("Skipped entrances for unknown station codes: {}", unknown);
        }
        return new ImportResult(segments.size(), rows.size(), positioned, unknown);
    }

    /** Current track and entrances, as stored. */
    @Transactional(readOnly = true)
    public GeoDocument currentDocument() {
        List<List<LonLat>> track = tracks.findAllByOrderBySeqAsc().stream().map(s -> readPoints(s.getPoints())).toList();
        Map<String, List<GeoDocument.Entrance>> byStation = new LinkedHashMap<>();
        for (StationEntrance e : entrances.findAllByOrderByIdAsc()) {
            byStation.computeIfAbsent(e.getStationAbbr(), k -> new ArrayList<>())
                .add(new GeoDocument.Entrance(e.getName(), e.getLat(), e.getLon()));
        }
        return new GeoDocument(track, byStation);
    }

    private String writePoints(List<LonLat> pts) {
        try {
            return json.writeValueAsString(pts);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private List<LonLat> readPoints(String text) {
        try {
            return json.readValue(text, POINTS);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Corrupt track segment in the database", e);
        }
    }
}
