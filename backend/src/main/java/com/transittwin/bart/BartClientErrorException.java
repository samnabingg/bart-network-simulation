package com.transittwin.bart;

/** BART rejected the request (HTTP 4xx, usually a bad key). Not retried: it won't fix itself. */
public class BartClientErrorException extends BartApiException {

    public BartClientErrorException(String message) {
        super(message);
    }
}
