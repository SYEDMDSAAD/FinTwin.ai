import GlassCard from "./GlassCard";

function MonthlySummaryCard({ summary }) {
    if (!summary) return null;

    const cleanMerchant = (name) => {
        if (!name) return "—";
        // Strip UPI-style prefixes like "CARD/CR/123456/MerchantName/CODE"
        const parts = name.split("/");
        if (parts.length >= 4) return parts[3];
        return name;
    };

    return (
        <GlassCard className="p-5 mb-8 border border-white/10 bg-white/[0.03] backdrop-blur-xl">
            <style>{`
                .ms-meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.05); }
                .ms-meta > div { min-width: 0; text-align: center; }
            `}</style>

            <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500 mb-4">
                MONTHLY SUMMARY
            </div>

            {/* Top 3 numbers */}
            <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                    <h3 className="text-lg font-bold text-green-400">
                        ₹{(summary.income / 100000).toFixed(2)}L
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-1">Income</p>
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-red-400">
                        ₹{(summary.expenses / 100000).toFixed(2)}L
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-1">Expenses</p>
                </div>
                <div className="text-center">
                    <h3 className="text-lg font-bold text-cyan-400">
                        ₹{(summary.savings / 100000).toFixed(2)}L
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-1">Savings</p>
                </div>
            </div>

            {/* Bottom meta */}
            <div className="ms-meta">
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Top Category</p>
                    <p className="text-base font-bold text-white truncate">{summary.topCategory || "—"}</p>
                </div>
                <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Top Merchant</p>
                    <p className="text-base font-bold text-white truncate" title={summary.topMerchant}>
                        {cleanMerchant(summary.topMerchant)}
                    </p>
                </div>
                <div className="ms-meta-tx">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Transactions</p>
                    <p className="text-base font-bold text-white">{summary.transactionCount}</p>
                </div>
            </div>
        </GlassCard>
    );
}

export default MonthlySummaryCard;
