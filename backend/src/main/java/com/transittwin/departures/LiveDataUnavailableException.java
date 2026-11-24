package com.transittwin.departures;

public class LiveDataUnavailableException extends RuntimeException {

    public LiveDataUnavailableException(String reason) {
        super(reason);
    }
}
