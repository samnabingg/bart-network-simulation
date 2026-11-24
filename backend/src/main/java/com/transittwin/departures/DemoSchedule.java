package com.transittwin.departures;

import com.transittwin.network.LineDef;
import com.transittwin.network.NetworkModel;
import com.transittwin.network.NextStop;
import com.transittwin.network.Trip;
import com.transittwin.network.TripRef;
import com.transittwin.network.TripResolver;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * The demo timetable: every line runs at a fixed headway with a fixed offset. Deterministic, so the
 * same simulated time always gives the same board, and the browser's moving trains agree with it.
 */
public final class DemoSchedule {

    private static final int[] CARS = {8, 9, 10};

    private DemoSchedule() {
    }

    public static double headwaySec(LineDef line) {
        return line.headwayMin() * 60.0;
    }

    /** Seconds after the epoch at which train k = 0 leaves the first stop. */
    public static double offsetSec(LineDef line, int dir) {
        return line.offsetSec() + dir * headwaySec(line) * 0.5;
    }

    public static int carsFor(long k) {
        return CARS[(int) Math.floorMod(k, 3L)];
    }

    /** The next {@code count} departures per line and direction at a station, at simulated time t (epoch seconds). */
    public static List<DepartureRow> departures(NetworkModel model, String abbr, double t, int count) {
        List<DepartureRow> rows = new ArrayList<>();
        for (Trip trip : model.timetable().values()) {
            List<String> stops = trip.stops();
            int i = stops.indexOf(abbr);
            if (i < 0 || i == stops.size() - 1) {
                continue; // trains end here: nothing departs
            }
            LineDef line = model.lines().get(trip.line());
            double h = headwaySec(line);
            double off = offsetSec(line, trip.dir());
            int leaveAt = trip.depart()[i];
            String dest = stops.get(stops.size() - 1);
            String direction = line.dirLabel(trip.dir());
            NextStop next = TripResolver.nextStopOn(model, new TripRef(line.id(), trip.dir()), abbr).orElse(null);
            long k = (long) Math.ceil((t - off - leaveAt) / h);
            for (int n = 0; n < count; n++, k++) {
                double sec = k * h + off + leaveAt - t;
                int minutes = (int) Math.max(0, Math.floor(sec / 60));
                rows.add(new DepartureRow(
                    model.stationName(dest), dest, minutes, DepartureRow.timeLabel(minutes),
                    "South".equals(direction) ? "1" : "2", direction, String.valueOf(carsFor(k)),
                    line.name().toUpperCase(Locale.ROOT), line.hex(), 0, false, line.id(), next));
            }
        }
        rows.sort(Comparator.comparingInt(DepartureRow::minutes));
        return rows;
    }
}
