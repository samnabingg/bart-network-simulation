package com.transittwin.network;

/** A station as the API and the simulation see it. lat/lon may be null if nothing positioned it. */
public record StationInfo(String abbr, String name, String kind, String platform,
                          Double lat, Double lon, String address, String city) {

    public boolean hasPosition() {
        return lat != null && lon != null;
    }
}
