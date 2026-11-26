package com.transittwin.api;

import com.transittwin.departures.LiveDataUnavailableException;
import com.transittwin.departures.StationNotFoundException;
import com.transittwin.fares.ExcursionTripException;
import com.transittwin.fares.FareUnavailableException;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Every error is an RFC 9457 problem detail ({@code application/problem+json}). Framework errors
 * (bad parameters, validation) are handled by the base class.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(StationNotFoundException.class)
    ProblemDetail stationNotFound(StationNotFoundException e) {
        return problem(HttpStatus.NOT_FOUND, "Unknown station", e.getMessage());
    }

    @ExceptionHandler(LiveDataUnavailableException.class)
    ProblemDetail liveUnavailable(LiveDataUnavailableException e) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Live data unavailable", e.getMessage());
    }

    @ExceptionHandler(FareUnavailableException.class)
    ProblemDetail fareUnavailable(FareUnavailableException e) {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Fare unavailable", e.getMessage());
    }

    @ExceptionHandler(ExcursionTripException.class)
    ProblemDetail excursion(ExcursionTripException e) {
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "No fare for an excursion trip", e.getMessage());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ProblemDetail invalid(ConstraintViolationException e) {
        return problem(HttpStatus.BAD_REQUEST, "Invalid request", e.getMessage());
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detail);
        p.setTitle(title);
        return p;
    }
}
