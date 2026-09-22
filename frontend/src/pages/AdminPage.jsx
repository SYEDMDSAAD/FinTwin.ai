import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import API from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  LayoutDashboard, Users, FileText, Activity, LogOut,
  Crown, UserX, UserCheck, UserMinus, RefreshCw, Search,
  Shield, TrendingUp, Mail, Eye, Trash2, Key,
  ChevronRight, X, AlertTriangle, CheckCircle, XCircle,
  ArrowUpRight, Clock, Cpu, Database,
  ShieldAlert, MessageSquare, Ban, Send, AlertOctagon,
  Unlock, BarChart2, Zap, Server, Wifi, MessageCircle, Rocket } from "lucide-react";
import AdminIpos from "../components/admin/AdminIpos";
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line
} from "recharts";

// ─── Styles ──────────────────────────────────────────────────────────────────
const G = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080a0f; }
  .adm { font-family: 'DM Sans', system-ui, sans-serif; min-height: 100vh; background: #080a0f; color: #e2e8f0; display: flex; }
  .sidebar { width: 220px; min-width: 220px; background: #0b0d14; border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; position: fixed; top: 0; left: 0; height: 100vh; z-index: 10; }
  .main { margin-left: 220px; flex: 1; min-height: 100vh; display: flex; flex-direction: column; }
  .topbar { height: 60px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(0,0,0,0.3); display: flex; align-items: center; padding: 0 28px; gap: 16px; position: sticky; top: 0; z-index: 5; backdrop-filter: blur(12px); }
  .content { padding: 28px; flex: 1; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; color: rgba(148,163,184,0.7); transition: all 0.15s; border: 1px solid transparent; margin: 2px 10px; }
  .nav-item:hover { background: rgba(255,255,255,0.04); color: #e2e8f0; }
  .nav-item.active { background: rgba(167,139,250,0.1); color: #a78bfa; border-color: rgba(167,139,250,0.2); }
  .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; }
  .stat-card { padding: 22px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); }
  .grid4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 14px; margin-bottom: 24px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  .tbl { width: 100%; border-collapse: collapse; }
  .tbl th { font-size: 10px; font-weight: 700; color: rgba(148,163,184,0.45); letter-spacing: 0.08em; padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: left; }
  .tbl td { padding: 13px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; vertical-align: middle; }
  .tbl tr:last-child td { border-bottom: none; }
  .tbl tr:hover td { background: rgba(255,255,255,0.02); }
  .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; }
  .b-admin { background: rgba(167,139,250,0.15); color: #a78bfa; border: 1px solid rgba(167,139,250,0.25); }
  .b-user  { background: rgba(148,163,184,0.08); color: rgba(148,163,184,0.55); border: 1px solid rgba(148,163,184,0.1); }
  .b-ok    { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.18); }
  .b-off   { background: rgba(239,68,68,0.08); color: #f87171; border: 1px solid rgba(239,68,68,0.15); }
  .b-warn  { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
  .b-cyan  { background: rgba(34,211,238,0.08); color: #22d3ee; border: 1px solid rgba(34,211,238,0.15); }
  .b-open  { background: rgba(239,68,68,0.08); color: #f87171; border: 1px solid rgba(239,68,68,0.15); }
  .b-inprog{ background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
  .b-res   { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.18); }
  .ab { padding: 5px 11px; border-radius: 8px; border: none; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s; display: inline-flex; align-items: center; gap: 5px; }
  .ab:disabled { opacity: 0.35; cursor: not-allowed; }
  .ab-red    { background: rgba(239,68,68,0.1); color: #f87171; border: 1px solid rgba(239,68,68,0.2); }
  .ab-red:hover:not(:disabled)    { background: rgba(239,68,68,0.2); }
  .ab-green  { background: rgba(52,211,153,0.1); color: #34d399; border: 1px solid rgba(52,211,153,0.2); }
  .ab-green:hover:not(:disabled)  { background: rgba(52,211,153,0.2); }
  .ab-purple { background: rgba(167,139,250,0.1); color: #a78bfa; border: 1px solid rgba(167,139,250,0.2); }
  .ab-purple:hover:not(:disabled) { background: rgba(167,139,250,0.2); }
  .ab-cyan   { background: rgba(34,211,238,0.1); color: #22d3ee; border: 1px solid rgba(34,211,238,0.2); }
  .ab-cyan:hover:not(:disabled)   { background: rgba(34,211,238,0.2); }
  .ab-gray   { background: rgba(148,163,184,0.07); color: rgba(148,163,184,0.6); border: 1px solid rgba(148,163,184,0.12); }
  .ab-gray:hover:not(:disabled)   { background: rgba(148,163,184,0.14); }
  .ab-dred   { background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
  .ab-dred:hover:not(:disabled)   { background: rgba(239,68,68,0.25); }
  .ab-yellow { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
  .ab-yellow:hover:not(:disabled) { background: rgba(251,191,36,0.2); }
  .inp { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 9px 14px; color: #e2e8f0; font-size: 13px; outline: none; font-family: inherit; }
  .inp:focus { border-color: rgba(167,139,250,0.4); }
  .inp::placeholder { color: rgba(100,116,139,0.5); }
  .txtarea { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 10px; padding: 10px 14px; color: #e2e8f0; font-size: 13px; outline: none; font-family: inherit; resize: vertical; width: 100%; }
  .txtarea:focus { border-color: rgba(167,139,250,0.4); }
  .txtarea::placeholder { color: rgba(100,116,139,0.5); }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.7s linear infinite; }
  @keyframes slide-in { from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none} }
  .slide-in { animation: slide-in 0.25s ease; }
  @keyframes fade-in { from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none} }
  .fade-in { animation: fade-in 0.3s ease; }
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 50; display: flex; align-items: center; justify-content: center; padding: 24px; backdrop-filter: blur(6px); }
  .modal { background: #0e1018; border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 28px; width: 100%; max-width: 560px; max-height: 85vh; overflow-y: auto; }
  .section-title { font-size: 11px; font-weight: 700; color: rgba(148,163,184,0.4); letter-spacing: 0.1em; padding: 20px 16px 6px; }
  .risk-low  { color: #34d399; }
  .risk-med  { color: #fbbf24; }
  .risk-high { color: #f87171; }
  @media(max-width:768px){ .sidebar{transform:translateX(-100%)} .main{margin-left:0} .grid2{grid-template-columns:1fr} }
`;

const NAV = [
  { id: "overview",    label: "Overview",        icon: LayoutDashboard },
  { id: "users",       label: "Users",            icon: Users },
  { id: "audit",       label: "Audit Logs",       icon: FileText },
  { id: "monitoring",  label: "Monitoring",       icon: BarChart2 },
  { id: "platform",    label: "Platform Health",  icon: Activity },
  { id: "security",    label: "Security",         icon: ShieldAlert },
  { id: "tickets",     label: "Support Tickets",  icon: MessageSquare },
  { id: "ipos",        label: "IPO Catalog",      icon: Rocket },
];

const fmt = (dt) =>
  dt ? new Date(dt).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—";
const fmtDate = (dt) =>
  dt ? new Date(dt).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—";

const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0e1018", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"10px 14px", fontSize:12 }}>
      <div style={{ color:"rgba(148,163,184,0.6)", marginBottom:4 }}>{label}</div>
      <div style={{ color:"#a78bfa", fontWeight:700 }}>{payload[0].value} users</div>
    </div>
  );
};

// ─── Overview Section ─────────────────────────────────────────────────────────

function OverviewSection({ stats, signups, adoption, loading }) {
  const statCards = [
    { label:"Total Users",     value:stats?.totalUsers,       color:"#22d3ee", icon:<Users size={16}/> },
    { label:"Active Users",    value:stats?.activeUsers,      color:"#34d399", icon:<UserCheck size={16}/> },
    { label:"New This Week",   value:stats?.newUsersThisWeek, color:"#a78bfa", icon:<TrendingUp size={16}/> },
    { label:"Admins",          value:stats?.adminCount,       color:"#f59e0b", icon:<Shield size={16}/> },
  ];

  const total = adoption?.total || 1;
  const adoptionBars = [
    { label:"Onboarding done",  value:adoption?.onboardingCompleted || 0, color:"#a78bfa" },
    { label:"Bank connected",   value:adoption?.bankConnected || 0,       color:"#22d3ee" },
    { label:"2FA enabled",      value:adoption?.twoFactorEnabled || 0,    color:"#34d399" },
  ];

  return (
    <div className="fade-in">
      <div className="grid4">
        {statCards.map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <span style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.45)", letterSpacing:"0.08em" }}>{s.label.toUpperCase()}</span>
              <span style={{ color:s.color, opacity:0.7 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize:32, fontWeight:800, color:"#fff", letterSpacing:"-0.02em" }}>
              {loading ? "—" : s.value ?? 0}
            </div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card" style={{ padding:22 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:18 }}>Signups — last 30 days</div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={signups} margin={{ top:4, right:4, left:-24, bottom:0 }}>
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="date" tick={{ fontSize:10, fill:"rgba(148,163,184,0.4)" }} tickLine={false} axisLine={false}
                interval={Math.floor((signups?.length||30)/6)}/>
              <YAxis tick={{ fontSize:10, fill:"rgba(148,163,184,0.4)" }} tickLine={false} axisLine={false} allowDecimals={false}/>
              <Tooltip content={<ChartTip/>}/>
              <Area type="monotone" dataKey="count" stroke="#a78bfa" strokeWidth={2} fill="url(#sg)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card" style={{ padding:22 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:20 }}>Feature Adoption</div>
          {adoptionBars.map(a => {
            const pct = Math.round((a.value / total) * 100);
            return (
              <div key={a.label} style={{ marginBottom:18 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                  <span style={{ fontSize:12, color:"rgba(148,163,184,0.7)" }}>{a.label}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:a.color }}>{a.value} <span style={{ color:"rgba(148,163,184,0.4)", fontWeight:400 }}>({pct}%)</span></span>
                </div>
                <div style={{ height:6, background:"rgba(255,255,255,0.06)", borderRadius:4, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:a.color, borderRadius:4, transition:"width 0.8s ease" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Users Section ────────────────────────────────────────────────────────────

function UsersSection({ user: currentUser, onUserClick }) {
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [actId, setActId]   = useState(null);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await API.get("/admin/users");
      // Backend returns { users: [...], totalPages: N } — extract the array
      // Backend returns { content: [...], totalElements: N, totalPages: N }
      setUsers(Array.isArray(r.data) ? r.data : (r.data.content ?? []));
    }
    catch { toast.error("Failed to load users"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const action = async (endpoint, method, id, key, successMsg) => {
    try {
      setActId(id + key);
      if (method === "delete") await API.delete(endpoint);
      else await API.put(endpoint, method === "role" ? method : undefined);
      toast.success(successMsg);
      await load();
    } catch (err) { toast.error(err.response?.data || "Action failed"); }
    finally { setActId(null); }
  };

  const toggleEnabled = (u) =>
    action(`/admin/users/${u.id}/${u.enabled ? "deactivate" : "activate"}`, "put", u.id, "en",
      u.enabled ? "User deactivated" : "User activated");

  const toggleRole = (u) => {
    const nr = u.role === "ADMIN" ? "USER" : "ADMIN";
    API.put(`/admin/users/${u.id}/role`, { role: nr })
      .then(() => { toast.success(`Role → ${nr}`); load(); })
      .catch(e => toast.error(e.response?.data || "Failed"));
  };

  const forceLogout = (u) =>
    action(`/admin/users/${u.id}/force-logout`, "put", u.id, "fl", "Session invalidated");

  const resetPw = async (u) => {
    try {
      setActId(u.id + "rp");
      const r = await API.post(`/admin/users/${u.id}/reset-password`);
      if (r.data.temporaryPassword) {
        // Email not configured — show temp password with warning so admin can share it manually
        toast(
          `⚠️ Email not configured. Temp password: ${r.data.temporaryPassword}`,
          { duration: 15000, style: { background: "#451a03", color: "#fbbf24", border: "1px solid #92400e" } }
        );
      } else {
        toast.success(r.data.message || "Password reset — emailed to user.");
      }
      await load();
    } catch { toast.error("Reset failed"); }
    finally { setActId(null); }
  };

  const impersonate = async (u) => {
    try {
      setActId(u.id + "imp");
      const r = await API.post(`/admin/users/${u.id}/impersonate`);
      localStorage.setItem("_imp_token", r.data.token);
      localStorage.setItem("_imp_user", JSON.stringify({ email: r.data.email, fullName: r.data.fullName, role: r.data.role }));
      window.open("/", "_blank");
      toast.success(`Impersonating ${r.data.email} in new tab`);
    } catch { toast.error("Impersonation failed"); }
    finally { setActId(null); }
  };

  const deleteUser = async (u) => {
    if (!confirm(`Delete ${u.fullName}? This is permanent.`)) return;
    try {
      setActId(u.id + "del");
      await API.delete(`/admin/users/${u.id}`);
      toast.success("User deleted");
      await load();
    } catch (e) { toast.error(e.response?.data || "Delete failed"); }
    finally { setActId(null); }
  };

  const handlePromote = async () => {
    if (!promoteEmail.trim()) { toast.error("Enter an email"); return; }
    try {
      setPromoting(true);
      await API.post("/admin/users/promote-by-email", { email: promoteEmail.trim() });
      toast.success(`${promoteEmail} promoted to Admin`);
      setPromoteEmail("");
      await load();
    } catch (e) { toast.error(e.response?.data || "Promotion failed"); }
    finally { setPromoting(false); }
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const match = (u.fullName||"").toLowerCase().includes(q) || (u.email||"").toLowerCase().includes(q);
    if (filter === "admin") return match && u.role === "ADMIN";
    if (filter === "disabled") return match && !u.enabled;
    return match;
  });

  return (
    <div className="fade-in">
      <div className="card" style={{ padding:20, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <Crown size={14} color="#a78bfa"/>
          <span style={{ fontSize:13, fontWeight:700, color:"#fff" }}>Promote User to Admin</span>
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, flex:1, minWidth:200, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.09)", borderRadius:10, padding:"0 14px" }}>
            <Mail size={13} color="rgba(148,163,184,0.4)"/>
            <input className="inp" style={{ border:"none", background:"transparent", flex:1, padding:"10px 0" }}
              type="email" placeholder="user@example.com" value={promoteEmail}
              onChange={e=>setPromoteEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handlePromote()}/>
          </div>
          <button className="ab ab-purple" style={{ padding:"10px 18px", fontSize:12 }}
            onClick={handlePromote} disabled={promoting||!promoteEmail.trim()}>
            <Crown size={12}/> {promoting ? "…" : "Make Admin"}
          </button>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, minWidth:200 }} className="inp">
          <Search size={13} color="rgba(148,163,184,0.4)"/>
          <input style={{ background:"transparent", border:"none", outline:"none", color:"#e2e8f0", fontSize:13, fontFamily:"inherit", flex:1 }}
            placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        {["all","admin","disabled"].map(f => (
          <button key={f} className="ab" onClick={()=>setFilter(f)}
            style={{ background:filter===f?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)",
                     color:filter===f?"#a78bfa":"rgba(148,163,184,0.6)",
                     border:`1px solid ${filter===f?"rgba(167,139,250,0.3)":"rgba(255,255,255,0.08)"}`,
                     padding:"9px 14px" }}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
        <button className="ab ab-gray" onClick={load} style={{ padding:"9px 14px" }}>
          <RefreshCw size={12} className={loading?"spin":""}/> Refresh
        </button>
      </div>

      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table className="tbl">
            <thead>
              <tr><th>User</th><th>Role</th><th>Status</th><th>2FA</th><th>Joined</th><th>Last Login</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:"rgba(148,163,184,0.4)" }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign:"center", padding:40, color:"rgba(148,163,184,0.4)" }}>No users found.</td></tr>
              ) : filtered.map(u => {
                const isSelf = u.email === currentUser?.email;
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff", flexShrink:0 }}>
                          {(u.fullName||u.email||"?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight:600, color:"#e2e8f0", fontSize:13 }}>
                            {u.fullName||"—"}
                            {isSelf && <span style={{ marginLeft:6, fontSize:9, color:"#a78bfa", fontWeight:800 }}>YOU</span>}
                          </div>
                          <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", fontFamily:"monospace" }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${u.role==="ADMIN"?"b-admin":"b-user"}`}>{u.role==="ADMIN"&&<Crown size={9}/>}{u.role||"USER"}</span></td>
                    <td><span className={`badge ${u.enabled?"b-ok":"b-off"}`}>{u.enabled?"Active":"Disabled"}</span></td>
                    <td style={{ color:u.twoFactorEnabled?"#34d399":"rgba(148,163,184,0.3)", fontSize:12 }}>{u.twoFactorEnabled?"On":"Off"}</td>
                    <td style={{ fontSize:12, color:"rgba(148,163,184,0.5)" }}>{fmtDate(u.createdAt)}</td>
                    <td style={{ fontSize:12, color:"rgba(148,163,184,0.5)" }}>{fmtDate(u.lastLoginAt)}</td>
                    <td>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                        <button className="ab ab-cyan" title="View Detail" onClick={()=>onUserClick(u.id)} style={{ padding:"4px 9px" }}><Eye size={10}/></button>
                        {u.enabled
                          ? <button className="ab ab-red" disabled={isSelf||actId===u.id+"en"} onClick={()=>toggleEnabled(u)}><UserX size={10}/>{actId===u.id+"en"?"…":"Off"}</button>
                          : <button className="ab ab-green" disabled={actId===u.id+"en"} onClick={()=>toggleEnabled(u)}><UserCheck size={10}/>{actId===u.id+"en"?"…":"On"}</button>
                        }
                        {u.role==="ADMIN"
                          ? <button className="ab ab-gray" disabled={isSelf} onClick={()=>toggleRole(u)}><UserMinus size={10}/>Demote</button>
                          : <button className="ab ab-purple" disabled={actId===u.id+"role"} onClick={()=>toggleRole(u)}><Crown size={10}/>Admin</button>
                        }
                        <button className="ab ab-gray" title="Force Logout" disabled={actId===u.id+"fl"} onClick={()=>forceLogout(u)}><LogOut size={10}/></button>
                        <button className="ab ab-gray" title="Reset Password" disabled={actId===u.id+"rp"} onClick={()=>resetPw(u)}><Key size={10}/></button>
                        <button className="ab ab-cyan" title="Impersonate" disabled={isSelf||actId===u.id+"imp"} onClick={()=>impersonate(u)}><ArrowUpRight size={10}/></button>
                        <button className="ab ab-dred" title="Delete User" disabled={isSelf||actId===u.id+"del"} onClick={()=>deleteUser(u)}><Trash2 size={10}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && <div style={{ padding:"10px 14px", fontSize:11, color:"rgba(148,163,184,0.3)", textAlign:"right" }}>{filtered.length} of {users.length} users</div>}
      </div>
    </div>
  );
}

// ─── User Detail Modal ────────────────────────────────────────────────────────

function UserDetailModal({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get(`/admin/users/${userId}`)
      .then(r => setData(r.data))
      .catch(() => toast.error("Failed to load user"))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal fade-in">
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:"#fff" }}>
              {loading?"…":(data?.fullName||"?").charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>{loading?"Loading…":data?.fullName}</div>
              <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", fontFamily:"monospace" }}>{data?.email}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(148,163,184,0.5)", cursor:"pointer" }}><X size={18}/></button>
        </div>

        {loading ? <div style={{ textAlign:"center", padding:40, color:"rgba(148,163,184,0.4)" }}>Loading…</div> : data && (
          <>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:24 }}>
              <span className={`badge ${data.role==="ADMIN"?"b-admin":"b-user"}`}>{data.role||"USER"}</span>
              <span className={`badge ${data.enabled?"b-ok":"b-off"}`}>{data.enabled?"Active":"Disabled"}</span>
              {data.twoFactorEnabled && <span className="badge b-ok">2FA On</span>}
              {data.hasBankConnected && <span className="badge b-ok">Bank Linked</span>}
              {data.onboardingCompleted && <span className="badge b-ok">Onboarded</span>}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              {[
                { label:"Transactions", value:data.transactionCount },
                { label:"Goals",        value:data.goalCount },
                { label:"AI Chats",     value:data.chatCount },
              ].map(s => (
                <div key={s.label} style={{ background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"14px 16px", textAlign:"center" }}>
                  <div style={{ fontSize:22, fontWeight:800, color:"#fff" }}>{s.value}</div>
                  <div style={{ fontSize:11, color:"rgba(148,163,184,0.45)", marginTop:4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
              {[["Joined", data.createdAt],["Last Login", data.lastLoginAt]].map(([l,v]) => (
                <div key={l} style={{ background:"rgba(255,255,255,0.03)", borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ fontSize:10, color:"rgba(148,163,184,0.4)", fontWeight:700, letterSpacing:"0.08em", marginBottom:4 }}>{l.toUpperCase()}</div>
                  <div style={{ fontSize:12, color:"#e2e8f0" }}>{fmt(v)}</div>
                </div>
              ))}
            </div>

            {data.recentActivity?.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.4)", letterSpacing:"0.08em", marginBottom:10 }}>RECENT ACTIVITY</div>
                <div style={{ maxHeight:220, overflowY:"auto" }}>
                  {data.recentActivity.map(a => (
                    <div key={a.id} style={{ display:"flex", gap:10, padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.04)", alignItems:"flex-start" }}>
                      <span className={`badge ${a.success?"b-ok":"b-off"}`} style={{ marginTop:1, whiteSpace:"nowrap" }}>{a.action}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, color:"#e2e8f0" }}>{a.resource} {a.description && `— ${a.description}`}</div>
                        <div style={{ fontSize:10, color:"rgba(148,163,184,0.4)", marginTop:2 }}>{fmt(a.timestamp)} · {a.ipAddress||"unknown IP"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Audit Section ────────────────────────────────────────────────────────────

function AuditSection() {
  const [logs, setLogs]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [pages, setPages]     = useState(1);
  const [page, setPage]       = useState(0);
  const [action, setAction]   = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await API.get("/admin/audit-logs", { params:{ page, size:50, action:action||undefined } });
      setLogs(r.data.content);
      setTotal(r.data.totalElements);
      setPages(r.data.totalPages);
    } catch { toast.error("Failed to load audit logs"); }
    finally { setLoading(false); }
  }, [page, action]);

  useEffect(() => { load(); }, [load]);

  const actions = ["", "LOGIN", "WRITE", "READ", "DELETE"];

  return (
    <div className="fade-in">
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        <span style={{ fontSize:13, fontWeight:600, color:"rgba(148,163,184,0.6)" }}>Filter:</span>
        {actions.map(a => (
          <button key={a||"all"} className="ab" onClick={()=>{setAction(a);setPage(0);}}
            style={{ background:action===a?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)",
                     color:action===a?"#a78bfa":"rgba(148,163,184,0.6)",
                     border:`1px solid ${action===a?"rgba(167,139,250,0.3)":"rgba(255,255,255,0.08)"}`,
                     padding:"8px 13px" }}>
            {a||"All"}
          </button>
        ))}
        <div style={{ marginLeft:"auto", fontSize:12, color:"rgba(148,163,184,0.4)" }}>{total.toLocaleString("en-IN")} events</div>
      </div>

      <div className="card" style={{ overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table className="tbl">
            <thead><tr><th>Time</th><th>Action</th><th>Resource</th><th>Description</th><th>IP</th><th>Result</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign:"center", padding:40, color:"rgba(148,163,184,0.4)" }}>Loading…</td></tr>
              ) : logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontSize:11, color:"rgba(148,163,184,0.5)", whiteSpace:"nowrap" }}>{fmt(l.timestamp)}</td>
                  <td><span className={`badge ${l.action==="LOGIN"?"b-user":l.action==="DELETE"?"b-off":l.action==="WRITE"?"b-warn":"b-ok"}`}>{l.action}</span></td>
                  <td style={{ fontSize:12, color:"rgba(148,163,184,0.7)" }}>{l.resource}</td>
                  <td style={{ fontSize:12, color:"rgba(148,163,184,0.5)", maxWidth:260, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{l.description||"—"}</td>
                  <td style={{ fontSize:11, fontFamily:"monospace", color:"rgba(148,163,184,0.45)" }}>{l.ipAddress||"—"}</td>
                  <td>
                    {l.success
                      ? <CheckCircle size={14} color="#34d399"/>
                      : <div style={{ display:"flex", alignItems:"center", gap:5 }}><XCircle size={14} color="#f87171"/><span style={{ fontSize:11, color:"#f87171" }}>{l.failureReason||"Failed"}</span></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div style={{ padding:"12px 14px", display:"flex", gap:8, justifyContent:"flex-end" }}>
            <button className="ab ab-gray" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Prev</button>
            <span style={{ fontSize:12, color:"rgba(148,163,184,0.5)", alignSelf:"center" }}>Page {page+1} / {pages}</span>
            <button className="ab ab-gray" disabled={page>=pages-1} onClick={()=>setPage(p=>p+1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Platform Section ─────────────────────────────────────────────────────────

function PlatformSection() {
  const [health, setHealth]   = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setLoading(true); const r = await API.get("/admin/health"); setHealth(r.data); }
    catch { toast.error("Failed to load health data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = health ? [
    { label:"Database",            ok:true,              detail:"PostgreSQL — connected" },
    { label:"AI Service (Ollama)", ok:health.aiServiceOnline, detail:health.aiServiceUrl },
    { label:"JWT Auth",            ok:true,              detail:"HS256 — active" },
    { label:"Field Encryption",    ok:true,              detail:"AES-256/GCM" },
  ] : [];

  const metrics = health ? [
    { label:"Total Users",         value:health.totalUsers,           icon:<Users size={14}/>,        color:"#22d3ee" },
    { label:"Total Audit Events",  value:health.totalAuditEvents,     icon:<FileText size={14}/>,     color:"#a78bfa" },
    { label:"Failed Logins Today", value:health.failedLoginsToday,    icon:<AlertTriangle size={14}/>,color:health.failedLoginsToday>10?"#f87171":"#34d399" },
    { label:"Failed Logins (7d)",  value:health.failedLoginsThisWeek, icon:<Shield size={14}/>,       color:health.failedLoginsThisWeek>50?"#f87171":"#fbbf24" },
  ] : [];

  return (
    <div className="fade-in">
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button className="ab ab-gray" onClick={load} style={{ padding:"9px 14px" }}>
          <RefreshCw size={12} className={loading?"spin":""}/> Refresh
        </button>
      </div>

      <div className="grid4" style={{ marginBottom:24 }}>
        {metrics.map(m => (
          <div key={m.label} className="stat-card">
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
              <span style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.4)", letterSpacing:"0.08em" }}>{m.label.toUpperCase()}</span>
              <span style={{ color:m.color, opacity:0.7 }}>{m.icon}</span>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:"#fff" }}>{loading?"—":m.value?.toLocaleString("en-IN")}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding:22 }}>
        <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:18 }}>Service Status</div>
        {loading ? <div style={{ color:"rgba(148,163,184,0.4)", fontSize:13 }}>Checking…</div> : rows.map(r => (
          <div key={r.label} style={{ display:"flex", alignItems:"center", gap:14, padding:"13px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
            {r.ok ? <CheckCircle size={16} color="#34d399"/> : <XCircle size={16} color="#f87171"/>}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{r.label}</div>
              <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", marginTop:2 }}>{r.detail}</div>
            </div>
            <span className={`badge ${r.ok?"b-ok":"b-off"}`}>{r.ok?"Online":"Offline"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Security Section ─────────────────────────────────────────────────────────

function SecuritySection() {
  const [posture,   setPosture]   = useState(null);
  const [brute,     setBrute]     = useState([]);
  const [attacks,   setAttacks]   = useState([]);
  const [sessions,  setSessions]  = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [blocked,   setBlocked]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [blockIP,   setBlockIP]   = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockHours, setBlockHours]  = useState("");
  const [actId, setActId] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [p, b, a, s, d, ip] = await Promise.all([
        API.get("/admin/security/posture"),
        API.get("/admin/security/brute-force"),
        API.get("/admin/security/account-attacks"),
        API.get("/admin/security/suspicious-sessions"),
        API.get("/admin/security/data-anomalies"),
        API.get("/admin/security/blocked-ips"),
      ]);
      setPosture(p.data);
      setBrute(b.data);
      setAttacks(a.data);
      setSessions(s.data);
      setAnomalies(d.data);
      setBlocked(ip.data);
    } catch { toast.error("Failed to load security data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const riskColor = { LOW:"#34d399", MEDIUM:"#fbbf24", HIGH:"#f87171" };
  const riskBg    = { LOW:"rgba(52,211,153,0.08)", MEDIUM:"rgba(251,191,36,0.08)", HIGH:"rgba(239,68,68,0.08)" };
  const sevColor  = { CRITICAL:"#f87171", HIGH:"#fb923c", MEDIUM:"#fbbf24" };
  const risk = posture?.riskLevel || "LOW";

  const doBlockIP = async () => {
    if (!blockIP.trim()) { toast.error("Enter an IP address"); return; }
    try {
      setActId("block");
      await API.post("/admin/security/blocked-ips", { ip: blockIP.trim(), reason: blockReason.trim(), expiresHours: blockHours||undefined });
      toast.success(`${blockIP} blocked`);
      setBlockIP(""); setBlockReason(""); setBlockHours("");
      await load();
    } catch (e) { toast.error(e.response?.data || "Block failed"); }
    finally { setActId(null); }
  };

  const doUnblock = async (ip) => {
    try {
      setActId("unblock-" + ip);
      await API.delete(`/admin/security/blocked-ips/${encodeURIComponent(ip)}`);
      toast.success("IP unblocked");
      await load();
    } catch { toast.error("Unblock failed"); }
    finally { setActId(null); }
  };

  const doBlockFromBrute = async (ip) => {
    try {
      setActId("bl-" + ip);
      await API.post("/admin/security/blocked-ips", { ip, reason: "Brute force — blocked from admin panel" });
      toast.success(`${ip} blocked`);
      await load();
    } catch (e) { toast.error(e.response?.data || "Block failed"); }
    finally { setActId(null); }
  };

  const doForceLogout = async (userId, label) => {
    try {
      setActId("fl-" + userId);
      await API.put(`/admin/users/${userId}/force-logout`);
      toast.success(`Session of ${label} invalidated`);
    } catch { toast.error("Force logout failed"); }
    finally { setActId(null); }
  };

  const SectionHead = ({ title, count }) => (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
      <span style={{ fontSize:14, fontWeight:700, color:"#fff" }}>{title}</span>
      {count > 0 && <span className="badge" style={{ background:`${riskBg.HIGH}`, color:"#f87171", border:"1px solid rgba(239,68,68,0.2)" }}>{count}</span>}
      {count === 0 && <span className="badge b-ok">Clean</span>}
    </div>
  );

  const Empty = () => (
    <div style={{ padding:"18px 14px", color:"rgba(148,163,184,0.35)", fontSize:12 }}>No threats detected.</div>
  );

  return (
    <div className="fade-in">
      {/* Top controls */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:18 }}>
        <button className="ab ab-gray" onClick={load} style={{ padding:"9px 14px" }}>
          <RefreshCw size={12} className={loading?"spin":""}/> Refresh
        </button>
      </div>

      {/* Posture cards */}
      {posture && (
        <div style={{ background:riskBg[risk], border:`1px solid ${riskColor[risk]}30`, borderRadius:16, padding:"20px 24px", marginBottom:20, display:"flex", gap:24, flexWrap:"wrap", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.5)", letterSpacing:"0.08em", marginBottom:4 }}>RISK LEVEL</div>
            <div style={{ fontSize:32, fontWeight:900, color:riskColor[risk] }}>{risk}</div>
          </div>
          <div style={{ width:1, height:50, background:"rgba(255,255,255,0.06)" }}/>
          {[
            ["Brute-force IPs",     posture.bruteForceIPs],
            ["Targeted Accounts",   posture.targetedAccounts],
            ["Suspicious Sessions", posture.suspiciousSessions],
            ["Data Anomalies",      posture.dataAnomalies],
            ["Blocked IPs",         posture.blockedIPs],
            ["Without 2FA",         posture.usersWithout2FA],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.45)", letterSpacing:"0.07em", marginBottom:4 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize:22, fontWeight:800, color: val > 0 ? "#fbbf24" : "#34d399" }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Configuration hardening — surfaced from posture.configIssues */}
      {posture && (
        <div className="card" style={{ padding:20, marginBottom:20 }}>
          <SectionHead title="Configuration & Hardening" count={posture.configIssueCount || 0}/>
          {(!posture.configIssues || posture.configIssues.length === 0) ? (
            <div style={{ padding:"18px 14px", color:"rgba(148,163,184,0.35)", fontSize:12 }}>
              No misconfiguration detected — secrets, transport, and CORS look hardened.
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {posture.configIssues.map((iss, i) => {
                const sev = iss.severity || "MEDIUM";
                const c = sevColor[sev] || sevColor.MEDIUM;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12, padding:"12px 14px", borderRadius:10, background:`${c}12`, border:`1px solid ${c}30` }}>
                    <span className="badge" style={{ background:`${c}1f`, color:c, border:`1px solid ${c}40`, flexShrink:0, marginTop:1 }}>{sev}</span>
                    <div style={{ minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{iss.area}</div>
                      <div style={{ fontSize:12, color:"rgba(203,213,225,0.75)", marginTop:2 }}>{iss.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:18 }}>

        {/* Brute Force */}
        <div className="card" style={{ padding:20 }}>
          <SectionHead title="Brute-Force IPs" count={brute.length}/>
          {brute.length === 0 ? <Empty/> : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>IP Address</th><th>Failed Attempts</th><th>Period</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {brute.map(r => (
                    <tr key={r.ip}>
                      <td style={{ fontFamily:"monospace", fontSize:13 }}>{r.ip}</td>
                      <td><span style={{ color:"#f87171", fontWeight:700 }}>{r.failedAttempts}</span></td>
                      <td style={{ color:"rgba(148,163,184,0.5)", fontSize:12 }}>{r.period}</td>
                      <td><span className={`badge ${r.isBlocked?"b-off":"b-warn"}`}>{r.isBlocked?"Blocked":"Active"}</span></td>
                      <td>
                        {!r.isBlocked && (
                          <button className="ab ab-red" disabled={actId==="bl-"+r.ip} onClick={()=>doBlockFromBrute(r.ip)}>
                            <Ban size={10}/> {actId==="bl-"+r.ip?"…":"Block IP"}
                          </button>
                        )}
                        {r.isBlocked && <span style={{ fontSize:11, color:"rgba(148,163,184,0.35)" }}>Already blocked</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Account Attacks */}
        <div className="card" style={{ padding:20 }}>
          <SectionHead title="Targeted Accounts" count={attacks.length}/>
          {attacks.length === 0 ? <Empty/> : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>User</th><th>Failed Attempts</th><th>Period</th><th>Account</th><th>Action</th></tr></thead>
                <tbody>
                  {attacks.map(r => (
                    <tr key={r.userId}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.fullName||"Unknown"}</div>
                        <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", fontFamily:"monospace" }}>{r.email}</div>
                      </td>
                      <td><span style={{ color:"#f87171", fontWeight:700 }}>{r.failedAttempts}</span></td>
                      <td style={{ color:"rgba(148,163,184,0.5)", fontSize:12 }}>{r.period}</td>
                      <td><span className={`badge ${r.enabled?"b-ok":"b-off"}`}>{r.enabled?"Active":"Disabled"}</span></td>
                      <td>
                        <button className="ab ab-yellow" disabled={actId==="fl-"+r.userId} onClick={()=>doForceLogout(r.userId, r.email||r.userId)}>
                          <LogOut size={10}/> {actId==="fl-"+r.userId?"…":"Force Logout"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Suspicious Sessions */}
        <div className="card" style={{ padding:20 }}>
          <SectionHead title="Suspicious Sessions" count={sessions.length}/>
          {sessions.length === 0 ? <Empty/> : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>User</th><th>Distinct IPs</th><th>Period</th><th>Last Login</th><th>Action</th></tr></thead>
                <tbody>
                  {sessions.map(r => (
                    <tr key={r.userId}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.fullName||"Unknown"}</div>
                        <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", fontFamily:"monospace" }}>{r.email}</div>
                      </td>
                      <td><span style={{ color:"#fbbf24", fontWeight:700 }}>{r.distinctIPs}</span></td>
                      <td style={{ color:"rgba(148,163,184,0.5)", fontSize:12 }}>{r.period}</td>
                      <td style={{ fontSize:12, color:"rgba(148,163,184,0.5)" }}>{fmt(r.lastLoginAt)}</td>
                      <td>
                        <button className="ab ab-yellow" disabled={actId==="fl-"+r.userId} onClick={()=>doForceLogout(r.userId, r.email||r.userId)}>
                          <LogOut size={10}/> {actId==="fl-"+r.userId?"…":"Force Logout"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Data Anomalies */}
        <div className="card" style={{ padding:20 }}>
          <SectionHead title="Data Access Anomalies" count={anomalies.length}/>
          {anomalies.length === 0 ? <Empty/> : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>User</th><th>Read Ops (24h)</th><th>Period</th></tr></thead>
                <tbody>
                  {anomalies.map(r => (
                    <tr key={r.userId}>
                      <td>
                        <div style={{ fontWeight:600, fontSize:13 }}>{r.fullName||"Unknown"}</div>
                        <div style={{ fontSize:11, color:"rgba(148,163,184,0.5)", fontFamily:"monospace" }}>{r.email}</div>
                      </td>
                      <td><span style={{ color:"#f87171", fontWeight:700, fontSize:14 }}>{r.readCount}</span></td>
                      <td style={{ color:"rgba(148,163,184,0.5)", fontSize:12 }}>{r.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* IP Blocklist */}
        <div className="card" style={{ padding:20 }}>
          <SectionHead title="IP Blocklist" count={blocked.length}/>

          {/* Add block form */}
          <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"rgba(148,163,184,0.6)", letterSpacing:"0.06em", marginBottom:12 }}>BLOCK AN IP</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              <input className="inp" style={{ flex:2, minWidth:140 }} placeholder="IP address (e.g. 1.2.3.4)" value={blockIP} onChange={e=>setBlockIP(e.target.value)}/>
              <input className="inp" style={{ flex:2, minWidth:140 }} placeholder="Reason (optional)" value={blockReason} onChange={e=>setBlockReason(e.target.value)}/>
              <input className="inp" style={{ width:110 }} placeholder="Hours (blank = permanent)" value={blockHours} onChange={e=>setBlockHours(e.target.value)} type="number" min={1}/>
              <button className="ab ab-red" style={{ padding:"9px 16px" }} disabled={actId==="block"||!blockIP.trim()} onClick={doBlockIP}>
                <Ban size={12}/> {actId==="block"?"…":"Block IP"}
              </button>
            </div>
          </div>

          {blocked.length === 0 ? (
            <div style={{ color:"rgba(148,163,184,0.35)", fontSize:12, padding:"8px 0" }}>No IPs currently blocked.</div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table className="tbl">
                <thead><tr><th>IP Address</th><th>Reason</th><th>Blocked By</th><th>Blocked At</th><th>Expires</th><th>Action</th></tr></thead>
                <tbody>
                  {blocked.map(b => (
                    <tr key={b.ipAddress}>
                      <td style={{ fontFamily:"monospace", fontSize:13 }}>{b.ipAddress}</td>
                      <td style={{ fontSize:12, color:"rgba(148,163,184,0.6)" }}>{b.reason||"—"}</td>
                      <td style={{ fontSize:12, color:"rgba(148,163,184,0.5)" }}>{b.blockedBy||"system"}</td>
                      <td style={{ fontSize:11, color:"rgba(148,163,184,0.45)" }}>{fmt(b.blockedAt)}</td>
                      <td style={{ fontSize:11, color: b.expiresAt ? "#fbbf24" : "rgba(148,163,184,0.35)" }}>
                        {b.expiresAt ? fmt(b.expiresAt) : "Permanent"}
                      </td>
                      <td>
                        <button className="ab ab-green" disabled={actId==="unblock-"+b.ipAddress} onClick={()=>doUnblock(b.ipAddress)}>
                          <Unlock size={10}/> {actId==="unblock-"+b.ipAddress?"…":"Unblock"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Tickets Section ──────────────────────────────────────────────────────────

const CAT_LABELS = {
  LOGIN_ISSUE:     "Login Issue",
  ACCOUNT_BLOCKED: "Account Blocked",
  BUG:             "Bug",
  BILLING:         "Billing",
  OTHER:           "Other",
};

function TicketReplyModal({ ticket, onClose, onDone }) {
  const [reply,   setReply]   = useState("");
  const [sending, setSending] = useState(false);
  const [note,    setNote]    = useState("");
  const [resolving, setResolving] = useState(false);
  const [view,    setView]    = useState("reply"); // "reply" | "resolve"

  const sendReply = async () => {
    if (!reply.trim()) { toast.error("Enter a reply message"); return; }
    try {
      setSending(true);
      await API.post(`/admin/tickets/${ticket.id}/reply`, { reply: reply.trim() });
      toast.success("Reply sent to " + ticket.userEmail);
      onDone();
      onClose();
    } catch (e) {
      const msg = e.response?.data?.error || "Failed to send reply";
      toast.error(msg);
    } finally { setSending(false); }
  };

  const resolve = async () => {
    try {
      setResolving(true);
      await API.put(`/admin/tickets/${ticket.id}/resolve`, { note: note.trim() });
      toast.success("Ticket resolved");
      onDone();
      onClose();
    } catch { toast.error("Failed to resolve"); }
    finally { setResolving(false); }
  };

  return (
    <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal fade-in" style={{ maxWidth:520 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff" }}>Ticket #{ticket.id}</div>
            <div style={{ fontSize:12, color:"rgba(148,163,184,0.5)", marginTop:2 }}>{ticket.userEmail}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(148,163,184,0.5)", cursor:"pointer" }}><X size={18}/></button>
        </div>

        {/* Original message */}
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:14, marginBottom:18 }}>
          <div style={{ display:"flex", gap:8, marginBottom:8, flexWrap:"wrap" }}>
            <span className={`badge ${ticket.status==="OPEN"?"b-open":ticket.status==="IN_PROGRESS"?"b-inprog":"b-res"}`}>{ticket.status}</span>
            <span className="badge b-cyan">{CAT_LABELS[ticket.category]||ticket.category}</span>
            {ticket.userName && <span className="badge b-user">{ticket.userName}</span>}
          </div>
          <p style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.7, margin:0 }}>{ticket.message}</p>
          <div style={{ fontSize:11, color:"rgba(148,163,184,0.35)", marginTop:8 }}>{fmt(ticket.createdAt)}</div>
        </div>

        {/* Tab switch */}
        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          <button className="ab" onClick={()=>setView("reply")}
            style={{ background:view==="reply"?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)",
                     color:view==="reply"?"#a78bfa":"rgba(148,163,184,0.6)",
                     border:`1px solid ${view==="reply"?"rgba(167,139,250,0.3)":"rgba(255,255,255,0.08)"}`, padding:"8px 14px" }}>
            <Send size={11}/> Reply via Email
          </button>
          <button className="ab" onClick={()=>setView("resolve")}
            style={{ background:view==="resolve"?"rgba(52,211,153,0.1)":"rgba(255,255,255,0.04)",
                     color:view==="resolve"?"#34d399":"rgba(148,163,184,0.6)",
                     border:`1px solid ${view==="resolve"?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.08)"}`, padding:"8px 14px" }}>
            <CheckCircle size={11}/> Mark Resolved
          </button>
        </div>

        {view === "reply" ? (
          <>
            <textarea className="txtarea" rows={5} placeholder={`Reply to ${ticket.userEmail}…`} value={reply} onChange={e=>setReply(e.target.value)}/>
            <div style={{ fontSize:11, color:"rgba(148,163,184,0.35)", marginTop:6, marginBottom:14 }}>
              This will be sent as an email to {ticket.userEmail}. Email must be configured in .env.
            </div>
            <button className="ab ab-purple" style={{ width:"100%", padding:"11px", fontSize:13, justifyContent:"center" }}
              disabled={sending||!reply.trim()} onClick={sendReply}>
              <Send size={13}/> {sending?"Sending…":"Send Reply"}
            </button>
          </>
        ) : (
          <>
            <textarea className="txtarea" rows={3} placeholder="Admin note (optional — explains resolution)" value={note} onChange={e=>setNote(e.target.value)}/>
            <div style={{ marginTop:14 }}>
              <button className="ab ab-green" style={{ width:"100%", padding:"11px", fontSize:13, justifyContent:"center" }}
                disabled={resolving} onClick={resolve}>
                <CheckCircle size={13}/> {resolving?"Resolving…":"Mark as Resolved"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TicketsSection() {
  const [data,    setData]    = useState({ tickets:[], openCount:0, inProgressCount:0, resolvedCount:0 });
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState("");
  const [expanded, setExpanded] = useState(null);
  const [modal,   setModal]   = useState(null);
  const [actId,   setActId]   = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await API.get("/admin/tickets", filter ? { params:{ status:filter } } : undefined);
      setData(r.data);
    } catch { toast.error("Failed to load tickets"); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const deleteTicket = async (id) => {
    if (!confirm("Delete this ticket?")) return;
    try {
      setActId("del-"+id);
      await API.delete(`/admin/tickets/${id}`);
      toast.success("Ticket deleted");
      await load();
    } catch { toast.error("Delete failed"); }
    finally { setActId(null); }
  };

  const markInProgress = async (id) => {
    try {
      setActId("ip-"+id);
      await API.put(`/admin/tickets/${id}/in-progress`);
      toast.success("Marked In Progress");
      await load();
    } catch { toast.error("Failed"); }
    finally { setActId(null); }
  };

  const filters = [
    { val:"",           label:"All Tickets" },
    { val:"OPEN",       label:"Open" },
    { val:"IN_PROGRESS",label:"In Progress" },
    { val:"RESOLVED",   label:"Resolved" },
  ];

  const statusBadge = (s) => {
    if (s === "OPEN")        return <span className="badge b-open"><AlertOctagon size={9}/>OPEN</span>;
    if (s === "IN_PROGRESS") return <span className="badge b-inprog"><Clock size={9}/>IN PROGRESS</span>;
    return <span className="badge b-res"><CheckCircle size={9}/>RESOLVED</span>;
  };

  return (
    <div className="fade-in">
      {/* Count cards */}
      <div className="grid4" style={{ gridTemplateColumns:"repeat(3,1fr)", marginBottom:20 }}>
        {[
          { label:"Open",       val:data.openCount,       color:"#f87171", bg:"rgba(239,68,68,0.08)", icon:<AlertOctagon size={15}/> },
          { label:"In Progress",val:data.inProgressCount, color:"#fbbf24", bg:"rgba(251,191,36,0.08)", icon:<Clock size={15}/> },
          { label:"Resolved",   val:data.resolvedCount,   color:"#34d399", bg:"rgba(52,211,153,0.08)", icon:<CheckCircle size={15}/> },
        ].map(c => (
          <div key={c.label} className="stat-card" style={{ background:c.bg, borderColor:c.color+"30" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.5)", letterSpacing:"0.08em" }}>{c.label.toUpperCase()}</span>
              <span style={{ color:c.color, opacity:0.8 }}>{c.icon}</span>
            </div>
            <div style={{ fontSize:28, fontWeight:800, color:c.color }}>{loading?"—":c.val}</div>
          </div>
        ))}
      </div>

      {/* Filter + Refresh */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap", alignItems:"center" }}>
        {filters.map(f => (
          <button key={f.val} className="ab" onClick={()=>setFilter(f.val)}
            style={{ background:filter===f.val?"rgba(167,139,250,0.15)":"rgba(255,255,255,0.04)",
                     color:filter===f.val?"#a78bfa":"rgba(148,163,184,0.6)",
                     border:`1px solid ${filter===f.val?"rgba(167,139,250,0.3)":"rgba(255,255,255,0.08)"}`,
                     padding:"8px 13px" }}>
            {f.label}
          </button>
        ))}
        <button className="ab ab-gray" onClick={load} style={{ padding:"8px 13px", marginLeft:"auto" }}>
          <RefreshCw size={12} className={loading?"spin":""}/> Refresh
        </button>
      </div>

      {/* Ticket list */}
      {loading ? (
        <div style={{ textAlign:"center", padding:60, color:"rgba(148,163,184,0.4)" }}>Loading…</div>
      ) : data.tickets.length === 0 ? (
        <div className="card" style={{ padding:40, textAlign:"center", color:"rgba(148,163,184,0.4)" }}>
          <MessageSquare size={28} style={{ opacity:0.2, marginBottom:10 }}/>
          <div>No tickets found.</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {data.tickets.map(t => (
            <div key={t.id} className="card" style={{ padding:0, overflow:"hidden" }}>
              {/* Header row */}
              <div
                style={{ padding:"16px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:12 }}
                onClick={()=>setExpanded(expanded===t.id?null:t.id)}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, flexWrap:"wrap" }}>
                    {statusBadge(t.status)}
                    <span className="badge b-cyan">{CAT_LABELS[t.category]||t.category}</span>
                    <span style={{ fontSize:11, color:"rgba(148,163,184,0.4)", marginLeft:"auto" }}>#{t.id} · {fmtDate(t.createdAt)}</span>
                  </div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", flexShrink:0 }}>
                      {(t.userName||t.userEmail||"?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      {t.userName && <span style={{ fontSize:13, fontWeight:600, color:"#e2e8f0" }}>{t.userName} · </span>}
                      <span style={{ fontSize:12, color:"rgba(148,163,184,0.6)", fontFamily:"monospace" }}>{t.userEmail}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} color="rgba(148,163,184,0.3)" style={{ transform: expanded===t.id?"rotate(90deg)":"none", transition:"transform 0.15s" }}/>
              </div>

              {/* Expanded body */}
              {expanded === t.id && (
                <div style={{ borderTop:"1px solid rgba(255,255,255,0.06)", padding:"16px 20px" }}>
                  <div style={{ fontSize:13, color:"#e2e8f0", lineHeight:1.8, marginBottom:16, whiteSpace:"pre-wrap" }}>
                    {t.message}
                  </div>
                  {t.adminNote && (
                    <div style={{ background:"rgba(52,211,153,0.05)", border:"1px solid rgba(52,211,153,0.15)", borderRadius:10, padding:"10px 14px", marginBottom:14, fontSize:12, color:"#34d399" }}>
                      <span style={{ fontWeight:700 }}>Admin note:</span> {t.adminNote}
                    </div>
                  )}
                  {t.resolvedAt && (
                    <div style={{ fontSize:11, color:"rgba(148,163,184,0.35)", marginBottom:14 }}>Resolved on {fmt(t.resolvedAt)}</div>
                  )}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {t.status !== "RESOLVED" && (
                      <>
                        <button className="ab ab-purple" onClick={()=>setModal(t)}>
                          <Send size={11}/> Reply / Resolve
                        </button>
                        {t.status === "OPEN" && (
                          <button className="ab ab-yellow" disabled={actId==="ip-"+t.id} onClick={()=>markInProgress(t.id)}>
                            <Clock size={11}/> {actId==="ip-"+t.id?"…":"Mark In Progress"}
                          </button>
                        )}
                      </>
                    )}
                    {t.status === "RESOLVED" && (
                      <button className="ab ab-purple" onClick={()=>setModal(t)}>
                        <Send size={11}/> Reply Again
                      </button>
                    )}
                    <button className="ab ab-dred" disabled={actId==="del-"+t.id} onClick={()=>deleteTicket(t.id)} style={{ marginLeft:"auto" }}>
                      <Trash2 size={11}/> {actId==="del-"+t.id?"…":"Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TicketReplyModal ticket={modal} onClose={()=>setModal(null)} onDone={load}/>
      )}
    </div>
  );
}

// ─── Monitoring Section ───────────────────────────────────────────────────────

const HISTORY_MAX = 20;

const MetricTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:"#0e1018", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"8px 12px", fontSize:11 }}>
      <div style={{ color:"rgba(148,163,184,0.5)", marginBottom:3 }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight:700 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

const CB_COLOR = { CLOSED:"#34d399", OPEN:"#f87171", HALF_OPEN:"#fbbf24", UNKNOWN:"rgba(148,163,184,0.4)" };

function MonitoringSection() {
  const [data,    setData]    = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastAt,  setLastAt]  = useState(null);
  const [auto,    setAuto]    = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await API.get("/admin/metrics/live");
      const snap = { ...r.data, t: new Date().toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", second:"2-digit" }) };
      setData(snap);
      setHistory(h => [...h.slice(-(HISTORY_MAX - 1)), snap]);
      setLastAt(new Date());
    } catch { toast.error("Failed to load metrics"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [auto, load]);

  const StatCard = ({ label, value, sub, color = "#a78bfa", icon }) => (
    <div className="stat-card">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <span style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.4)", letterSpacing:"0.08em" }}>{label.toUpperCase()}</span>
        <span style={{ color, opacity:0.7 }}>{icon}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:"#fff", letterSpacing:"-0.02em" }}>
        {loading ? "—" : value ?? 0}
      </div>
      {sub && <div style={{ fontSize:11, color:"rgba(148,163,184,0.4)", marginTop:4 }}>{sub}</div>}
    </div>
  );

  const Spark = ({ dataKey, color, name, unit = "" }) => (
    <ResponsiveContainer width="100%" height={60}>
      <AreaChart data={history} margin={{ top:2, right:0, left:0, bottom:0 }}>
        <defs>
          <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.3}/>
            <stop offset="95%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5}
          fill={`url(#g-${dataKey})`} dot={false} isAnimationActive={false}/>
        <Tooltip content={<MetricTip/>} formatter={v => [`${v}${unit}`, name]}/>
      </AreaChart>
    </ResponsiveContainer>
  );

  const cbState = data?.circuitBreakerState || "UNKNOWN";

  return (
    <div className="fade-in">

      {/* Controls */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
        <button className="ab ab-gray" onClick={load} style={{ padding:"9px 14px" }}>
          <RefreshCw size={12} className={loading?"spin":""}/> Refresh Now
        </button>
        <button className="ab" onClick={()=>setAuto(a=>!a)}
          style={{ background:auto?"rgba(52,211,153,0.1)":"rgba(255,255,255,0.04)",
                   color:auto?"#34d399":"rgba(148,163,184,0.5)",
                   border:`1px solid ${auto?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.08)"}`,
                   padding:"9px 14px" }}>
          <Zap size={12}/> {auto ? "Auto-refresh ON (30s)" : "Auto-refresh OFF"}
        </button>
        {lastAt && (
          <span style={{ fontSize:11, color:"rgba(148,163,184,0.35)", marginLeft:"auto" }}>
            Last updated: {lastAt.toLocaleTimeString("en-IN")}
          </span>
        )}
      </div>
      {/* Circuit Breaker Banner */}
      <div style={{ background: cbState === "OPEN" ? "rgba(239,68,68,0.08)" : cbState === "HALF_OPEN" ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.05)",
                    border: `1px solid ${CB_COLOR[cbState]}30`, borderRadius:14, padding:"16px 22px",
                    marginBottom:20, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <div style={{ width:10, height:10, borderRadius:"50%", background:CB_COLOR[cbState],
                      boxShadow: cbState === "OPEN" ? "0 0 8px #f87171" : cbState === "CLOSED" ? "0 0 8px #34d399" : "none" }}/>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.5)", letterSpacing:"0.08em" }}>AI SERVICE CIRCUIT BREAKER</div>
          <div style={{ fontSize:20, fontWeight:800, color:CB_COLOR[cbState], marginTop:2 }}>{cbState}</div>
        </div>
        <div style={{ marginLeft:"auto", fontSize:12, color:"rgba(148,163,184,0.4)" }}>
          {cbState === "CLOSED" && "AI service is healthy — all requests going through normally"}
          {cbState === "OPEN"   && "AI service is down — all requests are using the statistical fallback"}
          {cbState === "HALF_OPEN" && "AI service recovering — testing with limited traffic"}
          {cbState === "UNKNOWN" && "Resilience4j not yet initialized (no AI calls made yet)"}
        </div>
      </div>

      {/* Auth + Activity */}
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.35)", letterSpacing:"0.1em", marginBottom:12 }}>AUTH & ACTIVITY</div>
      <div className="grid4" style={{ marginBottom:24 }}>
        <StatCard label="Login Success"        value={data?.loginSuccess?.toLocaleString("en-IN")}        sub="today"     color="#34d399" icon={<CheckCircle size={15}/>}/>
        <StatCard label="Login Failures"       value={data?.loginFailure?.toLocaleString("en-IN")}        sub="today"     color="#f87171" icon={<XCircle size={15}/>}/>
        <StatCard label="Total Users"          value={data?.registrations?.toLocaleString("en-IN")}       sub="all-time"  color="#a78bfa" icon={<Users size={15}/>}/>
        <StatCard label="Total Transactions"   value={data?.transactionsCreated?.toLocaleString("en-IN")} sub="all-time"  color="#22d3ee" icon={<TrendingUp size={15}/>}/>
      </div>

      {/* Login trend chart */}
      {history.length > 1 && (
        <div className="card" style={{ padding:20, marginBottom:24 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:14 }}>Login Trend (cumulative)</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={history} margin={{ top:4, right:4, left:-24, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="t" tick={{ fontSize:9, fill:"rgba(148,163,184,0.4)" }} tickLine={false} axisLine={false}/>
              <YAxis tick={{ fontSize:9, fill:"rgba(148,163,184,0.4)" }} tickLine={false} axisLine={false} allowDecimals={false}/>
              <Tooltip content={<MetricTip/>}/>
              <Line type="monotone" dataKey="loginSuccess" stroke="#34d399" strokeWidth={2} dot={false} name="Success" isAnimationActive={false}/>
              <Line type="monotone" dataKey="loginFailure" stroke="#f87171" strokeWidth={2} dot={false} name="Failure" isAnimationActive={false}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI Service */}
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.35)", letterSpacing:"0.1em", marginBottom:12 }}>AI SERVICE</div>
      <div className="grid4" style={{ marginBottom:16 }}>
        <StatCard label="Forecast Calls"    value={data?.aiForecastCalls?.toLocaleString("en-IN")}    color="#a78bfa" icon={<Cpu size={15}/>}/>
        <StatCard label="Forecast Fallbacks" value={data?.aiForecastFallbacks?.toLocaleString("en-IN")} color="#f87171" sub="AI was down — used stats" icon={<AlertTriangle size={15}/>}/>
        <StatCard label="Chat Calls"        value={data?.aiChatCalls?.toLocaleString("en-IN")}         color="#22d3ee" icon={<MessageCircle size={15}/>}/>
        <StatCard label="Forecast P99"      value={data?.aiForecastP99Ms ? `${data.aiForecastP99Ms.toFixed(0)}ms` : "—"} color="#fbbf24" sub="tail latency" icon={<Clock size={15}/>}/>
      </div>

      {history.length > 1 && (
        <div className="grid2" style={{ marginBottom:24 }}>
          <div className="card" style={{ padding:18 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#fff", marginBottom:8 }}>AI Forecast Calls</div>
            <Spark dataKey="aiForecastCalls" color="#a78bfa" name="Calls"/>
          </div>
          <div className="card" style={{ padding:18 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#fff", marginBottom:8 }}>Fallbacks (AI down)</div>
            <Spark dataKey="aiForecastFallbacks" color="#f87171" name="Fallbacks"/>
          </div>
        </div>
      )}

      {/* Database */}
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.35)", letterSpacing:"0.1em", marginBottom:12 }}>DATABASE (HikariCP)</div>
      <div className="grid4" style={{ marginBottom:16 }}>
        <StatCard label="Active Connections" value={data?.dbActive}  color="#22d3ee" sub={`of ${data?.dbMax ?? 20} max`} icon={<Database size={15}/>}/>
        <StatCard label="Pending Requests"   value={data?.dbPending} color={data?.dbPending > 5 ? "#f87171" : "#34d399"} sub="waiting for connection" icon={<Clock size={15}/>}/>
        <StatCard label="Pool Max"           value={data?.dbMax}     color="#a78bfa" icon={<Server size={15}/>}/>
        <div className="stat-card">
          <div style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.4)", letterSpacing:"0.08em", marginBottom:12 }}>POOL UTILISATION</div>
          <div style={{ height:8, background:"rgba(255,255,255,0.06)", borderRadius:4, overflow:"hidden", marginTop:8 }}>
            <div style={{
              height:"100%", borderRadius:4, transition:"width 0.8s ease",
              width: `${Math.min(100, Math.round(((data?.dbActive||0) / (data?.dbMax||20)) * 100))}%`,
              background: (data?.dbActive||0) / (data?.dbMax||20) > 0.8 ? "#f87171" : "#22d3ee"
            }}/>
          </div>
          <div style={{ fontSize:11, color:"rgba(148,163,184,0.4)", marginTop:6 }}>
            {Math.round(((data?.dbActive||0) / (data?.dbMax||20)) * 100)}% used
          </div>
        </div>
      </div>

      {history.length > 1 && (
        <div className="card" style={{ padding:18, marginBottom:24 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#fff", marginBottom:8 }}>DB Active Connections</div>
          <Spark dataKey="dbActive" color="#22d3ee" name="Active"/>
        </div>
      )}

      {/* JVM */}
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.35)", letterSpacing:"0.1em", marginBottom:12 }}>JVM & PROCESS</div>
      <div className="grid4" style={{ marginBottom:16 }}>
        <StatCard label="Heap Used"   value={data?.jvmHeapUsedMb ? `${data.jvmHeapUsedMb} MB` : "—"}  color="#a78bfa" sub={`of ${data?.jvmHeapMaxMb ?? "?"} MB max`} icon={<Cpu size={15}/>}/>
        <StatCard label="Heap %"      value={data?.jvmHeapUsedPct ? `${data.jvmHeapUsedPct}%` : "—"} color={data?.jvmHeapUsedPct > 85 ? "#f87171" : "#34d399"} icon={<Activity size={15}/>}/>
        <StatCard label="CPU Usage"   value={data?.cpuUsagePct != null ? `${data.cpuUsagePct}%` : "—"} color={data?.cpuUsagePct > 80 ? "#f87171" : "#22d3ee"} icon={<Zap size={15}/>}/>
        <StatCard label="Uptime"      value={data?.uptimeSeconds != null ? fmtUptime(data.uptimeSeconds) : "—"} color="#fbbf24" icon={<Clock size={15}/>}/>
      </div>

      {history.length > 1 && (
        <div className="grid2" style={{ marginBottom:24 }}>
          <div className="card" style={{ padding:18 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#fff", marginBottom:8 }}>JVM Heap (MB)</div>
            <Spark dataKey="jvmHeapUsedMb" color="#a78bfa" name="Heap MB" unit=" MB"/>
          </div>
          <div className="card" style={{ padding:18 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#fff", marginBottom:8 }}>CPU %</div>
            <Spark dataKey="cpuUsagePct" color="#22d3ee" name="CPU" unit="%"/>
          </div>
        </div>
      )}

      {/* HTTP */}
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.35)", letterSpacing:"0.1em", marginBottom:12 }}>HTTP REQUESTS</div>
      <div className="grid4" style={{ marginBottom:24 }}>
        <StatCard label="Total Requests" value={data?.httpTotal?.toLocaleString("en-IN")}  color="#22d3ee" icon={<Wifi size={15}/>}/>
        <StatCard label="5xx Errors"     value={data?.httpErrors?.toLocaleString("en-IN")} color={data?.httpErrors > 0 ? "#f87171" : "#34d399"} sub={data?.httpTotal ? `${((data.httpErrors/data.httpTotal)*100).toFixed(2)}% error rate` : ""} icon={<AlertTriangle size={15}/>}/>
        <StatCard label="P99 Latency"    value={data?.httpP99Ms ? `${data.httpP99Ms.toFixed(0)}ms` : "—"} color={data?.httpP99Ms > 1000 ? "#f87171" : "#34d399"} sub="tail latency" icon={<Clock size={15}/>}/>
        <StatCard label="Error Rate"     value={data?.httpTotal ? `${((data?.httpErrors||0)/data.httpTotal*100).toFixed(1)}%` : "—"}
          color={((data?.httpErrors||0)/(data?.httpTotal||1)) > 0.05 ? "#f87171" : "#34d399"} icon={<Shield size={15}/>}/>
      </div>

      {/* SMS */}
      <div style={{ fontSize:11, fontWeight:700, color:"rgba(148,163,184,0.35)", letterSpacing:"0.1em", marginBottom:12 }}>SMS DELIVERY</div>
      <div className="grid4" style={{ marginBottom:8 }}>
        <StatCard label="OTP Sent"   value={data?.smsOtpSent?.toLocaleString("en-IN")} color="#34d399" icon={<Send size={15}/>}/>
        <StatCard label="SMS Failed" value={data?.smsFailed?.toLocaleString("en-IN")}  color={data?.smsFailed > 0 ? "#f87171" : "#34d399"} icon={<AlertTriangle size={15}/>}/>
        <StatCard label="Success Rate"
          value={data?.smsOtpSent != null ? `${Math.round(((data.smsOtpSent)/Math.max(1,data.smsOtpSent+data.smsFailed))*100)}%` : "—"}
          color="#22d3ee" icon={<CheckCircle size={15}/>}/>
        <div className="stat-card" style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, fontWeight:700, color:"rgba(148,163,184,0.4)", letterSpacing:"0.08em", marginBottom:8 }}>SMS STATUS</div>
            <span className={`badge ${data?.smsOtpSent > 0 || data?.smsFailed > 0 ? "b-ok" : "b-user"}`}>
              {data?.smsOtpSent > 0 || data?.smsFailed > 0 ? "Active" : "Not triggered yet"}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

function fmtUptime(seconds) {
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds/60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds/3600)}h ${Math.floor((seconds%3600)/60)}m`;
  return `${Math.floor(seconds/86400)}d ${Math.floor((seconds%86400)/3600)}h`;
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

export default function AdminPage() {
  const navigate      = useNavigate();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("overview");
  const [stats, setStats]       = useState(null);
  const [signups, setSignups]   = useState([]);
  const [adoption, setAdoption] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(null);

  useEffect(() => {
    if (tab === "overview") {
      setOverviewLoading(true);
      Promise.all([
        API.get("/admin/stats"),
        API.get("/admin/analytics/signups"),
        API.get("/admin/analytics/adoption"),
      ]).then(([s, sg, a]) => {
        setStats(s.data);
        setSignups(sg.data);
        setAdoption(a.data);
      }).catch(() => toast.error("Failed to load overview"))
        .finally(() => setOverviewLoading(false));
    }
  }, [tab]);

  const handleLogout = () => { logout(); navigate("/login"); };

  const currentNav = NAV.find(n => n.id === tab);

  return (
    <>
      <style>{G}</style>
      <div className="adm">

        {/* ── Sidebar ── */}
        <nav className="sidebar">
          <div style={{ padding:"20px 16px 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:6 }}>
              <div style={{ width:30, height:30, borderRadius:9, background:"linear-gradient(135deg,#a78bfa,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#fff" }}>F</div>
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:"#fff", letterSpacing:"-0.02em" }}>FinTwin AI</div>
                <div style={{ fontSize:9, color:"rgba(148,163,184,0.4)", letterSpacing:"0.08em" }}>ADMIN PANEL</div>
              </div>
            </div>
          </div>

          <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"0 16px 8px" }}/>

          <div className="section-title">NAVIGATION</div>
          {NAV.map(n => (
            <div key={n.id} className={`nav-item ${tab===n.id?"active":""}`} onClick={()=>setTab(n.id)}>
              <n.icon size={15}/> {n.label}
            </div>
          ))}

          <div style={{ flex:1 }}/>
          <div style={{ height:1, background:"rgba(255,255,255,0.06)", margin:"8px 16px" }}/>

          <div style={{ padding:"8px 10px 20px" }}>
            <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", marginBottom:2 }}>{user?.fullName||"Admin"}</div>
              <div style={{ fontSize:10, color:"rgba(148,163,184,0.45)", wordBreak:"break-all" }}>{user?.email}</div>
              <span className="badge b-admin" style={{ marginTop:8 }}><Crown size={9}/>ADMIN</span>
            </div>
            <button onClick={handleLogout}
              style={{ width:"100%", background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.15)", borderRadius:10, padding:"9px", color:"#f87171", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <LogOut size={13}/> Logout
            </button>
          </div>
        </nav>

        {/* ── Main ── */}
        <div className="main">
          <div className="topbar">
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>{currentNav?.label}</div>
            </div>
            <div style={{ fontSize:11, color:"rgba(148,163,184,0.4)" }}>
              {new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
            </div>
          </div>

          <div className="content">
            {tab === "overview"   && <OverviewSection stats={stats} signups={signups} adoption={adoption} loading={overviewLoading}/>}
            {tab === "users"      && <UsersSection user={user} onUserClick={setSelectedUserId}/>}
            {tab === "audit"      && <AuditSection/>}
            {tab === "monitoring" && <MonitoringSection/>}
            {tab === "platform"   && <PlatformSection/>}
            {tab === "security"   && <SecuritySection/>}
            {tab === "tickets"    && <TicketsSection/>}
            {tab === "ipos"       && <AdminIpos/>}
          </div>
        </div>

        {selectedUserId && (
          <UserDetailModal userId={selectedUserId} onClose={()=>setSelectedUserId(null)}/>
        )}
      </div>
    </>
  );
}
