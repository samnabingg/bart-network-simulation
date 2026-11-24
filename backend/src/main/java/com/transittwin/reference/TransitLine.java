package com.transittwin.reference;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import java.util.ArrayList;
import java.util.List;

/** A BART service line with its stops in the forward direction. */
@Entity
@Table(name = "transit_line")
public class TransitLine {

    @Id
    private String id;

    private String name;
    private String hex;

    /** The color BART's API reports for this line (Yellow differs from the map color). */
    @Column(name = "api_hex")
    private String apiHex;

    @Column(name = "headway_min")
    private int headwayMin;

    /** North or South: what BART calls the forward direction of {@link #stops}. */
    @Column(name = "forward_direction")
    private String forwardDirection;

    @Column(name = "demo_offset_sec")
    private int demoOffsetSec;

    @Column(name = "display_order")
    private int displayOrder;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "line_stop", joinColumns = @JoinColumn(name = "line_id"))
    @OrderColumn(name = "seq")
    @Column(name = "station_abbr")
    private List<String> stops = new ArrayList<>();

    protected TransitLine() {
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getHex() { return hex; }
    public String getApiHex() { return apiHex; }
    public int getHeadwayMin() { return headwayMin; }
    public String getForwardDirection() { return forwardDirection; }
    public int getDemoOffsetSec() { return demoOffsetSec; }
    public int getDisplayOrder() { return displayOrder; }
    public List<String> getStops() { return List.copyOf(stops); }
}
