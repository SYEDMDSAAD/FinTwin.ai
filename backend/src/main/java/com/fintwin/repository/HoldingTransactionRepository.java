package com.fintwin.repository;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface HoldingTransactionRepository extends JpaRepository<HoldingTransaction, Long> {
    List<HoldingTransaction> findByInvestmentOrderByDateAsc(Investment investment);
    List<HoldingTransaction> findByInvestmentInOrderByDateAsc(Collection<Investment> investments);
}
