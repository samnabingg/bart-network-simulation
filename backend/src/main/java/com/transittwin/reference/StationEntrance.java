package com.transittwin.reference;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "station_entrance")
public class StationEntrance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "station_abbr")
    private String stationAbbr;

    private String name;
    private double lat;
    private double lon;

    protected StationEntrance() {
    }

    public StationEntrance(String stationAbbr, String name, double lat, double lon) {
        this.stationAbbr = stationAbbr;
        this.name = name;
        this.lat = lat;
        this.lon = lon;
    }

    public Long getId() { return id; }
    public String getStationAbbr() { return stationAbbr; }
    public String getName() { return name; }
    public double getLat() { return lat; }
    public double getLon() { return lon; }
}
