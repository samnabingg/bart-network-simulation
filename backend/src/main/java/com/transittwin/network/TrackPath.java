package com.transittwin.network;

import com.transittwin.geo.LonLat;
import java.util.List;

/**
 * The track between two neighbouring stations.
 *
 * @param len     meters
 * @param onTrack false when the path fell back to a straight line
 */
public record TrackPath(List<LonLat> pts, double len, boolean onTrack) {
}
