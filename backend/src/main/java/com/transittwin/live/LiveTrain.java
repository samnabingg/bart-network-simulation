package com.transittwin.live;

/**
 * Where a live train is estimated to be.
 * <p>
 * Standing at a station: {@code at} is set and {@code from == to == at}. Between stations:
 * {@code at} is null and {@code progress} runs 0..1 from {@code from} to {@code to}.
 * The browser keeps the train moving between polls with {@code runSec} and {@code remainSec}:
 * progress = 1 - (remainSec - secondsSinceAsOf) / runSec.
 */
public record LiveTrain(
    String id,
    String line,
    int dir,
    String hex,
    String dest,
    Integer cars,
    int delaySec,
    String from,
    String to,
    String at,
    double progress,
    String next,
    int runSec,
    double remainSec) {
}
