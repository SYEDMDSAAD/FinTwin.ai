import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Who We Are",
    body: "FinTwin AI is a personal finance intelligence platform that helps you understand and improve your financial health. We are committed to protecting your privacy and handling your data responsibly.",
  },
  {
    title: "2. Data We Collect",
    body: "We collect information you provide directly (name, email, financial goals) and transactional data you import or connect via bank accounts using the RBI-regulated Setu Account Aggregator framework. We do not collect banking credentials — you only share what you explicitly consent to.",
  },
  {
    title: "3. How We Use Your Data",
    body: "We use your data solely to provide FinTwin AI features: generating insights, budgets, anomaly detection, and AI recommendations. We do not sell your data to third parties or use it for advertising.",
  },
  {
    title: "4. Data Security",
    body: "All sensitive fields (emails, financial amounts, notes) are encrypted at rest using AES-256 GCM encryption. Passwords are hashed with BCrypt. Data is transmitted over TLS 1.2+. We maintain audit logs for all sensitive operations as required by PCI-DSS.",
  },
  {
    title: "5. Data Retention",
    body: "Your data is retained for as long as your account is active. You may request deletion at any time from Settings → Account → Delete Account. Upon deletion, your data is permanently removed within 30 days.",
  },
  {
    title: "6. Your Rights",
    body: "You have the right to access, correct, export, or delete your personal data. To exercise these rights, use the in-app settings or contact us at support@fintwin.ai.",
  },
  {
    title: "7. Account Aggregator",
    body: "Bank data is fetched via the RBI's Account Aggregator framework operated by Setu. FinTwin AI acts as a Financial Information User (FIU). You can revoke consent anytime from Settings → Connections.",
  },
  {
    title: "8. Cookies",
    body: "We use minimal essential cookies for authentication (JWT tokens). We do not use tracking or advertising cookies.",
  },
  {
    title: "9. Changes to This Policy",
    body: "We may update this policy from time to time. We will notify you of significant changes via email or in-app notification.",
  },
  {
    title: "10. Contact",
    body: "For privacy questions or requests, contact us at support@fintwin.ai.",
  },
];

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  const pageBg = isDark ? "#080a0f" : "linear-gradient(135deg, #eef2fa 0%, #e3eaf7 48%, #ede8fb 100%)";
  const txt    = isDark ? "#e2e8f0" : "#0f172a";
  const txtSub = isDark ? "rgba(148,163,184,0.6)" : "rgba(71,85,105,0.7)";
  const cardBg = isDark ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.9)";
  const cardBdr= isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(15,23,42,0.08)";

  return (
    <div style={{ minHeight:"100vh", background:pageBg, fontFamily:"'DM Sans', system-ui, sans-serif", padding:"40px 20px" }}>
      <div style={{ maxWidth:720, margin:"0 auto" }}>

        {/* Back button */}
        <button onClick={() => navigate(-1)}
          style={{ display:"inline-flex", alignItems:"center", gap:7, background:"none", border:"none", color:isDark?"#a78bfa":"#7c3aed", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", marginBottom:28, padding:0 }}>
          <ArrowLeft size={15}/> Back
        </button>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
          <div style={{ width:44, height:44, borderRadius:13, background:"linear-gradient(135deg,#a78bfa,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:800, color:"#fff", flexShrink:0 }}>F</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:txt, letterSpacing:"-0.02em" }}>Privacy Policy</div>
            <div style={{ fontSize:12, color:txtSub }}>FinTwin AI · Last updated June 2026</div>
          </div>
        </div>

        <div style={{ background:cardBg, border:cardBdr, borderRadius:20, padding:"32px 36px", backdropFilter:"blur(16px)" }}>
          <div style={{ position:"absolute", display:"none" }}/>
          <p style={{ fontSize:14, color:txtSub, lineHeight:1.8, marginBottom:28 }}>
            At FinTwin AI, your privacy is fundamental to everything we build. This policy explains what data we collect, how we use it, and the rights you have over it. We do not sell your data. Ever.
          </p>
          {sections.map(s => (
            <div key={s.title} style={{ marginBottom:24 }}>
              <h2 style={{ fontSize:15, fontWeight:700, color:txt, margin:"0 0 8px" }}>{s.title}</h2>
              <p style={{ fontSize:13, color:txtSub, lineHeight:1.8, margin:0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
