import { createContext, useContext, useState, useEffect } from "react";

const CurrencyContext = createContext();

export const CURRENCIES = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
];

export const CurrencyProvider = ({ children }) => {
  const [currency, setCurrency] = useState(
    () => JSON.parse(localStorage.getItem("fintwin-currency") || "null") || CURRENCIES[0]
  );

  useEffect(() => {
    localStorage.setItem("fintwin-currency", JSON.stringify(currency));
  }, [currency]);

  const fmt = (amount) => {
    const abs = Math.abs(amount);
    const formatted = abs.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    return `${currency.symbol}${formatted}`;
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt, CURRENCIES }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => useContext(CurrencyContext);
