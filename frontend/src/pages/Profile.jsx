import { User, Mail, Calendar, Wallet, Target, Shield, Sparkles, Edit2, Lock, Trash2, ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";
import toast from "react-hot-toast";
import ChangePasswordModal from "../components/ChangePasswordModal";
import EditProfileModal from "../components/EditProfileModal";
import DeleteAccountModal from "../components/DeleteAccountModal";
import FinancialScoreChart from "../components/FinancialScoreChart";
import BottomNav from "../components/BottomNav";

const CSS = `
  .profile-page * { box-sizing: border-box; }
  .profile-page { font-family:inherit; color: var(--text-primary); }

  /* ── Stat cards ── */
  .p-stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-card);
    padding: 16px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.25s, transform 0.25s;
    min-width: 0;
  }
  .p-stat-card:hover { border-color: var(--border-card-hover); }

  .p-stat-glow {
    position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
    border-radius: 0 0 20px 20px;
  }

  /* ── Stat grid ── */
  .p-stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  @media (max-width: 900px) {
    .p-stats-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 540px) {
    .p-stats-grid { grid-template-columns: 1fr; }
  }

  /* ── Score / history grid ── */
  .p-score-grid {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 900px) {
    .p-score-grid { grid-template-columns: 1fr; }
  }

  /* ── Hero header ── */
  .p-hero-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-top: -44px;
    margin-bottom: 28px;
  }

  /* ── Action buttons ── */
  .p-action-btn {
    display: flex; align-items: center; gap: 9px;
    flex: 1; min-width: 140px;
    height: 46px; padding: 0 20px;
    border-radius: 12px; border: none;
    font-size: 13px; font-weight: 700;
    cursor: pointer; transition: all 0.2s;
    font-family: inherit; 
    justify-content: center;
  }
  .p-action-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.35); }
  .p-btn-danger {
    background: var(--bad-soft);
    color: var(--bad);
    border: 1px solid var(--bad-soft) !important;
  }
  .p-btn-danger:hover {
    background: var(--bad) !important;
    color: #fff !important;
    border-color: var(--bad) !important;
  }

  /* ── Live dot ── */
  @keyframes live-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(1.6)} }
  .live-dot { animation: live-pulse 2s ease infinite; }

  /* ── Animations ── */
  @keyframes profFade { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  .prof-fade  { animation: profFade 0.45s ease both; }
  .prof-fade-2 { animation: profFade 0.45s 0.08s ease both; opacity: 0; }
`;

/* ── Stat card ─────────────────────────────────────────────────────────────── */
function ProfileStat({ icon, label, value }) {
  return (
    <div className="p-stat-card">

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-dim)" }}>
          {label}
        </span>
        <div style={{
          width: 30, height: 30, borderRadius: 99,
          background: "var(--bg-input)", color: "var(--text-secondary)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {icon}
        </div>
      </div>

      <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────────── */
function Profile() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [scoreHistory, setScoreHistory] = useState([]);

  useEffect(() => {
    fetchProfile();
    fetchScoreHistory();
  }, []);

  const fetchProfile = async () => {
    try {
      const r = await API.get("/profile");
      setProfile(r.data);
    } catch { toast.error("Failed to load profile."); }
  };

  const fetchScoreHistory = async () => {
    try {
      const r = await API.get("/profile/score-history");
      setScoreHistory(r.data);
    } catch (e) {
      console.error("Score history unavailable:", e);
    }
  };

  const initial = profile?.fullName?.charAt(0).toUpperCase() || "U";
  const score = profile?.financialScore || 0;
  const scoreColor = score >= 80 ? "var(--good)" : score >= 60 ? "var(--warn)" : "var(--bad)";
  const scoreLabel = score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Improvement";

  return (
    <>
      <style>{CSS}</style>

      <ChangePasswordModal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
      <EditProfileModal open={showEditModal} onClose={() => setShowEditModal(false)} profile={profile} onSuccess={fetchProfile} />
      <DeleteAccountModal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} />

      {/* Outer shell — matches Dashboard layout */}
      <div className="min-h-screen w-full overflow-x-hidden bg-[var(--bg-base)] text-ink flex"
        style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
      >

        <div className="flex-1 p-4 md:p-6 xl:p-10 pb-20 md:pb-6 xl:pb-10 overflow-y-auto overflow-x-hidden min-w-0">

          <div className="profile-page" style={{ maxWidth: 1100, margin: "0 auto", position: "relative" }}>

            {/* ambient glows */}

            <div style={{ position: "relative", zIndex: 1 }}>

              {/* ── Back button + title ── */}
              <div className="prof-fade" style={{ marginBottom: 28 }}>
                <button
                  onClick={() => navigate("/dashboard")}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    marginBottom: 18, padding: "7px 14px",
                    borderRadius: 12,
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-card)",
                    color: "var(--text-secondary)", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--border-card)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-input)"; e.currentTarget.style.color = "var(--text-dim)"; }}
                >
                  <ArrowLeft size={13} /> Back to Dashboard
                </button>

                                <h1 style={{ fontSize: 28, fontWeight: 650, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.03em" }}>Profile</h1>
                <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0" }}>Manage your FinTwin account and security settings.</p>
              </div>

              {/* ── Loading state ── */}
              {!profile ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
                  <p style={{ fontSize: 14, color: "var(--text-dim)" }}>Loading Profile...</p>
                </div>
              ) : (

                /* ── Hero card ── */
                <div className="prof-fade-2" style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-card)",
                  borderRadius: "var(--radius-card)", overflow: "visible", position: "relative",
                }}>

                  {/* Banner — 110px, top corners rounded, overflow visible so avatar pokes out */}
                  <div style={{ height: 56, background: "var(--accent-soft)", position: "relative", borderRadius: "var(--radius-card) var(--radius-card) 0 0" }} />

                  <div style={{ padding: "0 20px 20px", position: "relative", zIndex: 1 }}>

                    {/* ── Avatar + Identity row ── */}
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginTop: -24 }}>

                      {/* Left: avatar + text side by side, bottoms aligned */}
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 16 }}>

                        {/* Avatar */}
                        <div style={{
                          width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
                          background: "var(--accent-strong)",
                          border: "4px solid var(--bg-card)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 28, fontWeight: 650, color: "#fff",
                        }}>{initial}</div>

                        {/* Name / email / meta — vertically centered beside avatar */}
                        <div style={{ paddingBottom: 0, alignSelf: "center" }}>
                          <h2 style={{ fontSize: 20, fontWeight: 650, color: "var(--text-primary)", margin: "0 0 3px", letterSpacing: "-0.02em" }}>
                            {profile.fullName}
                          </h2>
                          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "0 0 5px" }}>{profile.email}</p>
                          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, fontSize: 12, color: "var(--text-dim)" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <Calendar size={11} /> Member since {profile.createdAt}
                            </span>
                            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--accent)" }}>
                              <Sparkles size={11} /> FinTwin AI User
                            </span>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* ── Divider ── */}
                    <div style={{ height: 1, background: "var(--bg-input)", margin: "20px 0" }} />

                    {/* ── Stat cards ── */}
                    <div className="p-stats-grid">
                      <ProfileStat icon={<User size={13} color="var(--accent)" />} label="Full Name" value={profile.fullName} color="var(--accent)" />
                      <ProfileStat icon={<Mail size={13} color="var(--info)" />} label="Email" value={profile.email} color="var(--info)" />
                      <ProfileStat icon={<Wallet size={13} color="var(--good)" />} label="Transactions" value={profile.totalTransactions ?? "—"} color="var(--good)" />
                      <ProfileStat icon={<Target size={13} color="var(--warn)" />} label="Active Goals" value={profile.totalGoals ?? "—"} color="var(--warn)" />
                    </div>

                    {/* ── Financial score + History ── */}
                    <div className="p-score-grid">

                      {/* Score card */}
                      <div style={{
                        background: "var(--bg-card)", border: "1px solid var(--border-card)",
                        borderRadius: 18, padding: 22, position: "relative", overflow: "hidden",
                      }}>
                        {/* bottom accent */}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,transparent,${scoreColor}50,transparent)` }} />

                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                          <Shield size={13} color="var(--accent)" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)" }}>Financial health score</span>
                        </div>

                        {/* Number + rating inline */}
                        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
                          <div style={{ fontSize: 52, fontWeight: 650, color: scoreColor, letterSpacing: "-0.06em", lineHeight: 1 }}>{score}</div>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: scoreColor }}>{scoreLabel}</div>
                            <div style={{ fontSize: 12, color: "var(--text-dim)" }}>out of 100</div>
                          </div>
                        </div>

                        {/* Progress bar — 6px, rounded */}
                        <div style={{ height: 6, background: "var(--bg-input)", borderRadius: 99, overflow: "hidden", marginBottom: 14 }}>
                          <div style={{
                            height: "100%", width: `${score}%`,
                            background: `linear-gradient(90deg, ${scoreColor}cc, ${scoreColor})`,
                            borderRadius: 99, transition: "width 1s ease",
                          }} />
                        </div>

                        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0, lineHeight: 1.6 }}>
                          Based on income, expenses, budgets and financial goals.
                        </p>
                      </div>

                      {/* Score history chart */}
                      <div style={{
                        background: "var(--bg-card)", border: "1px solid var(--border-card)",
                        borderRadius: 18, padding: 22, position: "relative", overflow: "hidden",
                      }}>
                        {/* Card header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 3 }}>AI tracking</div>
                            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Score History</h3>
                          </div>
                          {/* Green pulsing live badge */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--good-soft)", border: "1px solid var(--good-soft)", borderRadius: 8, padding: "4px 10px" }}>
                            <div className="live-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--good)", flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--good)" }}>Live</span>
                          </div>
                        </div>

                        <FinancialScoreChart data={scoreHistory} />
                      </div>
                    </div>

                    {/* ── Action buttons ── */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                      <button
                        className="p-action-btn"
                        onClick={() => setShowEditModal(true)}
                        style={{ background: "var(--accent-strong)", color: "#fff" }}
                      >
                        <Edit2 size={14} /> Edit Profile
                      </button>
                      <button
                        className="p-action-btn"
                        onClick={() => setShowPasswordModal(true)}
                        style={{ background: "var(--accent-strong)", color: "#fff" }}
                      >
                        <Lock size={14} /> Change Password
                      </button>
                      <button
                        className="p-action-btn p-btn-danger"
                        onClick={() => setShowDeleteModal(true)}
                      >
                        <Trash2 size={14} /> Delete Account
                      </button>
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <BottomNav activeSection="" setActiveSection={() => {}} />
      </div>
    </>
  );
}

export default Profile;
