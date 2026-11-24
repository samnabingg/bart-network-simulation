package com.transittwin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.transittwin.departures.DepartureRow;
import com.transittwin.live.DeparturePublisher;
import com.transittwin.live.DepartureSnapshotEvent;
import com.transittwin.live.LiveDepartureStore;
import com.transittwin.network.NetworkModel;
import com.transittwin.network.NetworkService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;

/**
 * The default profile end to end, against real PostgreSQL and Kafka in containers.
 * Skipped when Docker isn't available (it runs in CI).
 */
@Testcontainers(disabledWithoutDocker = true)
@SpringBootTest(properties = {
    "bart.api-key=",
    "bart.initial-delay=PT1H",
    "spring.kafka.consumer.auto-offset-reset=earliest",
})
class PostgresKafkaIntegrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer("apache/kafka-native:3.8.0");

    @Autowired
    NetworkService network;
    @Autowired
    DeparturePublisher publisher;
    @Autowired
    LiveDepartureStore store;

    @Test
    void flywayMigratesPostgresAndTheNetworkBuilds() {
        NetworkModel model = network.model();
        assertThat(model.stations()).hasSize(50);
        assertThat(model.paths().values()).allMatch(p -> p.onTrack());
    }

    @Test
    void snapshotsTravelThroughKafkaToTheStore() {
        Instant at = Instant.parse("2026-11-24T12:00:00Z");
        DepartureRow row = new DepartureRow("Daly City", "DALY", 4, "4 min", "2", "North", "9", "BLUE", "#0099cc", 0,
            false, null, null);
        publisher.publish(new DepartureSnapshotEvent("BAYF", at, List.of(row)));

        await().atMost(Duration.ofSeconds(30)).untilAsserted(() ->
            assertThat(store.forStation("BAYF")).hasValueSatisfying(e -> {
                assertThat(e.fetchedAt()).isEqualTo(at);
                assertThat(e.rows()).extracting(DepartureRow::destAbbr).containsExactly("DALY");
            }));
    }

    @Test
    void aMessageThatCannotBeReadGoesToTheDeadLetterTopic() {
        try (KafkaProducer<String, String> producer = new KafkaProducer<>(Map.of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class,
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class));
             KafkaConsumer<String, String> dlt = new KafkaConsumer<>(Map.of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "dlt-check-" + UUID.randomUUID(),
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class))) {

            producer.send(new ProducerRecord<>("bart.departures", "POISON", "this is not json"));
            producer.flush();
            dlt.subscribe(List.of("bart.departures.DLT"));

            await().atMost(Duration.ofSeconds(30)).until(() -> {
                ConsumerRecords<String, String> records = dlt.poll(Duration.ofMillis(500));
                for (var r : records) {
                    if ("POISON".equals(r.key())) {
                        return true;
                    }
                }
                return false;
            });
        }
        assertThat(store.forStation("POISON")).isEmpty();
    }
}
