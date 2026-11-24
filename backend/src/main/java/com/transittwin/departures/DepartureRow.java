package com.transittwin.departures;

import com.transittwin.network.NextStop;

/**
 * One departure on a station board, live or demo.
 *
 * @param minutes   null when BART gave no usable estimate; 0 means "Leaving"
 * @param line      the line this train was matched to (null if it couldn't be matched)
 * @param nextStop  the stop after this station, used by the 3D station when you board
 */
public record DepartureRow(
    String destination,
    String destAbbr,
    Integer minutes,
    String timeLabel,
    String platform,
    String direction,
    String cars,
    String color,
    String hex,
    int delaySec,
    boolean cancelled,
    String line,
    NextStop nextStop) {

    public DepartureRow withTrip(String line, NextStop nextStop) {
        return new DepartureRow(destination, destAbbr, minutes, timeLabel, platform, direction, cars, color, hex,
            delaySec, cancelled, line, nextStop);
    }

    public static String timeLabel(Integer minutes) {
        if (minutes == null) {
            return "—";
        }
        return minutes == 0 ? "Leaving" : minutes + " min";
    }
}
