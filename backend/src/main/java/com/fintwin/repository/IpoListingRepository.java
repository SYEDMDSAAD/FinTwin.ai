package com.fintwin.repository;

import com.fintwin.model.IpoListing;
import org.springframework.data.jpa.repository.JpaRepository;

public interface IpoListingRepository extends JpaRepository<IpoListing, Long> {
}
