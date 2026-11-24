package com.transittwin;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * BART network simulation backend. Unofficial; not affiliated with or endorsed by BART.
 */
@SpringBootApplication
@EnableScheduling
@ConfigurationPropertiesScan
public class TransitTwinApplication {

    public static void main(String[] args) {
        SpringApplication.run(TransitTwinApplication.class, args);
    }
}
