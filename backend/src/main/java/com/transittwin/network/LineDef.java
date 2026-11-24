package com.transittwin.network;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * An immutable view of a line for the simulation.
 *
 * @param forward     what BART calls the direction of {@code stops} (North or South)
 * @param headwayMin  minutes between demo trains
 * @param offsetSec   fixed demo offset so lines sharing track are spread out, not bunched
 */
public record LineDef(String id, String name, String hex, String apiHex, int headwayMin,
                      String forward, int offsetSec, List<String> stops) {

    public LineDef {
        stops = List.copyOf(stops);
    }

    /** dir 0 runs in list order, dir 1 the reverse. */
    public List<String> stopsFor(int dir) {
        if (dir == 0) {
            return stops;
        }
        List<String> reversed = new ArrayList<>(stops);
        Collections.reverse(reversed);
        return List.copyOf(reversed);
    }

    public String dirLabel(int dir) {
        return dir == 0 ? forward : opposite(forward);
    }

    public static String opposite(String direction) {
        return "North".equals(direction) ? "South" : "North";
    }
}
