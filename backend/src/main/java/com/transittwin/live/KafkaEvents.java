package com.transittwin.live;

import com.transittwin.config.AppProperties;
import org.apache.kafka.clients.admin.NewTopic;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.config.TopicBuilder;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

/**
 * app.events.transport=kafka (the default): the poller publishes each station's snapshot to
 * {@code bart.departures}, keyed by station code; a listener applies them to the store.
 * A record that still fails after two retries goes to {@code bart.departures.DLT} instead of
 * blocking the partition.
 */
@Configuration
@ConditionalOnProperty(name = "app.events.transport", havingValue = "kafka", matchIfMissing = true)
public class KafkaEvents {

    private static final Logger log = LoggerFactory.getLogger(KafkaEvents.class);

    @Bean
    NewTopic departuresTopic(AppProperties props) {
        return TopicBuilder.name(props.events().departuresTopic()).partitions(6).replicas(1).build();
    }

    @Bean
    NewTopic departuresDeadLetterTopic(AppProperties props) {
        return TopicBuilder.name(props.events().departuresTopic() + ".DLT").partitions(6).replicas(1).build();
    }

    @Bean
    CommonErrorHandler kafkaErrorHandler(KafkaTemplate<Object, Object> template) {
        DefaultErrorHandler handler = new DefaultErrorHandler(new DeadLetterPublishingRecoverer(template), new FixedBackOff(1_000L, 2));
        handler.addNotRetryableExceptions(IllegalArgumentException.class);
        return handler;
    }

    @Bean
    DeparturePublisher kafkaDeparturePublisher(KafkaTemplate<String, DepartureSnapshotEvent> template, AppProperties props) {
        String topic = props.events().departuresTopic();
        return event -> template.send(topic, event.station(), event).whenComplete((result, err) -> {
            if (err != null) {
                log.warn("Could not publish departures for {}: {}", event.station(), err.getMessage());
            }
        });
    }

    @Bean
    Listener kafkaDepartureListener(LiveDepartureStore store) {
        return new Listener(store);
    }

    public static class Listener {
        private final LiveDepartureStore store;

        Listener(LiveDepartureStore store) {
            this.store = store;
        }

        @KafkaListener(topics = "${app.events.departures-topic}")
        public void on(DepartureSnapshotEvent event) {
            store.apply(event);
        }
    }
}
