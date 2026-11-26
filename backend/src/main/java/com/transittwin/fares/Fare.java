package com.transittwin.fares;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * BART's fare for one trip, as its API reports it.
 *
 * @param clipper the regular adult Clipper fare, charged when you tap out
 * @param date    the service day the fare is for
 */
public record Fare(String orig, String dest, BigDecimal clipper, LocalDate date) {
}
