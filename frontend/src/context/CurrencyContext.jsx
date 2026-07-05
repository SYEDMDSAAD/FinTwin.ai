import { createContext, useContext, useState, useEffect } from "react";

const CurrencyContext = createContext();

// All amounts in FinTwin are INR-denominated — the backend stores and
// computes in rupees. The previous USD/EUR/GBP options swapped the symbol
// WITHOUT converting the amount ("₹50,000" displayed as "$50,000" — an ~84x
// misrepresentation of the user's money). Non-INR options can return when a
// real FX conversion pipeline exists.
export const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
];

export const CurrencyProvider = ({ children }) => {
  const [currency, setCurrency] = useState(() => {
    const saved = JSON.parse(localStorage.getItem("fintwin-currency") || "null");
    // Reset any legacy non-INR selection persisted before the fix
    return CURRENCIES.find((c) => c.code === saved?.code) || CURRENCIES[0];
  });

  useEffect(() => {
    localStorage.setItem("fintwin-currency", JSON.stringify(currency));
  }, [currency]);

  const fmt = (amount) => {
    const value = Number(amount) || 0;
    // Sign must survive formatting — negative values (overspend, losses,
    // negative predicted savings) previously rendered as positives.
    const sign = value < 0 ? "-" : "";
    const formatted = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return `${sign}${currency.symbol}${formatted}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt, CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
