package com.transittwin.reference;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrackSegmentRepository extends JpaRepository<TrackSegment, Long> {

    List<TrackSegment> findAllByOrderBySeqAsc();
}
