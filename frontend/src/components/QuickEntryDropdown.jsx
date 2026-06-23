import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";

function QuickEntryDropdown({
    incomeText,
    setIncomeText,
    addIncome,
    expenseText,
    setExpenseText,
    addExpense,
}) {
    const [open, setOpen] = useState(false);

    const card = {
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 18,
        marginBottom: 16,
        overflow: "hidden",
    };

    const inputStyle = {
        flex: 1,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 14px",
        color: "#fff",
        fontSize: 13,
        outline: "none",
        fontFamily: "inherit",
    };

    const handleIncomeKey = (e) => { if (e.key === "Enter") addIncome(); };
    const handleExpenseKey = (e) => { if (e.key === "Enter") addExpense(); };

    return (
        <div style={card}>
            {/* Toggle header */}
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 20px",
                    background: "transparent",
                    border: "none",
                    color: "#fff",
                    cursor: "pointer",
                    fontFamily: "inherit",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Plus size={15} color="#a78bfa" />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-label, #71717a)" }}>
                        ADD MANUAL ENTRY
                    </span>
                </div>
                <ChevronDown
                    size={16}
                    color="#71717a"
                    style={{
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                    }}
                />
            </button>

            {/* Collapsible body */}
            {open && (
                <div style={{ padding: "0 20px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {/* Income row */}
                    <div>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#4ade80", marginBottom: 6 }}>
                            ADD INCOME
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                type="text"
                                value={incomeText}
                                onChange={(e) => setIncomeText(e.target.value)}
                                onKeyDown={handleIncomeKey}
                                placeholder="e.g. Salary 50000"
                                style={inputStyle}
                            />
                            <button
                                onClick={addIncome}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "10px 18px",
                                    borderRadius: 10,
                                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                    border: "none",
                                    color: "#fff",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                <Plus size={14} /> Add
                            </button>
                        </div>
                    </div>

                    {/* Expense row */}
                    <div>
                        <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: "#f87171", marginBottom: 6 }}>
                            ADD EXPENSE
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                type="text"
                                value={expenseText}
                                onChange={(e) => setExpenseText(e.target.value)}
                                onKeyDown={handleExpenseKey}
                                placeholder="e.g. Swiggy 450"
                                style={inputStyle}
                            />
                            <button
                                onClick={addExpense}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "10px 18px",
                                    borderRadius: 10,
                                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                    border: "none",
                                    color: "#fff",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                <Plus size={14} /> Add
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default QuickEntryDropdown;
