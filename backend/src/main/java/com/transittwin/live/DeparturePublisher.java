package com.transittwin.live;

/** Where the poller sends each station's snapshot: Kafka by default, in-process for the local profile. */
public interface DeparturePublisher {

    void publish(DepartureSnapshotEvent event);
}
