package com.transittwin.config;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AppConfig {

    /** Injected everywhere time matters, so tests can pin it. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
