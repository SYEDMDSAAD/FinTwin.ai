import { useState } from "react";
import { HelpCircle, X, Search, MessageCircle, Home, ChevronRight, ChevronDown } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";

// Real answers, not links to articles that don't exist. Anything that changes
// in the app (bank linking, the model) should change here too.
const FAQ = [
  {
    q: "How is my Financial Score calculated?",
    a: "From your savings rate, debt-to-income ratio, emergency-fund cover and net-worth trend. It is computed in one place on the server, so the dashboard, reports and Copilot always quote the same number.",
  },
  {
    q: "Where do the AI answers and forecasts come from?",
    a: "A qwen2.5 model running on FinTwin's own server. Your transactions are never sent to an outside AI provider. Forecasts extrapolate from your own history, so they sharpen once a few months are imported.",
  },
  {
    q: "Can I connect my bank account?",
    a: "Not yet for real accounts — bank linking through RBI's Account Aggregator is still in testing, and the Connect Bank button on Transactions is a demo sandbox. For your real data, import a PDF, Excel or CSV statement from Imports.",
  },
  {
    q: "A transaction is in the wrong category. What do I do?",
    a: "Change it. FinTwin learns the payee, so every other transaction with that same payee — past and future — moves with it. Corrections are the main thing making categorisation better during the beta.",
  },
  {
    q: "How do budgets and goals work?",
    a: "Budgets are monthly caps per category and reset each month. Goals are funded from what you actually save each month, in the priority order you set, so the dates shown are the ones your saving supports.",
  },
  {
    q: "Is my financial data encrypted?",
    a: "Amounts, payee names and personal fields are encrypted with AES-256-GCM before they reach the database, and passwords are stored as bcrypt hashes. You can delete your account and all its data from Settings.",
  },
];

const CSS = `
  @keyframes helpPanelIn {
    from { opacity:0; transform:translateY(10px) scale(0.97); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  .help-panel { animation: helpPanelIn 0.2s ease both; }
  .help-tab-btn { flex:1; padding:12px 0; background:none; border:none; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:4px; font-size:10px; font-weight:600; font-family:'DM Sans',system-ui,sans-serif; transition:color 0.2s; }
  .help-link-row { padding:10px 12px; border-radius:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); cursor:pointer; display:flex; align-items:center; justify-content:space-between; font-size:12px; color:rgba(148,163,184,0.8); font-family:'DM Sans',system-ui,sans-serif; transition:background 0.15s; }
  .help-link-row:hover { background:rgba(167,139,250,0.07); border-color:rgba(167,139,250,0.2); }
  @media (max-width:768px) {
    .help-float-btn { bottom:76px !important; }
    .help-panel-wrap { bottom:132px !important; right:12px !important; width:calc(100vw - 24px) !important; }
  }
`;

