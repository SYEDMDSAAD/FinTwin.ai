package com.fintwin.dto;

import java.util.List;
import java.util.Map;

public class PortfolioSummaryDTO {

    private double totalInvested;
    private double currentValue;
    private double totalPnl;
    private double totalPnlPercent;
    private List<InvestmentDTO> holdings;
    private Map<String, Double> allocationByType;

    public double getTotalInvested()       { return totalInvested; }
    public void setTotalInvested(double v) { this.totalInvested = v; }

    public double getCurrentValue()        { return currentValue; }
    public void setCurrentValue(double v)  { this.currentValue = v; }

    public double getTotalPnl()            { return totalPnl; }
    public void setTotalPnl(double v)      { this.totalPnl = v; }

    public double getTotalPnlPercent()          { return totalPnlPercent; }
    public void setTotalPnlPercent(double v)    { this.totalPnlPercent = v; }

    public List<InvestmentDTO> getHoldings()         { return holdings; }
    public void setHoldings(List<InvestmentDTO> h)   { this.holdings = h; }

    public Map<String, Double> getAllocationByType()          { return allocationByType; }
    public void setAllocationByType(Map<String, Double> m)   { this.allocationByType = m; }
}
