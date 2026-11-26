package com.transittwin.fares;

/** BART's fare could not be fetched (no API key, BART unreachable, or an unexpected answer). */
public class FareUnavailableException extends RuntimeException {
    public FareUnavailableException(String reason) {
        super(reason);
    }
}
