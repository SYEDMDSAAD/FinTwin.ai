import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid
} from "recharts";

const CHART_CSS = `
  @keyframes score-pulse-ring {
    0% { transform: scale(1); opacity: 0.7; }
    100% { transform: scale(2.4); opacity: 0; }
  }
  .score-pulse-ring {
    position: absolute; inset: -8px; border-radius: 50%;
    border: 2px solid #a78bfa;
    animation: score-pulse-ring 1.8s ease-out infinite;
    pointer-events: none;
  }
`;

function FinancialScoreChart({ data }) {
    if (!data || data.length === 0) {
        return (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    No score history yet
                </p>
            </div>
        );
    }

    if (data.length === 1) {
        return (
            <>
                <style>{CHART_CSS}</style>
                <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div className="score-pulse-ring" />
                        <div style={{
                            width: 56, height: 56, borderRadius: "50%",
                            background: "rgba(167,139,250,0.12)",
                            border: "2px solid rgba(167,139,250,0.5)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 18, fontWeight: 800, color: "#a78bfa",
                            position: "relative", zIndex: 1,
                        }}>
                            {data[0].score}
                        </div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(167,139,250,0.7)", margin: "0 0 4px" }}>
                            First snapshot recorded
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-dim)", margin: 0 }}>
                            More data will appear next month
                        </p>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div style={{ height: 200 }}>
            <ResponsiveContainer initialDimension={{ width: 320, height: 200 }} width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, fill: "rgba(148,163,184,0.5)" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "rgba(148,163,184,0.5)" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip
                        contentStyle={{ background: "var(--bg-floating)", border: "1px solid var(--border-floating)", borderRadius: 10, fontSize: 12 }}
                        labelStyle={{ color: "var(--text-secondary)" }}
                        itemStyle={{ color: "#a78bfa" }}
                    />
                    <Line
                        type="monotone"
                        dataKey="score"
                        stroke="#a78bfa"
                        strokeWidth={2.5}
                        dot={{ fill: "#a78bfa", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#a78bfa", stroke: "rgba(167,139,250,0.3)", strokeWidth: 4 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

export default FinancialScoreChart;
