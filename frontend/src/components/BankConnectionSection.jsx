import { useEffect, useState } from "react";
import { Building2, Link2, Unlink, RefreshCw, CheckCircle2, Clock, AlertCircle, X, Smartphone } from "lucide-react";
import { toast } from "react-hot-toast";
import GlassCard from "./GlassCard";
import API from "../services/api";

function BankConnectionSection({ onSynced }) {

    const [connections, setConnections] = useState([]);
    const [connecting, setConnecting]   = useState(false);
    const [loading, setLoading]         = useState(true);
    const [showModal, setShowModal]     = useState(false);
    const [mobile, setMobile]             = useState("");
    const [mobileError, setMobileError]   = useState("");
    const [autoSynced, setAutoSynced]     = useState(false);
    const [showDisclosure, setShowDisclosure] = useState(false);

    useEffect(() => { fetchConnections(); }, []);

    // Auto-trigger sync when a PENDING or FETCHING connection appears
    useEffect(() => {
        const needsSync = connections.some(
            c => c.consentStatus === "PENDING" || c.consentStatus === "FETCHING"
        );
        if (!needsSync) {
            if (autoSynced) setAutoSynced(false); // reset for next PENDING cycle
            return;
        }
        if (autoSynced) return;
        const timer = setTimeout(() => {
            setAutoSynced(true);
            handleSync();
        }, 3000);
        return () => clearTimeout(timer);
    }, [connections, autoSynced]);

    // Auto-remove REVOKED/EXPIRED connections after a brief display
    useEffect(() => {
        const stale = connections.filter(
            c => c.consentStatus === "REVOKED" || c.consentStatus === "EXPIRED"
        );
        if (stale.length === 0) return;
        const timers = stale.map(conn =>
            setTimeout(async () => {
                try {
                    await API.delete(`/bank/${conn.id}`);
                } catch { /* already deleted server-side */ }
                setConnections(prev => prev.filter(c => c.id !== conn.id));
            }, 3000)
        );
        return () => timers.forEach(clearTimeout);
    }, [connections]);

    const fetchConnections = async () => {
        try {
            const res = await API.get("/bank/connections");
            setConnections(res.data);
        } catch {
            // silent — user may have no connections yet
        } finally {
            setLoading(false);
        }
    };

    const openModal = () => {
        setMobile("");
        setMobileError("");
        setShowDisclosure(true);
    };

    const handleConnect = async () => {
        const digits = mobile.trim();
        if (!/^\d{10}$/.test(digits)) {
            setMobileError("Enter a valid 10-digit mobile number.");
            return;
        }

        const vua = `${digits}@onemoney`;
        setShowModal(false);
        setConnecting(true);

        try {
            const res = await API.post("/bank/connect", { vua });
            const { redirectUrl } = res.data;

            window.open(redirectUrl, "_blank", "noopener,noreferrer");
            toast.success("Complete the consent in the new tab. Bank transactions, MF holdings and stocks will sync automatically.");

            setTimeout(() => { fetchConnections(); onSynced?.(); }, 8000);
        } catch {
            toast.error("Could not initiate bank connection. Please try again.");
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async (id) => {
        try {
            await API.delete(`/bank/${id}`);
            toast.success("Bank disconnected.");
            fetchConnections();
            onSynced?.();
        } catch {
            toast.error("Failed to disconnect bank.");
        }
    };

    const handleSync = async () => {
        try {
            const res = await API.post("/bank/sync");
            toast.success(res.data.message);
            setTimeout(() => { fetchConnections(); onSynced?.(); }, 3000);
        } catch {
            toast.error("Sync failed. Please try again.");
        }
    };

    const handleForceResync = async (id) => {
        try {
            toast.loading("Fetching transactions from bank...", { id: "resync" });
            const res = await API.post(`/bank/resync/${id}`);
            toast.success(res.data.message, { id: "resync" });
            setTimeout(() => { fetchConnections(); onSynced?.(); }, 2000);
        } catch {
            toast.error("Re-sync failed. Please try again.", { id: "resync" });
        }
    };

    const statusIcon = (status) => {
        switch (status) {
            case "ACTIVE":   return <CheckCircle2 size={14} className="text-green-400" />;
            case "FETCHING": return <RefreshCw    size={14} className="text-cyan-400 animate-spin" />;
            case "REVOKED":
            case "EXPIRED":  return <AlertCircle  size={14} className="text-red-400" />;
            default:         return <Clock        size={14} className="text-yellow-400" />;
        }
    };

    const statusColor = (status) => {
        switch (status) {
            case "ACTIVE":   return "text-green-400";
            case "FETCHING": return "text-cyan-400";
            case "REVOKED":
            case "EXPIRED":  return "text-red-400";
            default:         return "text-yellow-400";
        }
    };

    return (
        <div className="mb-10">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-500/10 border border-blue-500/20">
                    <Building2 size={18} className="text-blue-300" />
                </div>
                <div>
                    <div className="text-[11px] font-bold tracking-[0.12em] text-zinc-500">ACCOUNT AGGREGATOR</div>
                    <h2 className="text-lg font-bold">Connected Banks</h2>
                </div>
            </div>

            {/* Connect card */}
            <GlassCard className="relative overflow-hidden p-6 mb-6 border border-white/10 bg-white/[0.03] backdrop-blur-xl">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <p className="text-sm font-semibold text-white mb-1">Connect your bank account</p>
                        <p className="text-xs text-zinc-500 max-w-md">
                            Powered by RBI's Account Aggregator framework. You authorise data sharing — we never see your credentials. Transactions sync automatically in real time.
                        </p>
                    </div>
                    <button
                        onClick={openModal}
                        disabled={connecting}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:cursor-not-allowed transition-all text-white"
                        style={{ background: "linear-gradient(135deg, #a78bfa, #7c3aed)" }}
                    >
                        <Link2 size={15} />
                        {connecting ? "Opening consent..." : "Connect Bank"}
                    </button>
                </div>
            </GlassCard>

            {/* Connections list */}
            {loading ? (
                <p className="text-sm text-zinc-500">Loading connections...</p>
            ) : connections.length === 0 ? (
                <p className="text-sm text-zinc-500">No banks connected yet.</p>
            ) : (
                <div className="flex flex-col gap-3">
                    {connections.map((conn) => (
                        <GlassCard
                            key={conn.id}
                            className="p-4 border border-white/10 bg-white/[0.03] flex items-center justify-between gap-4 flex-wrap"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <Building2 size={16} className="text-blue-300" />
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-white">
                                        {conn.bankName || "Bank Account"}
                                        {conn.maskedAccountNumber && (
                                            <span className="text-zinc-500 font-normal ml-2">
                                                •• {conn.maskedAccountNumber.slice(-4)}
                                            </span>
                                        )}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {statusIcon(conn.consentStatus)}
                                        <span className={`text-xs font-medium ${statusColor(conn.consentStatus)}`}>
                                            {conn.consentStatus}
                                        </span>
                                        {conn.lastSyncedAt && (
                                            <span className="text-xs text-zinc-600 ml-2">
                                                Last synced {new Date(conn.lastSyncedAt).toLocaleDateString("en-IN")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {(conn.consentStatus === "PENDING" || conn.consentStatus === "FETCHING") && (
                                    <button
                                        onClick={handleSync}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 hover:bg-yellow-500/20 transition-all"
                                    >
                                        <RefreshCw size={12} />
                                        Retry Sync
                                    </button>
                                )}
                                {conn.consentStatus === "ACTIVE" && (
                                    <button
                                        onClick={() => handleForceResync(conn.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                        style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.4)", color: "#22d3ee" }}
                                    >
                                        <RefreshCw size={12} color="#22d3ee" />
                                        Sync Transactions
                                    </button>
                                )}
                                {conn.consentStatus !== "REVOKED" && (
                                    <button
                                        onClick={() => handleDisconnect(conn.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                                        style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.4)", color: "#f87171" }}
                                    >
                                        <Unlink size={12} color="#f87171" />
                                        Disconnect
                                    </button>
                                )}
                            </div>
                        </GlassCard>
                    ))}
                </div>
            )}

            {/* GLBA / GDPR data disclosure modal — shown before bank linking */}
            {showDisclosure && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative w-full max-w-md mx-4 bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl">
                        <button onClick={() => setShowDisclosure(false)}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <Building2 size={18} className="text-purple-300" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Data Collection Notice</h3>
                                <p className="text-xs text-zinc-500">Please read before connecting your bank</p>
                            </div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/08 rounded-xl p-4 mb-4 text-xs text-zinc-400 space-y-2 leading-relaxed">
                            <p>By connecting your bank account, you authorise FinTwin AI to collect and process:</p>
                            <ul className="list-disc list-inside space-y-1 pl-1">
                                <li>Bank transaction history (credits, debits, merchant names, amounts)</li>
                                <li>Account balance information</li>
                                <li>Mutual fund and equity holdings (if shared via AA)</li>
                            </ul>
                            <p>This data is used <strong className="text-zinc-200">only</strong> to power your financial dashboard, AI insights, and net worth calculation. It is encrypted at rest (AES-256) and never sold to third parties.</p>
                            <p>Data is fetched via RBI's Account Aggregator framework. You can revoke access at any time by disconnecting the bank from this page.</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setShowDisclosure(false)}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 hover:bg-white/10 text-zinc-300 transition-all">
                                Cancel
                            </button>
                            <button onClick={() => { setShowDisclosure(false); setShowModal(true); }}
                                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                                style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)" }}>
                                I Understand — Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mobile number modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="relative w-full max-w-sm mx-4 bg-zinc-900 border border-white/10 rounded-2xl p-6 shadow-2xl">

                        <button
                            onClick={() => setShowModal(false)}
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                <Smartphone size={18} className="text-blue-300" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-white">Enter your AA mobile number</h3>
                                <p className="text-xs text-zinc-500">Registered with your Account Aggregator</p>
                            </div>
                        </div>

                        <div className="mb-4">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-blue-500/50 transition-colors">
                                <span className="text-zinc-500 text-sm font-medium">+91</span>
                                <div className="w-px h-4 bg-white/10" />
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={mobile}
                                    onChange={e => {
                                        setMobile(e.target.value.replace(/\D/g, ""));
                                        setMobileError("");
                                    }}
                                    onKeyDown={e => e.key === "Enter" && handleConnect()}
                                    placeholder="10-digit mobile number"
                                    className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
                                    autoFocus
                                />
                            </div>
                            {mobileError && (
                                <p className="text-xs text-red-400 mt-1.5">{mobileError}</p>
                            )}
                            <p className="text-xs text-zinc-600 mt-1.5">
                                This will be used as <span className="text-zinc-400">{mobile || "XXXXXXXXXX"}@onemoney</span> to fetch your bank data via AA.
                            </p>
                        </div>

                        <button
                            onClick={handleConnect}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 transition-all"
                        >
                            <Link2 size={15} />
                            Proceed to Bank Consent
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default BankConnectionSection;
