import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

/* ─── Google Fonts ─────────────────────────────────────────────── */
const GFONTS = `@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');`;

/* ─── All Landing CSS ──────────────────────────────────────────── */
const CSS = `
${GFONTS}

.land *, .land *::before, .land *::after { box-sizing: border-box; margin: 0; padding: 0; }
.land { font-family: 'Inter', 'DM Sans', system-ui, sans-serif; background: #060810; color: #e2e8f0; min-height: 100vh; overflow-x: hidden; }
.sg { font-family: 'Space Grotesk', system-ui, sans-serif; }
.dm { font-family: 'DM Mono', 'Courier New', monospace; }

/* ── Navbar ─────────────────────── */
.lnav { position: fixed; top: 0; left: 0; right: 0; z-index: 200; transition: background 0.35s ease, border-color 0.35s ease, padding 0.3s ease; padding: 22px 0; border-bottom: 1px solid transparent; }
.lnav.solid { background: rgba(6,8,16,0.93); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom-color: rgba(255,255,255,0.06); padding: 14px 0; }
.lnav-inner { max-width: 1200px; margin: 0 auto; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.lnav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
.lnav-logo-mark { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #7c3aed, #a78bfa); display: flex; align-items: center; justify-content: center; font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 18px; color: #fff; box-shadow: 0 0 20px rgba(124,58,237,0.4); flex-shrink: 0; }
.lnav-wordmark { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 17px; color: #e2e8f0; letter-spacing: -0.01em; }
.lnav-wordmark span { color: #a78bfa; }
.lnav-links { display: flex; align-items: center; gap: 8px; }
.lnav-link { background: none; border: none; color: rgba(148,163,184,0.8); font-size: 14px; font-weight: 500; cursor: pointer; padding: 8px 14px; border-radius: 8px; transition: color 0.15s, background 0.15s; font-family: inherit; text-decoration: none; }
.lnav-link:hover { color: #e2e8f0; background: rgba(255,255,255,0.05); }
.lnav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-ghost { background: transparent; color: rgba(226,232,240,0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 11px; padding: 10px 22px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
.btn-ghost:hover { border-color: rgba(167,139,250,0.45); color: #a78bfa; background: rgba(167,139,250,0.06); }
.btn-primary { background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); color: #fff; border: none; border-radius: 11px; padding: 10px 22px; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; box-shadow: 0 4px 20px rgba(124,58,237,0.35); }
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 32px rgba(124,58,237,0.5); }
.btn-primary:active { transform: translateY(0); }
.lnav-ham { display: none; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; }
.lnav-ham span { display: block; width: 22px; height: 2px; background: #e2e8f0; border-radius: 2px; transition: all 0.25s; }
.mob-menu { display: none; position: fixed; inset: 0; z-index: 190; background: rgba(6,8,16,0.97); backdrop-filter: blur(20px); flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
.mob-menu.open { display: flex; }
.mob-link { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: #e2e8f0; text-decoration: none; background: none; border: none; cursor: pointer; transition: color 0.15s; }
.mob-link:hover { color: #a78bfa; }

/* ── Hero ───────────────────────── */
.hero { min-height: 100vh; display: flex; align-items: center; position: relative; overflow: hidden; padding-top: 80px; }
.hero-inner { max-width: 1200px; margin: 0 auto; padding: 80px 32px 60px; display: grid; grid-template-columns: 55fr 45fr; gap: 64px; align-items: center; width: 100%; }
.hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.25); border-radius: 100px; padding: 7px 16px; font-size: 12px; color: #c4b5fd; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 28px; }
.hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #a78bfa; animation: pulse-dot 2s ease infinite; flex-shrink: 0; }
.hero-h1 { font-family: 'Space Grotesk', sans-serif; font-size: clamp(44px, 6vw, 76px); font-weight: 800; line-height: 1.05; letter-spacing: -0.035em; color: #f1f5f9; margin-bottom: 24px; }
.hero-h1 .grad { background: linear-gradient(135deg, #a78bfa 0%, #22d3ee 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-h1 .gold { background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-sub { font-size: 17px; line-height: 1.65; color: rgba(148,163,184,0.85); max-width: 520px; margin-bottom: 40px; }
.hero-ctas { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 52px; }
.btn-hero { background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); color: #fff; border: none; border-radius: 13px; padding: 15px 32px; font-weight: 700; font-size: 16px; cursor: pointer; transition: all 0.2s; font-family: inherit; box-shadow: 0 4px 24px rgba(124,58,237,0.4); display: flex; align-items: center; gap: 8px; }
.btn-hero:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(124,58,237,0.55); }
.btn-hero-ghost { background: transparent; color: rgba(226,232,240,0.85); border: 1px solid rgba(255,255,255,0.15); border-radius: 13px; padding: 15px 28px; font-weight: 600; font-size: 16px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
.btn-hero-ghost:hover { border-color: rgba(167,139,250,0.45); color: #a78bfa; background: rgba(167,139,250,0.06); transform: translateY(-1px); }
.hero-stats { display: flex; gap: 32px; flex-wrap: wrap; }
.hero-stat-val { font-family: 'Space Grotesk', sans-serif; font-size: 26px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.02em; }
.hero-stat-val .rupee { color: #fbbf24; }
.hero-stat-label { font-size: 12px; color: rgba(100,116,139,0.7); font-weight: 500; margin-top: 2px; letter-spacing: 0.03em; text-transform: uppercase; }

/* ── Transaction Theater ─────────── */
.tx-theater { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 24px; padding: 24px; backdrop-filter: blur(16px); position: relative; }
.tx-theater-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.tx-theater-dot { width: 8px; height: 8px; border-radius: 50%; }
.tx-theater-title { font-size: 12px; font-weight: 600; color: rgba(148,163,184,0.7); letter-spacing: 0.06em; text-transform: uppercase; font-family: 'DM Mono', monospace; }
.tx-list { display: flex; flex-direction: column; gap: 10px; min-height: 340px; }
.tx-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); transition: all 0.3s ease; }
.tx-item.active { background: rgba(167,139,250,0.06); border-color: rgba(167,139,250,0.2); }
.tx-raw { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(100,116,139,0.65); letter-spacing: 0.02em; line-height: 1.4; max-width: 200px; }
.tx-resolved { display: flex; align-items: center; gap: 8px; }
.tx-tag { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; }
.tx-amount { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 700; color: #fbbf24; }
.tx-thinking { display: flex; gap: 4px; align-items: center; padding: 4px 10px; }
.tx-dot { width: 5px; height: 5px; border-radius: 50%; background: #a78bfa; }
.tx-dot-1 { animation: txPulse 0.9s ease-in-out 0s infinite; }
.tx-dot-2 { animation: txPulse 0.9s ease-in-out 0.2s infinite; }
.tx-dot-3 { animation: txPulse 0.9s ease-in-out 0.4s infinite; }
.tx-theater-footer { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 8px; }
.tx-ai-tag { font-size: 11px; color: rgba(167,139,250,0.7); font-family: 'DM Mono', monospace; }

/* ── Ambient glows ──────────────── */
.glow-blob { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(120px); }
.glow-purple { width: 600px; height: 600px; background: rgba(124,58,237,0.12); top: -100px; left: -200px; animation: glowDrift 8s ease-in-out infinite alternate; }
.glow-cyan { width: 400px; height: 400px; background: rgba(34,211,238,0.06); bottom: 0px; right: -100px; animation: glowDrift 10s ease-in-out 2s infinite alternate; }

/* ── Trust Bar ──────────────────── */
.trust-bar { border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.015); padding: 20px 32px; }
.trust-inner { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap; }
.trust-item { display: flex; align-items: center; gap: 8px; padding: 9px 18px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; font-size: 13px; color: rgba(148,163,184,0.75); font-weight: 500; white-space: nowrap; }
.trust-item-icon { font-size: 15px; }
.trust-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.07); flex-shrink: 0; }

/* ── Section shell ──────────────── */
.section { max-width: 1200px; margin: 0 auto; padding: 100px 32px; }
.section-tag { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #a78bfa; margin-bottom: 16px; font-family: 'DM Mono', monospace; }
.section-h2 { font-family: 'Space Grotesk', sans-serif; font-size: clamp(32px, 4vw, 52px); font-weight: 800; letter-spacing: -0.03em; color: #f1f5f9; line-height: 1.1; margin-bottom: 16px; }
.section-sub { font-size: 17px; line-height: 1.65; color: rgba(148,163,184,0.8); max-width: 560px; }

/* ── Feature cards ──────────────── */
.feat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 56px; }
.feat-grid-3 { grid-template-columns: repeat(3, 1fr); }
.feat-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 28px; transition: all 0.25s ease; cursor: default; }
.feat-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.04); border-color: rgba(167,139,250,0.18); box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(167,139,250,0.12); }
.feat-card-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; margin-bottom: 18px; flex-shrink: 0; }
.feat-card-title { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; color: #f1f5f9; margin-bottom: 10px; letter-spacing: -0.01em; }
.feat-card-desc { font-size: 14px; line-height: 1.65; color: rgba(148,163,184,0.75); }
.feat-card-visual { margin-top: 20px; border-radius: 12px; overflow: hidden; }

/* mini UI elements inside cards */
.mini-bar-wrap { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.mini-bar-row { display: flex; align-items: center; gap: 10px; }
.mini-bar-label { font-size: 11px; color: rgba(100,116,139,0.7); width: 72px; flex-shrink: 0; font-family: 'DM Mono', monospace; }
.mini-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.mini-bar-fill { height: 100%; border-radius: 3px; transition: width 1.2s ease; }
.mini-bar-val { font-size: 11px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; width: 40px; text-align: right; flex-shrink: 0; }

.mini-score-ring { display: flex; align-items: center; justify-content: center; padding: 20px; }
.mini-chat { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: rgba(0,0,0,0.2); border-radius: 12px; }
.mini-chat-user { align-self: flex-end; background: rgba(124,58,237,0.2); border: 1px solid rgba(167,139,250,0.2); border-radius: 10px 10px 2px 10px; padding: 8px 12px; font-size: 12px; color: #c4b5fd; max-width: 80%; }
.mini-chat-ai { align-self: flex-start; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px 10px 10px 2px; padding: 8px 12px; font-size: 12px; color: rgba(226,232,240,0.85); max-width: 90%; line-height: 1.5; }
.mini-chat-ai-tag { font-size: 10px; color: #a78bfa; margin-bottom: 4px; font-weight: 700; font-family: 'DM Mono', monospace; }

.mini-anomaly { display: flex; align-items: flex-start; gap: 10px; padding: 12px; background: rgba(248,113,113,0.07); border: 1px solid rgba(248,113,113,0.15); border-radius: 10px; margin-top: 14px; }
.mini-anomaly-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.mini-anomaly-text { font-size: 12px; color: rgba(248,113,113,0.9); line-height: 1.5; }

.mini-goal { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.mini-goal-row { display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 10px 12px; }
.mini-goal-emoji { font-size: 18px; flex-shrink: 0; }
.mini-goal-info { flex: 1; min-width: 0; }
.mini-goal-name { font-size: 12px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
.mini-goal-bar-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
.mini-goal-bar-fill { height: 100%; border-radius: 2px; }
.mini-goal-pct { font-size: 11px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; color: #4ade80; flex-shrink: 0; }

.mini-forecast { display: flex; align-items: flex-end; gap: 4px; padding: 14px; height: 72px; }
.mini-forecast-bar { flex: 1; border-radius: 4px 4px 0 0; position: relative; }
.mini-forecast-bar.projected { opacity: 0.45; border: 1px dashed rgba(255,255,255,0.15); }

.mini-recurring { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.mini-rec-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.025); border-radius: 8px; }
.mini-rec-name { font-size: 12px; color: rgba(226,232,240,0.8); display: flex; align-items: center; gap: 6px; }
.mini-rec-amt { font-size: 12px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; color: #fbbf24; }

/* ── Security section ────────────── */
.sec-wrap { background: rgba(6,8,16,1); border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); position: relative; overflow: hidden; }
.sec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 56px; }
.sec-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 28px; transition: border-color 0.2s; }
.sec-card:hover { border-color: rgba(34,211,238,0.2); }
.sec-card-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 16px; }
.sec-card-title { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; letter-spacing: -0.01em; }
.sec-card-desc { font-size: 13px; line-height: 1.65; color: rgba(148,163,184,0.7); }
.sec-card-mono { font-family: 'DM Mono', monospace; font-size: 11px; color: rgba(34,211,238,0.7); margin-top: 10px; background: rgba(34,211,238,0.05); border: 1px solid rgba(34,211,238,0.1); border-radius: 6px; padding: 6px 10px; display: inline-block; }

/* ── Pricing ─────────────────────── */
.price-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(167,139,250,0.2); border-radius: 24px; padding: 44px 40px; max-width: 520px; margin: 56px auto 0; position: relative; overflow: hidden; }
.price-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #7c3aed, #a78bfa, #22d3ee); }
.price-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(74,222,128,0.1); border: 1px solid rgba(74,222,128,0.25); border-radius: 100px; padding: 5px 14px; font-size: 12px; color: #4ade80; font-weight: 700; margin-bottom: 20px; font-family: 'DM Mono', monospace; letter-spacing: 0.04em; text-transform: uppercase; }
.price-amount { font-family: 'Space Grotesk', sans-serif; font-size: 64px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.04em; line-height: 1; margin-bottom: 8px; }
.price-amount span { font-size: 24px; color: rgba(148,163,184,0.6); font-weight: 500; }
.price-desc { font-size: 15px; color: rgba(148,163,184,0.75); margin-bottom: 32px; line-height: 1.6; }
.price-features { display: flex; flex-direction: column; gap: 12px; margin-bottom: 36px; }
.price-feat { display: flex; align-items: center; gap: 12px; font-size: 14px; color: rgba(226,232,240,0.85); }
.price-feat-check { width: 20px; height: 20px; border-radius: 50%; background: rgba(74,222,128,0.12); border: 1px solid rgba(74,222,128,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }

/* ── Social proof ───────────────── */
.testimonial-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 56px; }
.testimonial-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 18px; padding: 28px; }
.testimonial-stars { display: flex; gap: 3px; margin-bottom: 14px; font-size: 14px; }
.testimonial-text { font-size: 14px; line-height: 1.7; color: rgba(226,232,240,0.8); margin-bottom: 20px; font-style: italic; }
.testimonial-author { display: flex; align-items: center; gap: 10px; }
.testimonial-avatar { width: 36px; height: 36px; border-radius: 50%; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.testimonial-name { font-size: 13px; font-weight: 600; color: #e2e8f0; }
.testimonial-role { font-size: 11px; color: rgba(100,116,139,0.7); margin-top: 2px; font-family: 'DM Mono', monospace; }

/* ── Final CTA ──────────────────── */
.cta-wrap { position: relative; overflow: hidden; }
.cta-inner { max-width: 800px; margin: 0 auto; padding: 120px 32px; text-align: center; }
.cta-h2 { font-family: 'Space Grotesk', sans-serif; font-size: clamp(36px, 5vw, 64px); font-weight: 800; letter-spacing: -0.035em; color: #f1f5f9; line-height: 1.05; margin-bottom: 20px; }
.cta-sub { font-size: 17px; color: rgba(148,163,184,0.75); margin-bottom: 40px; line-height: 1.6; }

/* ── Footer ─────────────────────── */
.footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 60px 32px 40px; }
.footer-inner { max-width: 1200px; margin: 0 auto; }
.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
.footer-brand-desc { font-size: 13px; line-height: 1.7; color: rgba(100,116,139,0.7); margin-top: 14px; max-width: 240px; }
.footer-col-title { font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 700; color: rgba(226,232,240,0.9); margin-bottom: 16px; letter-spacing: 0.02em; }
.footer-links { display: flex; flex-direction: column; gap: 10px; }
.footer-link { font-size: 13px; color: rgba(100,116,139,0.7); text-decoration: none; transition: color 0.15s; cursor: pointer; background: none; border: none; font-family: inherit; text-align: left; }
.footer-link:hover { color: #a78bfa; }
.footer-bottom { padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.footer-copy { font-size: 12px; color: rgba(100,116,139,0.5); font-family: 'DM Mono', monospace; }
.footer-legal { display: flex; gap: 20px; }

/* ── Scroll reveal ──────────────── */
.reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.65s cubic-bezier(0.16,1,0.3,1), transform 0.65s cubic-bezier(0.16,1,0.3,1); }
.reveal.in { opacity: 1; transform: translateY(0); }
.reveal-d1 { transition-delay: 80ms; }
.reveal-d2 { transition-delay: 160ms; }
.reveal-d3 { transition-delay: 240ms; }
.reveal-d4 { transition-delay: 320ms; }

/* ── Hero entrance ──────────────── */
@keyframes heroUp { from { opacity:0; transform:translateY(32px); } to { opacity:1; transform:translateY(0); } }
.h-el-1 { animation: heroUp 0.75s cubic-bezier(0.16,1,0.3,1) 0.05s both; }
.h-el-2 { animation: heroUp 0.75s cubic-bezier(0.16,1,0.3,1) 0.18s both; }
.h-el-3 { animation: heroUp 0.75s cubic-bezier(0.16,1,0.3,1) 0.31s both; }
.h-el-4 { animation: heroUp 0.75s cubic-bezier(0.16,1,0.3,1) 0.44s both; }
.h-el-5 { animation: heroUp 0.75s cubic-bezier(0.16,1,0.3,1) 0.57s both; }
.h-el-6 { animation: heroUp 0.85s cubic-bezier(0.16,1,0.3,1) 0.72s both; }

/* ── Animations ─────────────────── */
@keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.7)} }
@keyframes txPulse { 0%,100%{opacity:0.25;transform:scale(0.8)} 50%{opacity:1;transform:scale(1)} }
@keyframes glowDrift { 0%{transform:translate(0,0)} 100%{transform:translate(40px,-40px)} }
@keyframes scoreRing { from{stroke-dashoffset:502} to{stroke-dashoffset:126} }
@keyframes fadeSlideIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
@keyframes barGrow { from{width:0} to{width:var(--w)} }
@keyframes chatBubble { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }

.score-ring-anim { animation: scoreRing 2s cubic-bezier(0.16,1,0.3,1) 0.8s both; }

/* ── Gradient text helpers ───────── */
.gt-purple { background: linear-gradient(135deg, #a78bfa, #22d3ee); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.gt-gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
.gt-green { background: linear-gradient(135deg, #4ade80, #22d3ee); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }

/* ── Responsive ─────────────────── */
@media (max-width: 900px) {
  .hero-inner { grid-template-columns: 1fr; gap: 48px; }
  .hero-right { display: none; }
  .feat-grid { grid-template-columns: 1fr; }
  .feat-grid-3 { grid-template-columns: 1fr; }
  .sec-grid { grid-template-columns: 1fr; }
  .testimonial-grid { grid-template-columns: 1fr; }
  .footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  .lnav-links { display: none; }
  .lnav-ham { display: flex; }
}
@media (max-width: 600px) {
  .section { padding: 72px 20px; }
  .hero-inner { padding: 60px 20px 40px; }
  .footer-grid { grid-template-columns: 1fr; }
  .price-card { padding: 32px 24px; }
  .hero-stats { gap: 20px; }
  .trust-inner { gap: 8px; }
  .trust-item { font-size: 11px; padding: 7px 12px; }
  .hero-ctas { flex-direction: column; align-items: flex-start; }
}

/* ── Reduced motion ─────────────── */
@media (prefers-reduced-motion: reduce) {
  .reveal, .h-el-1, .h-el-2, .h-el-3, .h-el-4, .h-el-5, .h-el-6 { animation: none !important; opacity: 1 !important; transform: none !important; transition: none !important; }
  .glow-blob { animation: none !important; }
  .hero-badge-dot { animation: none !important; }
  .tx-dot-1, .tx-dot-2, .tx-dot-3 { animation: none !important; opacity: 1 !important; }
  .score-ring-anim { animation: none !important; stroke-dashoffset: 126 !important; }
}

/* ── Focus visible ───────────────── */
.land button:focus-visible, .land a:focus-visible { outline: 2px solid #a78bfa; outline-offset: 3px; border-radius: 8px; }
`;

