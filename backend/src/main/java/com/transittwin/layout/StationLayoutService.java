package com.transittwin.layout;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

/** The imported station layouts (classpath stations/*.json), loaded once at startup. */
@Service
public class StationLayoutService {

    private static final Logger log = LoggerFactory.getLogger(StationLayoutService.class);

    private final Map<String, StationLayout> layouts = new TreeMap<>();

    public StationLayoutService(ObjectMapper json) {
        try {
            for (Resource r : new PathMatchingResourcePatternResolver().getResources("classpath*:stations/*.json")) {
                try (InputStream in = r.getInputStream()) {
                    StationLayout l = json.readValue(in, StationLayout.class);
                    layouts.put(l.abbr(), l);
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException("Station layouts could not be read", e);
        }
        log.info("Loaded {} station layouts from OpenStreetMap imports{}", layouts.size(), layouts.isEmpty() ? "" : ": " + layouts.keySet());
    }

    public Optional<StationLayout> layout(String abbr) {
        return Optional.ofNullable(layouts.get(abbr));
    }
}
