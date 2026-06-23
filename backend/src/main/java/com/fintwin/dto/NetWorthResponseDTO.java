package com.fintwin.dto;

import com.fintwin.model.Asset;
import com.fintwin.model.Liability;

import java.util.List;

public class NetWorthResponseDTO {

    private Double totalAssets;

    private Double totalLiabilities;

    private Double savings;

    private Double netWorth;

    private List<Asset> assets;

    private List<Liability> liabilities;

    // Investment portfolio rolled into net worth
    private Double portfolioCurrentValue;
    private Double portfolioInvested;
    private Double portfolioPnl;
    private Integer portfolioCount;

    public Double getTotalAssets() {
        return totalAssets;
    }

    public void setTotalAssets(Double totalAssets) {
        this.totalAssets = totalAssets;
    }

    public Double getTotalLiabilities() {
        return totalLiabilities;
    }

    public void setTotalLiabilities(Double totalLiabilities) {
        this.totalLiabilities = totalLiabilities;
    }

    public Double getSavings() {
        return savings;
    }

    public void setSavings(Double savings) {
        this.savings = savings;
    }

    public Double getNetWorth() {
        return netWorth;
    }

    public void setNetWorth(Double netWorth) {
        this.netWorth = netWorth;
    }

    public List<Asset> getAssets() {
        return assets;
    }

    public void setAssets(List<Asset> assets) {
        this.assets = assets;
    }

    public List<Liability> getLiabilities() {
        return liabilities;
    }

    public void setLiabilities(List<Liability> liabilities) {
        this.liabilities = liabilities;
    }

    public Double getPortfolioCurrentValue() { return portfolioCurrentValue; }
    public void setPortfolioCurrentValue(Double v) { this.portfolioCurrentValue = v; }

    public Double getPortfolioInvested() { return portfolioInvested; }
    public void setPortfolioInvested(Double v) { this.portfolioInvested = v; }

    public Double getPortfolioPnl() { return portfolioPnl; }
    public void setPortfolioPnl(Double v) { this.portfolioPnl = v; }

    public Integer getPortfolioCount() { return portfolioCount; }
    public void setPortfolioCount(Integer v) { this.portfolioCount = v; }
}