/* ─── Transaction data ─────────────────────────────────────────── */
const TRANSACTIONS = [
  { raw: "UPI-NETFLIX.IN@AXISBANK-PAYMT", cat: "Entertainment", emoji: "🎬", amount: "₹649",  color: "#a78bfa", bg: "rgba(167,139,250,0.12)" },
  { raw: "SWIGGY*ORD*8423748134-MUM",     cat: "Food & Dining",  emoji: "🍕", amount: "₹342",  color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
  { raw: "HDFC-NPS-CONTRIBUTION-JAN25",   cat: "Investments",    emoji: "📈", amount: "₹5,000",color: "#fbbf24", bg: "rgba(251,191,36,0.12)"  },
  { raw: "ATM WDL KOTAK-PUNE 01/24",      cat: "Cash",           emoji: "💵", amount: "₹3,000",color: "#22d3ee", bg: "rgba(34,211,238,0.12)"  },
  { raw: "LIC-PREMIUM-00238742-ANNUAL",   cat: "Insurance",      emoji: "🛡️", amount: "₹8,400",color: "#f87171", bg: "rgba(248,113,113,0.12)" },
  { raw: "NEFT-GROWW-MF-SIP-AXISBLUE",   cat: "Mutual Funds",   emoji: "📊", amount: "₹2,500",color: "#4ade80", bg: "rgba(74,222,128,0.12)"  },
];

/* ─── useScrollReveal hook ─────────────────────────────────────── */
function useScrollReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("in"); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

/* ─── Transaction Theater ──────────────────────────────────────── */
function TxTheater() {
  const [states, setStates] = useState(TRANSACTIONS.map((_, i) => i === 0 ? "thinking" : "raw"));
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const cycle = async (idx) => {
      if (cancelled) return;
      // show thinking on active
      setStates(prev => prev.map((s, i) => i === idx ? "thinking" : s));
      await delay(700);
      if (cancelled) return;
      // resolve
      setStates(prev => prev.map((s, i) => i === idx ? "resolved" : s));
      await delay(1800);
      if (cancelled) return;
      // move to next
      const next = (idx + 1) % TRANSACTIONS.length;
      setActiveIdx(next);
      if (idx === TRANSACTIONS.length - 1) {
        // reset all to raw, then start again
        setStates(TRANSACTIONS.map(() => "raw"));
        await delay(300);
      }
      cycle(next);
    };
    const t = setTimeout(() => cycle(0), 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  return (
    <div className="tx-theater h-el-6">
      <div className="tx-theater-hdr">
        <div className="tx-theater-dot" style={{ background: "#f87171" }} />
        <div className="tx-theater-dot" style={{ background: "#fbbf24" }} />
        <div className="tx-theater-dot" style={{ background: "#4ade80" }} />
        <span className="tx-theater-title" style={{ marginLeft: 8 }}>AI Classification · Live</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", animation: "pulse-dot 2s ease infinite" }} />
          <span style={{ fontSize: 11, color: "rgba(74,222,128,0.8)", fontFamily: "'DM Mono', monospace" }}>running</span>
        </div>
      </div>

      <div className="tx-list">
        {TRANSACTIONS.map((tx, i) => {
          const state = states[i];
          const isActive = i === activeIdx;
          return (
            <div key={i} className={`tx-item${isActive ? " active" : ""}`}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tx-raw" style={{ color: state === "resolved" ? "rgba(148,163,184,0.5)" : "rgba(100,116,139,0.65)", textDecoration: state === "resolved" ? "line-through" : "none", transition: "all 0.3s" }}>
                  {tx.raw}
                </div>
              </div>
              <div style={{ flexShrink: 0, marginLeft: 8 }}>
                {state === "raw" && (
                  <div style={{ fontSize: 11, color: "rgba(100,116,139,0.4)", fontFamily: "'DM Mono', monospace" }}>—</div>
                )}
                {state === "thinking" && (
                  <div className="tx-thinking">
                    <div className="tx-dot tx-dot-1" />
                    <div className="tx-dot tx-dot-2" />
                    <div className="tx-dot tx-dot-3" />
                  </div>
                )}
                {state === "resolved" && (
                  <div className="tx-resolved" style={{ animation: "fadeSlideIn 0.35s ease both" }}>
                    <div className="tx-tag" style={{ background: tx.bg, color: tx.color }}>
                      <span>{tx.emoji}</span>
                      <span style={{ fontSize: 11, fontWeight: 700 }}>{tx.cat}</span>
                    </div>
                    <div className="tx-amount">{tx.amount}</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="tx-theater-footer">
        <span style={{ fontSize: 14 }}>🤖</span>
        <span className="tx-ai-tag">phi3:mini · self-hosted · your data never leaves</span>
      </div>
    </div>
  );
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ─── Score Ring mini component ────────────────────────────────── */
function ScoreRing({ score = 78, size = 120 }) {
  const r = (size - 16) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "#4ade80" : score >= 60 ? "#fbbf24" : "#f87171";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
      <circle
        cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="score-ring-anim"
        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
      />
    </svg>
  );
}

/* ─── Animated chat bubbles ─────────────────────────────────────── */
function ChatMockup() {
  const msgs = [
    { role: "user", text: "How much did I spend on food last month?" },
    { role: "ai",   text: "You spent ₹8,420 on Food & Dining in May — 23% over your ₹6,800 budget. Swiggy & Zomato account for 71%. Want me to set a weekly cap?" },
    { role: "user", text: "Yes! Also, can I afford a new laptop this month?" },
    { role: "ai",   text: "After your SIPs, EMIs and projected expenses, you have ~₹14,200 discretionary. A ₹65k laptop via 6-month no-cost EMI (₹10,833/mo) is tight but manageable." },
  ];
  const [visible, setVisible] = useState(1);
  useEffect(() => {
    let i = 1;
    const t = setInterval(() => {
      i++;
      setVisible(v => Math.min(v + 1, msgs.length));
      if (i >= msgs.length) clearInterval(t);
    }, 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="mini-chat" style={{ maxHeight: 220, overflow: "hidden" }}>
      {msgs.slice(0, visible).map((m, i) => (
        <div key={i} className={m.role === "user" ? "mini-chat-user" : "mini-chat-ai"} style={{ animation: "chatBubble 0.4s ease both" }}>
          {m.role === "ai" && <div className="mini-chat-ai-tag">FinTwin Copilot</div>}
          {m.text}
        </div>
      ))}
    </div>
  );
}

/* ─── Reveal wrapper ────────────────────────────────────────────── */
function Reveal({ children, delay = 0, className = "" }) {
  const ref = useScrollReveal();
  return (
    <div ref={ref} className={`reveal ${delay ? `reveal-d${delay}` : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const scrollTo = useCallback((id) => {
    setMenuOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }, []);

  return (
    <div className="land">
      <style>{CSS}</style>

      {/* ── Mobile menu ──────────────────────────────────────── */}
      <div className={`mob-menu${menuOpen ? " open" : ""}`} role="dialog" aria-label="Navigation menu">
        <button className="mob-link" onClick={() => scrollTo("features")} aria-label="Go to Features">Features</button>
        <button className="mob-link" onClick={() => scrollTo("security")} aria-label="Go to Security">Security</button>
        <button className="mob-link" onClick={() => scrollTo("pricing")} aria-label="Go to Pricing">Pricing</button>
        <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
        <button className="mob-link" onClick={() => { setMenuOpen(false); navigate("/login"); }}>Log In</button>
        <button className="btn-primary" style={{ fontSize: 18, padding: "16px 40px", borderRadius: 16 }} onClick={() => { setMenuOpen(false); navigate("/register"); }}>Get Started</button>
        <button onClick={() => setMenuOpen(false)} aria-label="Close menu" style={{ position: "absolute", top: 24, right: 28, background: "none", border: "none", cursor: "pointer", fontSize: 28, color: "rgba(148,163,184,0.7)", lineHeight: 1 }}>✕</button>
      </div>

      {/* ── Navbar ───────────────────────────────────────────── */}
      <nav className={`lnav${scrolled ? " solid" : ""}`} role="navigation" aria-label="Main navigation">
        <div className="lnav-inner">
          <a className="lnav-logo" href="/landing" aria-label="FinTwin AI home" onClick={e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <div className="lnav-logo-mark" aria-hidden="true">F</div>
            <span className="lnav-wordmark">FinTwin<span> AI</span></span>
          </a>
          <div className="lnav-links" role="menubar">
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("features")}>Features</button>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("security")}>Security</button>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("pricing")}>Pricing</button>
          </div>
          <div className="lnav-right">
            <button className="btn-ghost" onClick={() => navigate("/login")} aria-label="Log in to your account">Log In</button>
            <button className="btn-primary" onClick={() => navigate("/register")} aria-label="Create a free account">Get Started</button>
          </div>
          <button className="lnav-ham" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* ════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════ */}
      <section className="hero" aria-labelledby="hero-heading">
        {/* Ambient glows */}
        <div className="glow-blob glow-purple" aria-hidden="true" />
        <div className="glow-blob glow-cyan" aria-hidden="true" />

        <div className="hero-inner">
          {/* Left column */}
          <div>
            <div className="hero-badge h-el-1" aria-label="Product highlights">
              <div className="hero-badge-dot" aria-hidden="true" />
              Self-hosted AI · RBI Account Aggregator · AES-256
            </div>

            <h1 className="hero-h1 h-el-2" id="hero-heading">
              Your money,<br />
              <span className="grad">finally understood.</span>
            </h1>

            <p className="hero-sub h-el-3">
              FinTwin AI links your bank accounts via RBI consent, runs its AI on our own servers — not Google's — and builds you one clear picture of where every <span style={{ color: "#fbbf24", fontWeight: 600 }}>₹</span> goes and where it could go.
            </p>

            <div className="hero-ctas h-el-4">
              <button className="btn-hero" onClick={() => navigate("/register")} aria-label="Create your free FinTwin account">
                Get Started — it's free
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button className="btn-hero-ghost" onClick={() => navigate("/login")} aria-label="Log in to existing account">Log In</button>
            </div>

            <div className="hero-stats h-el-5">
              <div>
                <div className="hero-stat-val"><span className="rupee">₹</span>500Cr+</div>
                <div className="hero-stat-label">Total tracked</div>
              </div>
              <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.07)", alignSelf: "center" }} aria-hidden="true" />
              <div>
                <div className="hero-stat-val">100%</div>
                <div className="hero-stat-label">Self-hosted AI</div>
              </div>
              <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.07)", alignSelf: "center" }} aria-hidden="true" />
              <div>
                <div className="hero-stat-val">5+</div>
                <div className="hero-stat-label">AI advisor modes</div>
              </div>
            </div>
          </div>

          {/* Right column — Transaction Theater */}
          <div className="hero-right" aria-label="Live AI transaction classification demo">
            <TxTheater />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          PILLAR 1 — Understand your spending
      ════════════════════════════════════════════════════════ */}
      <section id="features" aria-labelledby="pillar1-heading">
        <div className="section">
          <Reveal>
            <div className="section-tag">Pillar 1</div>
            <h2 className="section-h2" id="pillar1-heading">
              See exactly where every <span className="gt-gold">₹</span> went.
            </h2>
            <p className="section-sub">
              No more end-of-month mystery. FinTwin AI reads your transactions and tells you what you actually spent — in plain language, not bank-statement gibberish.
            </p>
          </Reveal>

          <div className="feat-grid">
            {/* Card 1 */}
            <Reveal delay={1}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(167,139,250,0.12)" }} aria-hidden="true">🤖</div>
                <div className="feat-card-title">AI auto-categorization</div>
                <div className="feat-card-desc">
                  Raw UPI strings like <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#a78bfa" }}>SWIGGY*ORD*8423748134</span> become "🍕 Food · ₹342" automatically. Trained on Indian merchants, no manual tagging needed.
                </div>
                <div className="mini-bar-wrap" style={{ marginTop: 18 }}>
                  {[
                    { label: "Food",    pct: 68, color: "#4ade80" },
                    { label: "Travel",  pct: 42, color: "#22d3ee" },
                    { label: "Shopping",pct: 81, color: "#a78bfa" },
                    { label: "Bills",   pct: 55, color: "#fbbf24" },
                  ].map(b => (
                    <div className="mini-bar-row" key={b.label}>
                      <span className="mini-bar-label">{b.label}</span>
                      <div className="mini-bar-track">
                        <div className="mini-bar-fill" style={{ width: `${b.pct}%`, background: b.color }} />
                      </div>
                      <span className="mini-bar-val" style={{ color: b.color }}>{b.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Card 2 */}
            <Reveal delay={2}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(34,211,238,0.1)" }} aria-hidden="true">🔁</div>
                <div className="feat-card-title">Recurring expense detection</div>
                <div className="feat-card-desc">
                  Netflix, Spotify, gym memberships, cloud storage — FinTwin spots what quietly drains your account every month before you even check.
                </div>
                <div className="mini-recurring">
                  {[
                    { name: "Netflix", emoji: "🎬", amt: "₹649" },
                    { name: "Spotify", emoji: "🎵", amt: "₹119" },
                    { name: "HDFC AMC",emoji: "🏦", amt: "₹250" },
                    { name: "iCloud+", emoji: "☁️",  amt: "₹75"  },
                  ].map(r => (
                    <div className="mini-rec-row" key={r.name}>
                      <span className="mini-rec-name">{r.emoji} {r.name}</span>
                      <span className="mini-rec-amt">{r.amt}/mo</span>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: "rgba(34,211,238,0.7)", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>
                    Total: ₹1,093/mo · ₹13,116/yr
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Card 3 */}
            <Reveal delay={1}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(74,222,128,0.1)" }} aria-hidden="true">📊</div>
                <div className="feat-card-title">Budget tracking with real insight</div>
                <div className="feat-card-desc">
                  Set budgets per category. FinTwin tells you not just that you're over — but why, and what to adjust next month.
                </div>
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { cat: "Food & Dining", spent: 8420, budget: 6800, color: "#f87171" },
                    { cat: "Transport",     spent: 2100, budget: 3000, color: "#4ade80" },
                    { cat: "Entertainment", spent: 1290, budget: 2000, color: "#4ade80" },
                  ].map(b => {
                    const pct = Math.min((b.spent / b.budget) * 100, 100);
                    const over = b.spent > b.budget;
                    return (
                      <div key={b.cat}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                          <span style={{ fontSize: 11, color: "rgba(148,163,184,0.7)" }}>{b.cat}</span>
                          <span style={{ fontSize: 11, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: b.color }}>
                            ₹{b.spent.toLocaleString("en-IN")} / ₹{b.budget.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <div className="mini-bar-track">
                          <div className="mini-bar-fill" style={{ width: `${pct}%`, background: b.color, transition: "width 1.2s ease" }} />
                        </div>
                        {over && <div style={{ fontSize: 10, color: "#f87171", marginTop: 3, fontFamily: "'DM Mono', monospace" }}>↑ ₹{(b.spent-b.budget).toLocaleString("en-IN")} over budget</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Reveal>

            {/* Card 4 */}
            <Reveal delay={2}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(248,113,113,0.1)" }} aria-hidden="true">🚨</div>
                <div className="feat-card-title">Anomaly & fraud alerts</div>
                <div className="feat-card-desc">
                  AI monitors every transaction pattern. If something looks off — unusual merchant, odd amount, duplicate charge — you hear about it immediately.
                </div>
                <div className="mini-anomaly">
                  <span className="mini-anomaly-icon" aria-hidden="true">⚠️</span>
                  <div className="mini-anomaly-text">
                    <strong>Unusual transaction detected:</strong> ₹4,500 to "PAID2VENDOR_3829" — not seen before. Similar to a known phishing pattern. Review?
                  </div>
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button style={{ flex: 1, padding: "7px 0", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 8, fontSize: 12, color: "#f87171", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Flag</button>
                  <button style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12, color: "rgba(148,163,184,0.7)", cursor: "pointer", fontFamily: "inherit" }}>It's fine</button>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          PILLAR 2 — Grow with AI guidance
      ════════════════════════════════════════════════════════ */}
      <section aria-labelledby="pillar2-heading">
        <div className="section" style={{ paddingTop: 0 }}>
          <Reveal>
            <div className="section-tag">Pillar 2</div>
            <h2 className="section-h2" id="pillar2-heading">
              An AI that knows your goals,<br />
              <span className="gt-purple">not just your balance.</span>
            </h2>
            <p className="section-sub">
              Five advisor personalities — Savings Coach, Investment Advisor, Budget Analyst, Fraud Analyst, Purchase Advisor — each tuned for a different financial job.
            </p>
          </Reveal>

          <div className="feat-grid" style={{ marginTop: 56 }}>
            {/* AI Copilot chat card */}
            <Reveal delay={1}>
              <div className="feat-card" style={{ gridColumn: "1 / -1" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>
                  <div>
                    <div className="feat-card-icon" style={{ background: "rgba(167,139,250,0.12)" }} aria-hidden="true">🤖</div>
                    <div className="feat-card-title">AI Copilot with advisor modes</div>
                    <div className="feat-card-desc" style={{ marginBottom: 20 }}>
                      Ask anything about your money in plain language. Switch between advisor personalities depending on what you need — budget help, investment guidance, or fraud investigation.
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {["💰 Savings", "📈 Investing", "📋 Budget", "🛡️ Fraud", "🛍️ Purchase"].map(m => (
                        <span key={m} style={{ fontSize: 12, padding: "5px 12px", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", borderRadius: 8, color: "#c4b5fd", fontWeight: 600 }}>{m}</span>
                      ))}
                    </div>
                  </div>
                  <ChatMockup />
                </div>
              </div>
            </Reveal>

            {/* Score ring card */}
            <Reveal delay={1}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(74,222,128,0.1)" }} aria-hidden="true">🎯</div>
                <div className="feat-card-title">Your financial score, explained</div>
                <div className="feat-card-desc">A real-time score across savings rate, debt ratio, investment diversification, and emergency fund coverage. Not a black box — every point is explained.</div>
                <div className="mini-score-ring" style={{ position: "relative" }}>
                  <ScoreRing score={78} size={120} />
                  <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 800, color: "#4ade80", lineHeight: 1 }}>78</span>
                    <span style={{ fontSize: 10, color: "rgba(100,116,139,0.6)", marginTop: 2, fontFamily: "'DM Mono', monospace" }}>GOOD</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[{ l: "Savings", v: "A", c: "#4ade80" }, { l: "Debt", v: "B+", c: "#fbbf24" }, { l: "Invest", v: "B", c: "#22d3ee" }].map(s => (
                    <div key={s.l} style={{ flex: 1, minWidth: 60, textAlign: "center", padding: "8px 4px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
                      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                      <div style={{ fontSize: 10, color: "rgba(100,116,139,0.6)", marginTop: 2 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Goal planning card */}
            <Reveal delay={2}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(251,191,36,0.1)" }} aria-hidden="true">🏁</div>
                <div className="feat-card-title">AI-generated goal plans</div>
                <div className="feat-card-desc">Tell FinTwin your goal — house down payment, emergency fund, dream trip — and it builds a personalized monthly savings plan to get you there.</div>
                <div className="mini-goal">
                  {[
                    { name: "Emergency Fund", emoji: "🏦", pct: 64, color: "#22d3ee"  },
                    { name: "Goa Trip",       emoji: "✈️",  pct: 38, color: "#a78bfa"  },
                    { name: "Home Down Pymt", emoji: "🏠",  pct: 12, color: "#fbbf24"  },
                  ].map(g => (
                    <div className="mini-goal-row" key={g.name}>
                      <span className="mini-goal-emoji" aria-hidden="true">{g.emoji}</span>
                      <div className="mini-goal-info">
                        <div className="mini-goal-name">{g.name}</div>
                        <div className="mini-goal-bar-track">
                          <div className="mini-goal-bar-fill" style={{ width: `${g.pct}%`, background: g.color }} />
                        </div>
                      </div>
                      <span className="mini-goal-pct" style={{ color: g.color }}>{g.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Net worth / investments */}
            <Reveal delay={1}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(34,211,238,0.1)" }} aria-hidden="true">📈</div>
                <div className="feat-card-title">Net worth & investment tracking</div>
                <div className="feat-card-desc">
                  EPF, mutual funds, FDs, gold, real estate — one net worth number updated daily. Linked via RBI AA for bank data, manual entry for the rest.
                </div>
                <div style={{ marginTop: 16, padding: 14, background: "rgba(0,0,0,0.25)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "rgba(100,116,139,0.7)" }}>Total net worth</span>
                    <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: "#4ade80" }}>₹18.4L</span>
                  </div>
                  {[
                    { label: "Mutual Funds", val: "₹7.2L",  chg: "+12.4%", c: "#4ade80"  },
                    { label: "EPF",           val: "₹5.6L",  chg: "+8.1%",  c: "#22d3ee"  },
                    { label: "FD",            val: "₹3.8L",  chg: "+7.0%",  c: "#fbbf24"  },
                    { label: "Bank Balance",  val: "₹1.8L",  chg: "—",      c: "#a78bfa"  },
                  ].map(a => (
                    <div key={a.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "rgba(148,163,184,0.65)", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.c, display: "inline-block" }} aria-hidden="true" />
                        {a.label}
                      </span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>{a.val}</span>
                        <span style={{ fontSize: 11, color: a.chg === "—" ? "rgba(100,116,139,0.5)" : "#4ade80", fontFamily: "'DM Mono', monospace" }}>{a.chg}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Reveal>

            {/* Forecast card */}
            <Reveal delay={2}>
              <div className="feat-card">
                <div className="feat-card-icon" style={{ background: "rgba(167,139,250,0.12)" }} aria-hidden="true">🔭</div>
                <div className="feat-card-title">AI spending forecast</div>
                <div className="feat-card-desc">
                  Based on your history and scheduled payments, FinTwin projects your month-end balance before you get there — so you can act before it's too late.
                </div>
                <div style={{ marginTop: 16, padding: "14px 14px 6px", background: "rgba(0,0,0,0.2)", borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: "rgba(100,116,139,0.6)", marginBottom: 10, fontFamily: "'DM Mono', monospace" }}>June balance projection</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 70 }}>
                    {[
                      { h: 85, label: "W1", color: "#a78bfa",  proj: false },
                      { h: 65, label: "W2", color: "#a78bfa",  proj: false },
                      { h: 72, label: "W3", color: "#a78bfa",  proj: false },
                      { h: 48, label: "W4", color: "#fbbf24",  proj: true  },
                      { h: 31, label: "EOM", color: "#f87171", proj: true  },
                    ].map(b => (
                      <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                        <div style={{ width: "100%", height: `${b.h}%`, borderRadius: "4px 4px 0 0", background: b.proj ? "transparent" : b.color, border: b.proj ? `1px dashed ${b.color}` : "none", opacity: b.proj ? 0.6 : 0.8 }} />
                        <span style={{ fontSize: 9, color: "rgba(100,116,139,0.5)", fontFamily: "'DM Mono', monospace" }}>{b.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "#f87171", fontFamily: "'DM Mono', monospace" }}>
                    ⚠ Projected month-end: ₹4,200 — below your ₹10k safety target
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SECURITY SECTION
      ════════════════════════════════════════════════════════ */}
      <div className="sec-wrap" id="security">
        <section aria-labelledby="security-heading">
          <div className="section">
            {/* Ambient glow for security */}
            <div className="glow-blob" style={{ width: 500, height: 500, background: "rgba(34,211,238,0.05)", top: 0, right: -100, position: "absolute", filter: "blur(120px)", pointerEvents: "none" }} aria-hidden="true" />

            <Reveal>
              <div className="section-tag" style={{ color: "#22d3ee" }}>Security</div>
              <h2 className="section-h2" id="security-heading">
                Your data never crosses a border.<br />
                <span className="gt-purple">Your AI never leaves our servers.</span>
              </h2>
              <p className="section-sub">
                We built FinTwin for people who shouldn't have to choose between useful AI and financial privacy. You don't have to.
              </p>
            </Reveal>

            <div className="sec-grid">
              <Reveal delay={1}>
                <div className="sec-card">
                  <div className="sec-card-icon" style={{ background: "rgba(34,211,238,0.08)" }} aria-hidden="true">🔐</div>
                  <div className="sec-card-title">Your data is encrypted</div>
                  <div className="sec-card-desc">
                    Every sensitive piece of information — account numbers, balances, transactions — is encrypted before it's stored. Not just the database, but each individual field.
                  </div>
                </div>
              </Reveal>

              <Reveal delay={2}>
                <div className="sec-card">
                  <div className="sec-card-icon" style={{ background: "rgba(167,139,250,0.08)" }} aria-hidden="true">🏦</div>
                  <div className="sec-card-title">Secure bank linking</div>
                  <div className="sec-card-desc">
                    We connect to your bank accounts through a regulated, consent-based framework. No screen scraping, no storing your passwords — you're always in control.
                  </div>
                </div>
              </Reveal>

              <Reveal delay={1}>
                <div className="sec-card">
                  <div className="sec-card-icon" style={{ background: "rgba(74,222,128,0.08)" }} aria-hidden="true">🖥️</div>
                  <div className="sec-card-title">AI that stays on our servers</div>
                  <div className="sec-card-desc">
                    Our AI runs on our own infrastructure. Your financial data never leaves to any third-party AI service — it stays within our system, always.
                  </div>
                </div>
              </Reveal>

              <Reveal delay={2}>
                <div className="sec-card">
                  <div className="sec-card-icon" style={{ background: "rgba(251,191,36,0.08)" }} aria-hidden="true">📋</div>
                  <div className="sec-card-title">Full access history</div>
                  <div className="sec-card-desc">
                    Every login and action is logged. You can see exactly who accessed your account and when — because it's your data, and you deserve to know.
                  </div>
                </div>
              </Reveal>
            </div>

          </div>
        </section>
      </div>

      {/* ════════════════════════════════════════════════════════
          PRICING
      ════════════════════════════════════════════════════════ */}
      <section id="pricing" aria-labelledby="pricing-heading">
        <div className="section" style={{ textAlign: "center" }}>
          <Reveal>
            <div className="section-tag" style={{ display: "inline-block" }}>Pricing</div>
            <h2 className="section-h2" id="pricing-heading">Start free. Stay free.</h2>
            <p className="section-sub" style={{ margin: "0 auto" }}>
              FinTwin is free to use while we're in early access. No card required, no hidden costs. We'll be transparent when that changes.
            </p>
          </Reveal>

          <Reveal>
            <div className="price-card">
              <div className="price-badge">✦ Free Early Access</div>
              <div className="price-amount">₹0 <span>/ month</span></div>
              <p className="price-desc">Full access to every feature — AI Copilot, bank linking, goal planning, anomaly detection, financial score. Everything. Free, for now.</p>
              <div className="price-features" role="list">
                {[
                  "AI Copilot with 5 advisor personalities",
                  "RBI Account Aggregator bank linking",
                  "Auto-categorization & recurring expense detection",
                  "Financial score + goal planning",
                  "Anomaly detection & fraud alerts",
                  "Net worth tracking (EPF, MF, FD, gold)",
                  "AI spending forecast",
                  "AES-256 encryption & audit log",
                ].map(f => (
                  <div className="price-feat" key={f} role="listitem">
                    <div className="price-feat-check" aria-hidden="true">✓</div>
                    {f}
                  </div>
                ))}
              </div>
              <button
                className="btn-primary"
                style={{ width: "100%", padding: "16px", fontSize: 16, borderRadius: 14 }}
                onClick={() => navigate("/register")}
                aria-label="Create your free FinTwin account"
              >
                Get started — no card required
              </button>
              <p style={{ marginTop: 14, fontSize: 12, color: "rgba(100,116,139,0.5)", fontFamily: "'DM Mono', monospace" }}>
                We'll give you 30 days notice before any pricing changes.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SOCIAL PROOF
          TODO: Replace placeholder content with real user testimonials
          before public launch. Do not use these quotes as real reviews.
      ════════════════════════════════════════════════════════ */}
      <section aria-labelledby="social-heading">
        <div className="section" style={{ paddingTop: 0 }}>
          <Reveal>
            <div className="section-tag">Early users</div>
            <h2 className="section-h2" id="social-heading">
              What people are saying.
            </h2>
            <p className="section-sub" style={{ color: "rgba(100,116,139,0.5)", fontSize: 13, fontFamily: "'DM Mono', monospace", marginTop: 8 }}>
              {/* TODO: Replace with verified user testimonials before launch */}
              ✦ Placeholder quotes — replace with real user testimonials before shipping.
            </p>
          </Reveal>

          <div className="testimonial-grid">
            {[
              {
                quote: "I always knew I was spending too much on food but could never prove it to myself. FinTwin showed me ₹8,400 in three weeks. That number hit different.",
                name: "Arjun Mehta", role: "Software engineer, Bangalore", stars: 5, initials: "AM", color: "#a78bfa",
              },
              {
                quote: "The fact that my bank data isn't going to some American AI company matters to me. RBI AA + self-hosted AI — I actually trust this thing with my real numbers.",
                name: "Priya Nair", role: "Finance analyst, Mumbai", stars: 5, initials: "PN", color: "#22d3ee",
              },
              {
                quote: "I asked the Copilot if I could afford a MacBook Pro. It told me yes but said wait 6 weeks and here's why. That's the kind of AI I wanted.",
                name: "Karan Singh", role: "Freelancer, Delhi", stars: 5, initials: "KS", color: "#4ade80",
              },
            ].map((t, i) => (
              <Reveal key={i} delay={i + 1}>
                <div className="testimonial-card">
                  <div className="testimonial-stars" aria-label={`${t.stars} stars`}>
                    {"★".repeat(t.stars).split("").map((s, j) => <span key={j} style={{ color: "#fbbf24" }}>{s}</span>)}
                  </div>
                  <p className="testimonial-text">"{t.quote}"</p>
                  <div className="testimonial-author">
                    <div className="testimonial-avatar" style={{ background: `${t.color}18`, color: t.color }} aria-hidden="true">{t.initials}</div>
                    <div>
                      <div className="testimonial-name">{t.name}</div>
                      <div className="testimonial-role">{t.role}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════════════════════ */}
      <div className="cta-wrap" style={{ background: "linear-gradient(180deg, #060810 0%, #0a0614 50%, #060810 100%)", position: "relative", overflow: "hidden" }}>
        <div className="glow-blob" style={{ width: 700, height: 700, background: "rgba(124,58,237,0.1)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "none" }} aria-hidden="true" />
        <div className="cta-inner">
          <Reveal>
            <h2 className="cta-h2">
              Your money has been<br />
              waiting to be <span className="gt-purple">understood.</span>
            </h2>
            <p className="cta-sub">
              Join the people who stopped guessing and started knowing. Free, private, built for India.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                className="btn-hero"
                style={{ fontSize: 17, padding: "17px 40px", borderRadius: 14 }}
                onClick={() => navigate("/register")}
                aria-label="Create your free FinTwin account"
              >
                Start understanding your money
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button className="btn-hero-ghost" onClick={() => navigate("/login")} aria-label="Log in to existing account">Already have an account</button>
            </div>
            <p style={{ marginTop: 20, fontSize: 12, color: "rgba(100,116,139,0.5)", fontFamily: "'DM Mono', monospace" }}>
              Free · No credit card · Runs on our servers, not Google's
            </p>
          </Reveal>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════ */}
      <footer className="footer" role="contentinfo">
        <div className="footer-inner">
          <div className="footer-grid">
            {/* Brand */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div className="lnav-logo-mark" aria-hidden="true">F</div>
                <span className="lnav-wordmark">FinTwin<span> AI</span></span>
              </div>
              <p className="footer-brand-desc">
                AI-powered personal finance OS for India. Self-hosted AI, RBI AA bank linking, bank-level security. Know your money.
              </p>
            </div>

            {/* Product */}
            <div>
              <div className="footer-col-title">Product</div>
              <div className="footer-links">
                <button className="footer-link" onClick={() => scrollTo("features")}>Features</button>
                <button className="footer-link" onClick={() => scrollTo("security")}>Security</button>
                <button className="footer-link" onClick={() => scrollTo("pricing")}>Pricing</button>
                <button className="footer-link" onClick={() => navigate("/register")}>Get started</button>
              </div>
            </div>

            {/* Company */}
            <div>
              <div className="footer-col-title">Company</div>
              <div className="footer-links">
                <span className="footer-link">About</span>
                <span className="footer-link">Blog</span>
                <span className="footer-link">Careers</span>
                <span className="footer-link">Contact</span>
              </div>
            </div>

            {/* Legal */}
            <div>
              <div className="footer-col-title">Legal & Help</div>
              <div className="footer-links">
                <span className="footer-link">Privacy policy</span>
                <span className="footer-link">Terms of service</span>
                <span className="footer-link">Security disclosure</span>
                <span className="footer-link">Help center</span>
              </div>
            </div>
          </div>

          <div className="footer-bottom">
            <span className="footer-copy">© 2026 FinTwin AI · Built in India · v0.1.0-beta</span>
            <div className="footer-legal">
              <span className="footer-link" style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Privacy</span>
              <span className="footer-link" style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Terms</span>
              <span className="footer-link" style={{ fontSize: 12, fontFamily: "'DM Mono', monospace" }}>Security</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
