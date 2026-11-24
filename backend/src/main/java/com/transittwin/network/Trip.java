package com.transittwin.network;

import java.util.List;

/**
 * One line in one direction: when a train reaches and leaves each stop, in seconds counted from
 * the moment it leaves the first stop. {@code run[i]} is the running time from stop i-1 to stop i.
 */
public record Trip(String line, int dir, List<String> stops, int[] arrive, int[] depart, int[] run, int total) {

    public static String key(String line, int dir) {
        return line + ":" + dir;
    }
}
