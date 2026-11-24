package com.transittwin.network;

import java.util.List;
import java.util.Locale;
import java.util.Optional;

/** Matches a live departure (station, destination, color, direction) to a line and direction. */
public final class TripResolver {

    private TripResolver() {
    }

    /**
     * Prefers a line that contains both this station and the destination; the API color and
     * direction settle ties (Red and Yellow share track).
     */
    public static Optional<TripRef> resolve(NetworkModel model, String abbr, String destAbbr, String hex, String direction) {
        String h = hex == null ? "" : hex.toLowerCase(Locale.ROOT);
        String dirWanted = direction == null ? "" : direction;
        TripRef best = null;
        int bestScore = -1;
        for (LineDef line : model.lines().values()) {
            int i = line.stops().indexOf(abbr);
            if (i < 0) {
                continue;
            }
            int j = destAbbr == null ? -1 : line.stops().indexOf(destAbbr);
            boolean colorOk = !h.isEmpty()
                && (line.apiHex().equalsIgnoreCase(h) || line.hex().equalsIgnoreCase(h));
            int dir;
            int score;
            if (j >= 0 && j != i) {
                dir = j > i ? 0 : 1;
                score = 4 + (colorOk ? 2 : 0);
            } else if (colorOk && !dirWanted.isEmpty()) {
                dir = line.forward().equals(dirWanted) ? 0 : 1;
                score = 2;
            } else {
                continue;
            }
            if (!dirWanted.isEmpty() && line.dirLabel(dir).equals(dirWanted)) {
                score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                best = new TripRef(line.id(), dir);
            }
        }
        return Optional.ofNullable(best);
    }

    /** The stop after {@code abbr} for a train heading to destAbbr, or empty at the end of the line. */
    public static Optional<NextStop> nextStop(NetworkModel model, String abbr, String destAbbr, String hex, String direction) {
        return resolve(model, abbr, destAbbr, hex, direction).flatMap(t -> nextStopOn(model, t, abbr));
    }

    public static Optional<NextStop> nextStopOn(NetworkModel model, TripRef trip, String abbr) {
        List<String> stops = model.lines().get(trip.line()).stopsFor(trip.dir());
        int i = stops.indexOf(abbr);
        if (i < 0 || i + 1 >= stops.size()) {
            return Optional.empty();
        }
        String n = stops.get(i + 1);
        return Optional.of(new NextStop(n, model.stationName(n), trip.line(), trip.dir()));
    }
}
