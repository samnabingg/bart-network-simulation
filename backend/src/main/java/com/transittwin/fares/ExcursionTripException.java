package com.transittwin.fares;

/** Entering and leaving at the same station: BART charges an excursion fare, which its fare API doesn't give. */
public class ExcursionTripException extends RuntimeException {
    public ExcursionTripException() {
        super("Entering and leaving at the same station is an excursion trip; BART's fare API has no price for it");
    }
}
