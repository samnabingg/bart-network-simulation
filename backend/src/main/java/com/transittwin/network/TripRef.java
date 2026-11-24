package com.transittwin.network;

/** A line and direction a live train was matched to. */
public record TripRef(String line, int dir) {
}
