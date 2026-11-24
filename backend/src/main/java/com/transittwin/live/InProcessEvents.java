package com.transittwin.live;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;

/** app.events.transport=inprocess: snapshots go straight to the store through Spring events. */
@Configuration
@ConditionalOnProperty(name = "app.events.transport", havingValue = "inprocess")
public class InProcessEvents {

    @Bean
    DeparturePublisher inProcessDeparturePublisher(ApplicationEventPublisher events) {
        return events::publishEvent;
    }

    @Bean
    Listener inProcessDepartureListener(LiveDepartureStore store) {
        return new Listener(store);
    }

    public static class Listener {
        private final LiveDepartureStore store;

        Listener(LiveDepartureStore store) {
            this.store = store;
        }

        @EventListener
        public void on(DepartureSnapshotEvent event) {
            store.apply(event);
        }
    }
}
