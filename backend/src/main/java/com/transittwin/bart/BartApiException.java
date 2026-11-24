package com.transittwin.bart;

/** The BART API failed. Messages never contain the request URL, because it carries the API key. */
public class BartApiException extends RuntimeException {

    public BartApiException(String message) {
        super(message);
    }
}
