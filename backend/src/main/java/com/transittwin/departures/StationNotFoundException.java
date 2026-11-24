package com.transittwin.departures;

public class StationNotFoundException extends RuntimeException {

    public StationNotFoundException(String abbr) {
        super("No station with code " + abbr);
    }
}
