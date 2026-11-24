package com.transittwin.reference;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TransitLineRepository extends JpaRepository<TransitLine, String> {

    List<TransitLine> findAllByOrderByDisplayOrderAsc();
}
