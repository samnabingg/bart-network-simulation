package com.transittwin.geo;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** A point in KML/GeoJSON order: longitude first. Serialized as a two-element JSON array. */
@JsonFormat(shape = JsonFormat.Shape.ARRAY)
@JsonPropertyOrder({"lon", "lat"})
public record LonLat(double lon, double lat) {
}
