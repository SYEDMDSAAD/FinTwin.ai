import { useEffect, useState, useRef } from "react";

const WORDMARK = "FinTwin AI";
const TAGLINE  = "Your money, finally makes sense.";

const RING_R    = 20;
const RING_CIRC = +(2 * Math.PI * RING_R).toFixed(2); // 125.66
const RING_END  = +(RING_CIRC * 0.28).toFixed(2);     // 35.18

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,400&family=JetBrains+Mono:wght@400&display=swap');

  @keyframes fMarkIn {
    from { opacity:0; transform:scale(0.7); }
    to   { opacity:1; transform:scale(1);   }
  }
  @keyframes underlineDraw {
    from { transform:scaleX(0); }
    to   { transform:scaleX(1); }
  }
  @keyframes ringFill {
    from { stroke-dashoffset:${RING_CIRC}; }
    to   { stroke-dashoffset:${RING_END};  }
  }
  @keyframes barGrow {
    from { transform:scaleY(0); }
    to   { transform:scaleY(1); }
  }
  @keyframes netWorthDraw {
    from { stroke-dashoffset:80; }
    to   { stroke-dashoffset:0;  }
  }
  @keyframes taglineIn {
    from { opacity:0; transform:translateY(8px); }
    to   { opacity:1; transform:translateY(0);   }
  }
  @keyframes subtextIn {
    from { opacity:0; }
    to   { opacity:1; }
  }
  @keyframes dotPulse {
    0%,100% { opacity:1;   }
    50%     { opacity:0.2; }
  }
  @keyframes splashBgShimmer {
    0%   { background-position: 0% 50%;   }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%;   }
  }
