package com.transittwin.layout;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.transittwin.network.NetworkService;
import com.transittwin.network.StationInfo;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

/**
 * What a rider sees from the train: the imported line profile (classpath line/profile.json) plus,
 * for every station, which side the doors open on, from its OSM layout.
 */
@Service
public class LineProfileService {

    private static final Logger log = LoggerFactory.getLogger(LineProfileService.class);

    /**
     * One station as seen from the train.
     *
     * @param level  tunnel, elevated or grade: where the track is at the station (reference data)
     * @param layout island, side or mixed (OSM layout, else the reference data)
     * @param doors  the side the doors open on, facing the way the train goes. BART runs on the right,
     *               so an island platform (between the tracks) is on the left and side platforms on the right.
     */
    public record StationView(String level, String layout, String doors) {
    }

    public record RideProfile(LineProfile.Source source, Map<String, List<LineProfile.Segment>> legs,
                              Map<String, StationView> stations) {
    }

    private final LineProfile profile;
    private final StationLayoutService layouts;
    private final NetworkService network;

    public LineProfileService(ObjectMapper json, StationLayoutService layouts, NetworkService network) {
        this.layouts = layouts;
        this.network = network;
        ClassPathResource r = new ClassPathResource("line/profile.json");
        LineProfile p = null;
        if (r.exists()) {
            try (InputStream in = r.getInputStream()) {
                p = json.readValue(in, LineProfile.class);
            } catch (IOException e) {
                throw new UncheckedIOException("The line profile could not be read", e);
            }
        }
        this.profile = p;
        log.info(p == null ? "No line profile imported: rides use ground-level track" : "Loaded the line profile: {} legs", p == null ? 0 : p.legs().size());
    }

    public RideProfile rideProfile() {
        Map<String, StationView> stations = new TreeMap<>();
        for (StationInfo st : network.model().stations().values()) {
            String layout = layouts.layout(st.abbr()).map(StationLayout::layout).filter(l -> !l.isBlank() && !"unknown".equals(l))
                .orElse(st.platform());
            String level = levelOf(st.kind());
            stations.put(st.abbr(), new StationView(level, layout, "side".equals(layout) ? "right" : "left"));
        }
        return new RideProfile(profile == null ? null : profile.source(), profile == null ? Map.of() : profile.legs(), stations);
    }

    private static String levelOf(String kind) {
        return switch (kind == null ? "" : kind) {
            case "underground" -> LineProfile.TUNNEL;
            case "elevated" -> LineProfile.ELEVATED;
            default -> LineProfile.GRADE;
        };
    }
}
