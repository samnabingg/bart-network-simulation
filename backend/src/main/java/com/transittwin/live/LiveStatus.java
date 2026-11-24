package com.transittwin.live;

import java.time.Instant;

/**
 * @param configured a BART API key is set on the server
 * @param available  fresh live data is on hand (the browser should use live mode)
 * @param fetchedAt  when the newest snapshot was read from BART
 * @param error      why the last poll failed, if it did
 * @param stations   how many stations have a live board
 */
public record LiveStatus(boolean configured, boolean available, Instant fetchedAt, String error, int stations) {
}
