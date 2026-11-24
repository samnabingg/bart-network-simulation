package com.transittwin.reference;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StationEntranceRepository extends JpaRepository<StationEntrance, Long> {

    List<StationEntrance> findAllByOrderByIdAsc();
}
