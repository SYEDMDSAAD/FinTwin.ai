import { useNavigate } from "react-router-dom";
import { useTheme } from "../context/ThemeContext";
import { ArrowLeft } from "lucide-react";

const sections = [
  {
    title: "1. Acceptance",
    body: "By creating an account or using FinTwin AI, you agree to these Terms of Service. If you do not agree, please do not use the service.",
  },
  {
    title: "2. Not Financial Advice — Important Disclaimer",
    body: "FinTwin AI is an informational and educational tool only. Nothing on this platform constitutes financial, investment, tax, or legal advice. AI-generated insights, budget recommendations, and investment suggestions are based on your personal data patterns and are provided for informational purposes only. Always consult a qualified financial advisor before making financial decisions. Past performance data shown in the app does not guarantee future results.",
    highlight: true,
  },
  {
    title: "3. Eligibility",
    body: "You must be at least 18 years old and resident in India to use FinTwin AI. By registering, you confirm that you meet these requirements.",
  },
  {
    title: "4. Your Account",
    body: "You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. Notify us immediately at support@fintwin.ai if you suspect unauthorised access.",
  },
  {
    title: "5. Permitted Use",
    body: "FinTwin AI is for personal, non-commercial use only. You must not use the platform to: (a) violate any laws; (b) attempt to access other users' data; (c) reverse-engineer or scrape the platform; (d) submit false or misleading information.",
  },
  {
    title: "6. Bank Account Aggregator",
    body: "Bank data is fetched via RBI's Account Aggregator framework (Setu). You explicitly consent to share financial data each time you connect a bank account. You can revoke consent at any time from Settings → Connections.",
  },
  {
    title: "7. Data & Privacy",
    body: "Your use of FinTwin AI is also governed by our Privacy Policy. By using the service, you consent to the collection and processing of your financial data as described therein.",
  },
  {
    title: "8. Intellectual Property",
    body: "All content, code, and design of FinTwin AI is owned by FinTwin AI and protected by copyright. You may not reproduce, distribute, or create derivative works without written permission.",
  },
  {
    title: "9. Limitation of Liability",
    body: "To the maximum extent permitted by law, FinTwin AI is not liable for any indirect, incidental, or consequential damages arising from your use of the service, including any financial losses. The service is provided 'as is' without warranties of any kind.",
  },
  {
    title: "10. Termination",
    body: "We may suspend or terminate your account if you violate these terms. You may delete your account at any time from Settings → Account → Delete Account.",
  },
  {
    title: "11. Changes to Terms",
    body: "We may update these terms from time to time. Continued use after changes constitutes acceptance. We will notify you of material changes via email.",
  },
  {
    title: "12. Governing Law",
    body: "These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in Bengaluru, India.",
  },
  {
    title: "13. Contact",
    body: "For questions about these terms, contact us at support@fintwin.ai.",
  },
];

export default function TermsOfServicePage() {
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

        <button onClick={() => navigate(-1)}
          style={{ display:"inline-flex", alignItems:"center", gap:7, background:"none", border:"none", color:isDark?"#a78bfa":"#7c3aed", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", marginBottom:28, padding:0 }}>
          <ArrowLeft size={15}/> Back
        </button>

        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:32 }}>
          <div style={{ width:44, height:44, borderRadius:13, background:"linear-gradient(135deg,#a78bfa,#22d3ee)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:800, color:"#fff", flexShrink:0 }}>F</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:txt, letterSpacing:"-0.02em" }}>Terms of Service</div>
            <div style={{ fontSize:12, color:txtSub }}>FinTwin AI · Last updated June 2026</div>
          </div>
        </div>

        <div style={{ background:cardBg, border:cardBdr, borderRadius:20, padding:"32px 36px", backdropFilter:"blur(16px)" }}>
          <p style={{ fontSize:14, color:txtSub, lineHeight:1.8, marginBottom:28 }}>
            Please read these Terms carefully before using FinTwin AI. These terms govern your access to and use of the platform.
          </p>
          {sections.map(s => (
            <div key={s.title} style={{ marginBottom:24,
              ...(s.highlight ? {
                background: isDark ? "rgba(248,113,113,0.06)" : "rgba(239,68,68,0.05)",
                border: isDark ? "1px solid rgba(248,113,113,0.2)" : "1px solid rgba(239,68,68,0.15)",
                borderRadius: 12, padding: "16px 20px",
              } : {})
            }}>
              <h2 style={{ fontSize:15, fontWeight:700, color: s.highlight ? "#f87171" : txt, margin:"0 0 8px" }}>{s.title}</h2>
              <p style={{ fontSize:13, color:txtSub, lineHeight:1.8, margin:0 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
