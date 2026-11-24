package com.transittwin.network;

/** The stop after the current one for a train, with the line and direction it was matched to. */
public record NextStop(String abbr, String name, String line, int dir) {
}
