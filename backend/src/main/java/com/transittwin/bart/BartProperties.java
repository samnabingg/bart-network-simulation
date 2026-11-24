package com.transittwin.bart;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * BART Legacy API settings. The key stays on the server: it is never sent to the browser or logged.
 * Register at https://api2.bart.gov/api/register.aspx and read the developer license agreement first.
 */
@ConfigurationProperties("bart")
public record BartProperties(
    String apiKey,
    String baseUrl,
    Duration pollInterval,
    Duration stationSyncInterval,
    Duration connectTimeout,
    Duration readTimeout) {

    public boolean hasKey() {
        return apiKey != null && !apiKey.isBlank();
    }

    @Override
    public String toString() {
        return "BartProperties[apiKey=" + (hasKey() ? "***" : "") + ", baseUrl=" + baseUrl + "]";
    }
}