export default function HelpWidget() {
  const [open, setOpen]           = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [search, setSearch]       = useState("");
  const [message, setMessage]     = useState("");
  const [sending, setSending]     = useState(false);
  const [openFaq, setOpenFaq]     = useState(null);

  const user  = (() => { try { return JSON.parse(localStorage.getItem("user") || "{}"); } catch { return {}; } })();
  const email = user.email || "";
  const name  = user.fullName || localStorage.getItem("fullName") || "there";

  const needle = search.trim().toLowerCase();
  const filteredLinks = FAQ.filter(f =>
    !needle || f.q.toLowerCase().includes(needle) || f.a.toLowerCase().includes(needle)
  );

  // The message goes to the same ticket queue the login page and the admin
  // Support Tickets tab use — nothing here is a placeholder.
  const send = async () => {
    if (!message.trim()) { toast.error("Please write a message."); return; }
    if (!email)          { toast.error("Please sign in again — we need your email to reply."); return; }
    try {
      setSending(true);
      await API.post("/tickets", {
        email,
        name: user.fullName || "",
        category: "OTHER",
        message: message.trim(),
      });
      toast.success(`Sent. We'll reply to ${email}.`);
      setMessage("");
      setActiveTab("home");
    } catch {
      toast.error("Couldn't send that. Please try again in a moment.");
    } finally {
      setSending(false);
    }
  };

  const faqRow = (f) => (
    <div key={f.q} style={{ display: "flex", flexDirection: "column" }}>
      <div
        className="help-link-row"
        onClick={() => setOpenFaq(o => (o === f.q ? null : f.q))}
        style={openFaq === f.q ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : undefined}
      >
        <span style={{ paddingRight: 8 }}>{f.q}</span>
        {openFaq === f.q
          ? <ChevronDown  size={14} color="#a78bfa" style={{ flexShrink: 0 }} />
          : <ChevronRight size={14} color="rgba(148,163,184,0.4)" style={{ flexShrink: 0 }} />}
      </div>
      {openFaq === f.q && (
        <p style={{
          margin: 0, padding: "10px 12px 12px",
          fontSize: 12, lineHeight: 1.55, color: "rgba(148,163,184,0.75)",
          background: "rgba(167,139,250,0.05)",
          border: "1px solid rgba(167,139,250,0.15)", borderTop: "none",
          borderRadius: "0 0 10px 10px",
        }}>
          {f.a}
        </p>
      )}
    </div>
  );

  return (
    <>
      <style>{CSS}</style>

      {/* Floating button */}
      <button
        className="help-float-btn"
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 88, right: 24,
          width: 48, height: 48, borderRadius: "50%",
          background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
          border: "none", display: "flex", alignItems: "center",
          justifyContent: "center", cursor: "pointer",
          boxShadow: "0 8px 32px rgba(167,139,250,0.4)",
          zIndex: 200, transition: "transform 0.2s",
        }}
        onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
        onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
      >
        {open
          ? <X size={20} color="#fff" />
          : <HelpCircle size={20} color="#fff" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="help-panel help-panel-wrap"
          style={{
            position: "fixed", bottom: 152, right: 24,
            width: 340, maxHeight: 500,
            background: "rgba(10,12,18,0.98)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 20,
            boxShadow: "0 24px 60px rgba(0,0,0,0.8)",
            zIndex: 200, overflow: "hidden",
            display: "flex", flexDirection: "column",
            fontFamily: "'DM Sans',system-ui,sans-serif",
          }}
        >
          {/* Top accent */}
          <div style={{ height: 2, background: "linear-gradient(90deg,#a78bfa,#22d3ee)", flexShrink: 0 }} />

          {/* Content area */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {activeTab === "home" && (
              <div style={{ padding: 20 }}>
                <div style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 3px" }}>
                    Hi {name} 👋
                  </h3>
                  <p style={{ fontSize: 13, color: "rgba(148,163,184,0.6)", margin: 0 }}>
                    How can we help?
                  </p>
                </div>

                {/* Send message CTA */}
                <div
                  onClick={() => setActiveTab("messages")}
                  style={{
                    background: "rgba(167,139,250,0.08)",
                    border: "1px solid rgba(167,139,250,0.2)",
                    borderRadius: 12, padding: "14px 16px",
                    marginBottom: 14, cursor: "pointer",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    transition: "background 0.15s",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Send us a message</div>
                    <div style={{ fontSize: 11, color: "rgba(148,163,184,0.5)" }}>A real person reads every message</div>
                  </div>
                  <ChevronRight size={16} color="#a78bfa" />
                </div>

                {/* Search */}
                <div style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 10, padding: "9px 14px",
                  display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
                }}>
                  <Search size={14} color="rgba(148,163,184,0.5)" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search for help..."
                    style={{
                      background: "none", border: "none", outline: "none",
                      flex: 1, fontSize: 13, color: "#e2e8f0", fontFamily: "inherit",
                    }}
                  />
                </div>

                {/* Quick links */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {filteredLinks.map(faqRow)}
                  {filteredLinks.length === 0 && (
                    <p style={{ fontSize: 12, color: "rgba(148,163,184,0.4)", textAlign: "center", padding: "12px 0" }}>
                      No results for "{search}"
                    </p>
                  )}
                </div>
              </div>
            )}

            {activeTab === "messages" && (
              <div style={{ padding: 20, display: "flex", flexDirection: "column", height: "100%" }}>
                <button
                  onClick={() => setActiveTab("home")}
                  style={{ background: "none", border: "none", color: "#a78bfa", fontSize: 12, cursor: "pointer", marginBottom: 14, textAlign: "left", fontFamily: "inherit", padding: 0 }}
                >
                  ← Back
                </button>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>
                  Send us a message
                </h3>
                <p style={{ fontSize: 12, color: "rgba(148,163,184,0.5)", margin: "0 0 14px" }}>
                  {email
                    ? <>This opens a support ticket. We'll reply to <span style={{ color: "rgba(226,232,240,0.85)" }}>{email}</span>.</>
                    : "Sign in again so we have an email to reply to."}
                </p>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe your issue or question..."
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    borderRadius: 10, padding: 12,
                    color: "#e2e8f0", fontSize: 13, fontFamily: "inherit",
                    resize: "none", height: 100, outline: "none", marginBottom: 12,
                  }}
                />
                <button
                  onClick={send}
                  disabled={sending}
                  style={{
                    padding: "12px", borderRadius: 12, border: "none",
                    background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
                    color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: sending ? "default" : "pointer", fontFamily: "inherit",
                    opacity: sending ? 0.6 : 1,
                  }}
                >
                  {sending ? "Sending..." : "Send Message"}
                </button>
              </div>
            )}

            {activeTab === "help" && (
              <div style={{ padding: 20 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "0 0 14px" }}>
                  Help Articles
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {FAQ.map(faqRow)}
                </div>
              </div>
            )}
          </div>

          {/* Bottom tabs */}
          <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
            {[
              { id: "home",     label: "Home",     icon: <Home size={16} /> },
              { id: "messages", label: "Messages",  icon: <MessageCircle size={16} /> },
              { id: "help",     label: "Help",      icon: <HelpCircle size={16} /> },
            ].map(tab => (
              <button
                key={tab.id}
                className="help-tab-btn"
                onClick={() => setActiveTab(tab.id)}
                style={{ color: activeTab === tab.id ? "#a78bfa" : "rgba(148,163,184,0.5)" }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
