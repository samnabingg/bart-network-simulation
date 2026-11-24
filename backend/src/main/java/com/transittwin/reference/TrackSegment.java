package com.transittwin.reference;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One track centerline polyline; {@code points} is a JSON array of [lon, lat] pairs. */
@Entity
@Table(name = "track_segment")
public class TrackSegment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private int seq;

    private String points;

    protected TrackSegment() {
    }

    public TrackSegment(int seq, String pointsJson) {
        this.seq = seq;
        this.points = pointsJson;
    }

    public Long getId() { return id; }
    public int getSeq() { return seq; }
    public String getPoints() { return points; }
}
