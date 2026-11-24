package com.transittwin.reference;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/**
 * A BART station. Code, name and line membership are real; {@code kind} and {@code platform}
 * are estimates from general knowledge (edit them in the migration after checking on site).
 */
@Entity
@Table(name = "station")
public class Station {

    public static final String COORDS_NONE = "none";
    public static final String COORDS_ENTRANCES = "entrances";
    public static final String COORDS_API = "api";

    @Id
    @Column(length = 4)
    private String abbr;

    private String name;

    /** underground | elevated | surface */
    private String kind;

    /** island | side */
    private String platform;

    private Double lat;
    private Double lon;

    @Column(name = "coord_source")
    private String coordSource = COORDS_NONE;

    private String address;
    private String city;

    @Column(name = "updated_at")
    private Instant updatedAt;

    protected Station() {
    }

    public Station(String abbr, String name, String kind, String platform) {
        this.abbr = abbr;
        this.name = name;
        this.kind = kind;
        this.platform = platform;
    }

    /** Coordinates from BART's station API always win over the entrance average. */
    public void applyApiDetails(double lat, double lon, String address, String city, Instant at) {
        this.lat = lat;
        this.lon = lon;
        this.address = address;
        this.city = city;
        this.coordSource = COORDS_API;
        this.updatedAt = at;
    }

    /** Average of the entrances, used only while the station API hasn't given a position. */
    public boolean applyEntranceCentroid(double lat, double lon, Instant at) {
        if (COORDS_API.equals(coordSource)) {
            return false;
        }
        this.lat = lat;
        this.lon = lon;
        this.coordSource = COORDS_ENTRANCES;
        this.updatedAt = at;
        return true;
    }

    public String getAbbr() { return abbr; }
    public String getName() { return name; }
    public String getKind() { return kind; }
    public String getPlatform() { return platform; }
    public Double getLat() { return lat; }
    public Double getLon() { return lon; }
    public String getCoordSource() { return coordSource; }
    public String getAddress() { return address; }
    public String getCity() { return city; }
    public Instant getUpdatedAt() { return updatedAt; }
}