`;

const LABEL = {
  fontSize: 10,
  fontFamily: "'JetBrains Mono', 'Courier New', monospace",
  color: "rgba(15,23,42,0.40)",
  letterSpacing: "0.08em",
  marginTop: 8,
  textAlign: "center",
  display: "block",
};

export default function SplashScreen({ isDataReady, onComplete }) {
  const reduced = useRef(
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ).current;

  const gate = useRef({ animDone: false, dataDone: false, fired: false });
  const tryTransitionRef = useRef(null);

  const [typedChars,    setTypedChars]    = useState(0);
  const [showUnderline, setShowUnderline] = useState(false);
  const [logoUp,        setLogoUp]        = useState(false);
  const [showNodes,     setShowNodes]     = useState(false);
  const [nodesIn,       setNodesIn]       = useState([false, false, false]);
  const [nodesFade,     setNodesFade]     = useState(false);
  const [showTagline,   setShowTagline]   = useState(false);
  const [showSubtext,   setShowSubtext]   = useState(false);
  const [fadingOut,     setFadingOut]     = useState(false);

  tryTransitionRef.current = () => {
    const g = gate.current;
    if (g.animDone && g.dataDone && !g.fired) {
      g.fired = true;
      setFadingOut(true);
      setTimeout(onComplete, 600);
    }
  };

  useEffect(() => {
    if (isDataReady) {
      gate.current.dataDone = true;
      tryTransitionRef.current();
    }
  }, [isDataReady]);

  useEffect(() => {
    if (reduced) {
      setTypedChars(WORDMARK.length);
      setShowTagline(true);
      const t1 = setTimeout(() => setShowSubtext(true), 300);
      const t2 = setTimeout(() => {
        gate.current.animDone = true;
        tryTransitionRef.current();
      }, 3000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }

    const ts = [];
    const at = (fn, ms) => ts.push(setTimeout(fn, ms));

    // Act 2 — typing + underline
    for (let i = 0; i < WORDMARK.length; i++) {
      at(() => setTypedChars(c => c + 1), 800 + i * 60);
    }
    at(() => setShowUnderline(true), 900);

    // Act 3 — logo up, nodes stagger in
    at(() => setLogoUp(true),    1800);
    at(() => setShowNodes(true), 1900);
    at(() => setNodesIn([true, false, false]), 2000);
    at(() => setNodesIn([true, true,  false]), 2250);
    at(() => setNodesIn([true, true,  true]),  2500);

    // Act 4 — fade nodes, logo returns
    at(() => setNodesFade(true), 3200);
    at(() => {
      setShowNodes(false);
      setLogoUp(false);
      setShowUnderline(false);
      setNodesFade(false);
      setNodesIn([false, false, false]);
    }, 3650);

    // Act 5 — tagline
    at(() => setShowTagline(true), 4000);
    at(() => setShowSubtext(true), 4300);

    // animation gate
    at(() => {
      gate.current.animDone = true;
      tryTransitionRef.current();
    }, 5200);

    return () => ts.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        // light, subtly animated gradient background
        background: "linear-gradient(135deg, #f0f4ff 0%, #faf5ff 40%, #f0fdfa 100%)",
        backgroundSize: "300% 300%",
        animation: "splashBgShimmer 8s ease infinite",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        opacity: fadingOut ? 0 : 1,
        transition: fadingOut ? "opacity 600ms ease" : "none",
        pointerEvents: fadingOut ? "none" : "auto",
      }}
    >
      <style>{CSS}</style>

      {/* subtle radial glow behind the logo */}
      <div style={{
        position: "absolute",
        top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 480, height: 480,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(167,139,250,0.12) 0%, rgba(34,211,238,0.06) 50%, transparent 75%)",
        pointerEvents: "none",
      }} />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>

        {/* ── Logo group ── */}
        <div
          style={{
            display: "flex", flexDirection: "column", alignItems: "flex-start",
            transform: logoUp ? "translateY(-40px)" : "translateY(0)",
            transition: "transform 500ms ease",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>

            {/* F mark */}
            <div
              style={{
                width: 72, height: 72, borderRadius: 18, flexShrink: 0,
                background: "linear-gradient(135deg, #a78bfa, #22d3ee)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 8px 32px rgba(167,139,250,0.35), 0 2px 8px rgba(167,139,250,0.2)",
                animation: "fMarkIn 800ms cubic-bezier(0.34,1.56,0.64,1) both",
              }}
            >
              <span style={{ fontSize: 32, fontWeight: 800, color: "#fff" }}>F</span>
            </div>

            {/* Wordmark + underline */}
            <div style={{ position: "relative" }}>
              <span
                style={{
                  fontSize: 28, fontWeight: 700,
                  color: "#0f172a",
                  letterSpacing: "-0.02em", display: "block",
                  minHeight: "1.2em",
                }}
              >
                {WORDMARK.substring(0, typedChars)}
              </span>

              {showUnderline && (
                <div
                  style={{
                    position: "absolute", bottom: -6, left: 0,
                    width: "100%", minWidth: 155, height: 2,
                    background: "linear-gradient(90deg, #a78bfa, #22d3ee)",
                    transformOrigin: "left center",
                    animation: "underlineDraw 700ms ease-out both",
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Data nodes (Acts 3–4) ── */}
        {showNodes && (
          <div
            style={{
              display: "flex", gap: 48, marginTop: 44,
              opacity: nodesFade ? 0 : 1,
              transition: "opacity 400ms ease",
            }}
          >
            {/* Node 1 — Financial score ring */}
            <div
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                opacity: nodesIn[0] ? 1 : 0,
                transform: nodesIn[0] ? "translateY(0)" : "translateY(12px)",
                transition: "opacity 400ms ease, transform 400ms ease",
              }}
            >
              <svg width="52" height="52">
                <defs>
                  <linearGradient id="ftRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%"   stopColor="#a78bfa" />
                    <stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <circle cx="26" cy="26" r={RING_R}
                  fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="4"
                />
                <circle cx="26" cy="26" r={RING_R}
                  fill="none" stroke="url(#ftRingGrad)" strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={RING_CIRC}
                  style={{
                    transformOrigin: "26px 26px",
                    transform: "rotate(-90deg)",
                    animation: nodesIn[0]
                      ? "ringFill 900ms cubic-bezier(0.34,1.56,0.64,1) 200ms both"
                      : "none",
                  }}
                />
              </svg>
              <span style={LABEL}>FINANCIAL SCORE</span>
            </div>

            {/* Node 2 — Spending bars */}
            <div
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                opacity: nodesIn[1] ? 1 : 0,
                transform: nodesIn[1] ? "translateY(0)" : "translateY(12px)",
                transition: "opacity 400ms ease, transform 400ms ease",
              }}
            >
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 52 }}>
                {[
                  { h: 32, delay: "0ms"   },
                  { h: 22, delay: "150ms" },
                  { h: 40, delay: "300ms" },
                ].map(({ h, delay }, i) => (
                  <div
                    key={i}
                    style={{
                      width: 12, height: h, borderRadius: "3px 3px 0 0",
                      background: "linear-gradient(180deg, #f59e0b, rgba(245,158,11,0.25))",
                      transformOrigin: "center bottom",
                      animation: nodesIn[1]
                        ? `barGrow 700ms ease-out ${delay} both`
                        : "none",
                    }}
                  />
                ))}
              </div>
              <span style={LABEL}>SPENDING</span>
            </div>

            {/* Node 3 — Net worth line */}
            <div
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                opacity: nodesIn[2] ? 1 : 0,
                transform: nodesIn[2] ? "translateY(0)" : "translateY(12px)",
                transition: "opacity 400ms ease, transform 400ms ease",
              }}
            >
              <svg width="64" height="52">
                <polyline
                  points="2,45 16,36 24,40 36,22 50,12 62,6"
                  fill="none" stroke="#10b981" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="80" strokeDashoffset="80"
                  style={{
                    animation: nodesIn[2]
                      ? "netWorthDraw 900ms ease-in-out 100ms both"
                      : "none",
                  }}
                />
              </svg>
              <span style={LABEL}>NET WORTH</span>
            </div>
          </div>
        )}

        {/* ── Tagline (Act 5) ── */}
        {showTagline && (
          <div
            style={{
              marginTop: 40, textAlign: "center", maxWidth: 320,
              animation: "taglineIn 600ms ease both",
            }}
          >
            <p
              style={{
                fontFamily: "'Fraunces', Georgia, serif",
                fontStyle: "italic", fontSize: 22, fontWeight: 400,
                color: "rgba(15,23,42,0.78)",
                letterSpacing: "-0.01em", lineHeight: 1.4,
                margin: 0,
              }}
            >
              {TAGLINE}
            </p>
          </div>
        )}

        {/* ── Loading subtext ── */}
        {showSubtext && (
          <div
            style={{
              marginTop: 20, textAlign: "center",
              animation: "subtextIn 400ms ease both",
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', 'Courier New', monospace",
                fontSize: 12, color: "rgba(15,23,42,0.30)",
              }}
            >
              Preparing your financial twin
              <span
                style={{
                  display: "inline-block", marginLeft: 6,
                  animation: "dotPulse 900ms ease infinite",
                }}
              >
                ●
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
