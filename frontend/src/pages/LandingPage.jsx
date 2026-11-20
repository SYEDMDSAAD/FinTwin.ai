import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { toLight } from "./landingLightCss";
import { prefetchDashboard } from "../utils/prefetchDashboard";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { recordVisit, startDemo } from "../utils/demo";

/* Fonts (Space Grotesk, DM Mono) are requested in index.html */

/* ─── All Landing CSS ──────────────────────────────────────────── */
const CSS = `

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
.mob-menu { display: none; position: fixed; inset: 0; z-index: 210; /* above .lnav (200), or the navbar hides its ✕ */ background: rgba(6,8,16,0.97); backdrop-filter: blur(20px); flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
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
.demo-cta { flex-basis: 100%; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 10px; padding: 18px 20px; border-radius: 18px; background: linear-gradient(135deg, rgba(34,211,238,0.16) 0%, rgba(167,139,250,0.16) 100%); border: 1px solid rgba(34,211,238,0.5); box-shadow: 0 0 0 4px rgba(34,211,238,0.07), 0 10px 36px rgba(34,211,238,0.2); }
.demo-cta-text { flex: 1; min-width: 220px; }
.demo-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: #22d3ee; margin-bottom: 6px; }
.demo-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #22d3ee; animation: demoPulse 1.8s ease-out infinite; }
.demo-cta-title { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 800; color: #f1f5f9; line-height: 1.3; }
.demo-cta-sub { font-size: 13.5px; color: rgba(226,232,240,0.78); line-height: 1.5; margin-top: 3px; }
.btn-demo { background: linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%); color: #04131a; border: none; border-radius: 13px; padding: 14px 26px; font-weight: 800; font-size: 15px; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; white-space: nowrap; box-shadow: 0 6px 24px rgba(34,211,238,0.45); }
.btn-demo:hover { transform: translateY(-2px); box-shadow: 0 10px 32px rgba(34,211,238,0.6); }
.btn-demo:active { transform: translateY(0); }
.btn-demo:disabled { opacity: 0.7; cursor: wait; transform: none; }
@keyframes demoPulse { 0% { box-shadow: 0 0 0 0 rgba(34,211,238,0.65); } 70% { box-shadow: 0 0 0 8px rgba(34,211,238,0); } 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); } }
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
.feat-split { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; }
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
.price-feat { display: flex; align-items: flex-start; gap: 12px; text-align: left; font-size: 14px; color: rgba(226,232,240,0.85); }
.price-feat-check { margin-top: 1px; width: 20px; height: 20px; border-radius: 50%; background: rgba(74,222,128,0.12); border: 1px solid rgba(74,222,128,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }


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
.footer-copy { font-size: 12px; color: #94a3b8; font-family: 'DM Mono', monospace; }
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
  .feat-split { grid-template-columns: 1fr; gap: 24px; }
  .sec-grid { grid-template-columns: 1fr; }
  .footer-grid { grid-template-columns: 1fr 1fr; gap: 32px; }
  .lnav-links { display: none; }
  .lnav-ham { display: flex; }
}
@media (max-width: 600px) {
  /* Logo + Log In + Get Started + menu needed ~510 px, so on a phone the menu
     button fell off the screen. Both buttons are in the menu and the hero. */
  .lnav-inner { padding: 0 16px; gap: 12px; }
  .lnav-right .btn-ghost, .lnav-right .btn-primary { display: none; }
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
  .hero-badge-dot, .demo-badge-dot { animation: none !important; }
  .tx-dot-1, .tx-dot-2, .tx-dot-3 { animation: none !important; opacity: 1 !important; }
  .score-ring-anim { animation: none !important; stroke-dashoffset: 126 !important; }
}

/* ── Focus visible ───────────────── */
.land button:focus-visible, .land a:focus-visible { outline: 2px solid #a78bfa; outline-offset: 3px; border-radius: 8px; }
.theme-toggle { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.12); color: rgba(226,232,240,0.85); cursor: pointer; transition: all 0.2s; }
.theme-toggle:hover { border-color: rgba(167,139,250,0.45); color: #a78bfa; }
.inset-panel { background: rgba(0,0,0,0.22); }
.cta-bg { background: linear-gradient(180deg, #060810 0%, #0a0614 50%, #060810 100%); }

.hero-note { margin-top: 12px; font-size: 13px; color: rgba(148,163,184,0.7); }
.steps { list-style: none; padding: 0; margin: 36px 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.step { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 24px; height: 100%; }
.step-n { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-weight: 800; margin-bottom: 14px; background: rgba(34,197,94,0.15); color: #4ade80; }
.gm-card { max-width: 400px; margin: 0 auto; background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.09); border-radius: 22px; padding: 22px; box-shadow: 0 30px 80px rgba(0,0,0,0.35); }
.gm-top { display: flex; justify-content: space-between; align-items: center; }
.gm-chip { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: rgba(251,191,36,0.14); color: #fbbf24; }
.gm-time { font-size: 12px; color: rgba(148,163,184,0.7); }
.gm-payee { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16px; }
.gm-name { font-size: 18px; font-weight: 700; color: #f1f5f9; }
.gm-sub { font-size: 13px; color: rgba(148,163,184,0.75); }
.gm-amount { font-size: 26px; font-weight: 800; color: #f1f5f9; }
.gm-msg { font-size: 15px; line-height: 1.55; color: rgba(226,232,240,0.9); margin: 14px 0; }
.new-pill { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: #15803d; color: #fff; vertical-align: 2px; margin-right: 2px; font-family: inherit; }
.lnav-link .new-pill { margin: 0 0 0 4px; }
.fine-print { font-size: 12px; color: #94a3b8; font-family: 'DM Mono', monospace; }
.gm-facts { display: flex; gap: 8px; flex-wrap: wrap; }
.gm-facts span { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(148,163,184,0.14); color: #cbd5e1; }
.gm-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
.gm-btn { font-size: 13px; font-weight: 600; padding: 9px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); color: #e2e8f0; }
.gm-primary { background: #22c55e; border-color: #22c55e; color: #052e16; }
.gm-quiet { border-color: transparent; color: rgba(148,163,184,0.8); }
`;

// The same stylesheet for light mode, derived colour by colour (landingLightCss.js)
// Dark mode: faded greys on near-black fall under 4.5:1, so text greys are solid
const DARK_CSS = CSS
  .replace(/color: ?rgba\(100,116,139, ?[0-9.]+\)/g, "color: #94a3b8")
  .replace(/color: ?rgba\(148,163,184, ?0?\.[0-8][0-9]*\)/g, "color: #aab4c3");
// Small grey text needs a darker grey than the automatic swap gives it
const LIGHT_CSS = toLight(CSS) + `
.land.light .gm-facts span { background: #eef2f7; color: #334155; }
.land.light .footer-copy, .land.light .fine-print { color: #475569; }
.land.light .section-tag { color: #6d28d9; }
`;


/* ─── Transaction data ─────────────────────────────────────────── */
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
// The hero's picture: what a pause looks like (made-up figures)
function GuardMockup() {
  return (
    <div className="gm-card" role="img" aria-label="Spend Guard pausing a ₹2,400 clothes payment late at night, with its reason and options">
      <div className="gm-top">
        <span className="gm-chip">⏸ Pause</span>
        <span className="gm-time">11:40 PM</span>
      </div>
      <div className="gm-payee">
        <div>
          <div className="gm-name">Urban Threads</div>
          <div className="gm-sub">Shopping</div>
        </div>
        <div className="gm-amount">₹2,400</div>
      </div>
      <p className="gm-msg">This takes your Shopping budget ₹1,500 over, and it's 48% of what's left this week. Your Goa trip would move back about 12 days.</p>
      <div className="gm-facts">
        <span>₹2,600 left this week</span><span>4 days to allowance</span>
      </div>
      <div className="gm-actions">
        <span className="gm-btn gm-primary">Skip it</span>
        <span className="gm-btn">Wishlist for 2 days</span>
        <span className="gm-btn gm-quiet">Pay anyway</span>
      </div>
    </div>
  );
}

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
  const { isDark, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const auth = useAuth();
  const [demoStarting, setDemoStarting] = useState(false);

  // "Try the demo": one click into a shared account with sample data
  const tryDemo = async () => {
    if (demoStarting) return;
    setDemoStarting(true);
    prefetchDashboard();
    try {
      await startDemo(auth?.login ?? (() => {}));
      navigate("/dashboard");
    } catch {
      toast.error("The demo couldn't start just now. Please try again in a moment.");
      setDemoStarting(false);
    }
  };

  // Count this visit for the admin's Growth tab (anonymous)
  useEffect(() => { recordVisit(); }, []);

  // Back here because a demo session ran out
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "ended") {
      toast("Your demo session ended. Start a new one any time.", { icon: "👋" });
      params.delete("demo");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? "?" + rest : ""));
    }
  }, []);
  const isLoggedIn = !!localStorage.getItem("token");

  // A signed-in visitor is one tap from the dashboard: fetch its code now
  useEffect(() => { if (isLoggedIn) prefetchDashboard({ whenIdle: true }); }, [isLoggedIn]);

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
    <div className={`land${isDark ? "" : " light"}`}>
      <style>{isDark ? DARK_CSS : LIGHT_CSS}</style>

      {/* ── Mobile menu ──────────────────────────────────────── */}
      <div className={`mob-menu${menuOpen ? " open" : ""}`} role="dialog" aria-label="Navigation menu">
        <button className="mob-link" onClick={() => scrollTo("spend-guard")} aria-label="Go to Spend Guard">Spend Guard</button>
        <button className="mob-link" onClick={() => scrollTo("features")} aria-label="Go to Features">Features</button>
        <button className="mob-link" onClick={() => scrollTo("security")} aria-label="Go to Trust">Trust</button>
        <button className="mob-link" onClick={() => scrollTo("pricing")} aria-label="Go to Pricing">Pricing</button>
        <button className="theme-toggle" onClick={toggleTheme} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}>
          {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
        </button>
        <div style={{ width: "100%", height: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.1)", margin: "8px 0" }} />
        {isLoggedIn ? (
          <button className="btn-primary" style={{ fontSize: 18, padding: "16px 40px", borderRadius: 16 }} onPointerDown={() => prefetchDashboard()} onClick={() => { setMenuOpen(false); navigate("/dashboard"); }}>Open Dashboard</button>
        ) : (
          <>
            <button className="mob-link" onClick={() => { setMenuOpen(false); tryDemo(); }}>Try the demo</button>
            <button className="mob-link" onClick={() => { setMenuOpen(false); navigate("/login"); }}>Log In</button>
            <button className="btn-primary" style={{ fontSize: 18, padding: "16px 40px", borderRadius: 16 }} onClick={() => { setMenuOpen(false); navigate("/register"); }}>Get Started</button>
          </>
        )}
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
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("spend-guard")}>Spend Guard <span className="new-pill">New</span></button>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("features")}>Features</button>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("security")}>Trust</button>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("pricing")}>Pricing</button>
          </div>
          <div className="lnav-right">
            <button className="theme-toggle" onClick={toggleTheme} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} title={isDark ? "Light mode" : "Dark mode"}>
              {isDark ? <Sun size={17} aria-hidden /> : <Moon size={17} aria-hidden />}
            </button>
            {isLoggedIn ? (
              <button className="btn-primary" onPointerDown={() => prefetchDashboard()} onClick={() => navigate("/dashboard")} aria-label="Go to your dashboard">Open Dashboard</button>
            ) : (
              <>
                <button className="btn-ghost" onClick={() => navigate("/login")} aria-label="Log in to your account">Log In</button>
                <button className="btn-primary" onClick={() => navigate("/register")} aria-label="Create a free account">Get Started</button>
              </>
            )}
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
        <div className="glow-blob glow-purple" aria-hidden="true" />
        <div className="glow-blob glow-cyan" aria-hidden="true" />

        <div className="hero-inner">
          <div>
            <div className="hero-badge h-el-1" aria-label="Product highlights">
              <span className="new-pill">New</span>
              Spend Guard is live · Made for India
            </div>

            <h1 className="hero-h1 h-el-2" id="hero-heading">
              Pause before<br />
              <span className="grad">you pay.</span>
            </h1>

            <p className="hero-sub h-el-3">
              FinTwin checks a payment against your budget, your week and your goals before the money leaves.
              Groceries and bills go straight through. The spends you'd regret get a moment's thought.
            </p>

            <div className="hero-ctas h-el-4">
              {isLoggedIn ? (
                <button className="btn-hero" onPointerDown={() => prefetchDashboard()} onClick={() => navigate("/dashboard")} aria-label="Go to your dashboard">
                  Open Dashboard
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              ) : (
                <>
                  <button className="btn-hero" onPointerDown={() => prefetchDashboard()} onClick={tryDemo}
                          disabled={demoStarting} aria-label="Try FinTwin with a demo account, no sign-up">
                    {demoStarting ? "Opening the demo…" : "Try the live demo"}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button className="btn-hero-ghost" onClick={() => navigate("/register")} aria-label="Create your free FinTwin account">Create a free account</button>
                  <button className="btn-hero-ghost" onClick={() => navigate("/login")} aria-label="Log in to existing account">Log In</button>
                </>
              )}
            </div>
            {!isLoggedIn && (
              <p className="hero-note h-el-4">No sign-up for the demo. Sample data, nothing is paid.</p>
            )}

            <div className="hero-stats h-el-5">
              <div>
                <div className="hero-stat-val">₹0</div>
                <div className="hero-stat-label">Money we hold</div>
              </div>
              <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.07)", alignSelf: "center" }} aria-hidden="true" />
              <div>
                <div className="hero-stat-val">5 sec</div>
                <div className="hero-stat-label">A pause, not a block</div>
              </div>
              <div style={{ width: 1, height: 36, background: "rgba(255,255,255,0.07)", alignSelf: "center" }} aria-hidden="true" />
              <div>
                <div className="hero-stat-val">You</div>
                <div className="hero-stat-label">Make the call</div>
              </div>
            </div>
          </div>

          <div className="hero-right" aria-label="Example: Spend Guard pausing a payment">
            <GuardMockup />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          WHY
      ════════════════════════════════════════════════════════ */}
      <section id="why" aria-labelledby="why-heading">
        <div className="section">
          <Reveal>
            <div className="section-tag">Why FinTwin</div>
            <h2 className="section-h2" id="why-heading">
              Paying got instant.<br />
              <span className="gt-purple">Thinking about it didn't.</span>
            </h2>
            <p className="section-sub">
              A scan and a PIN, and the money's gone. Budget apps tell you what went wrong at the end of the
              month. FinTwin helps at the moment it matters: just before you pay.
            </p>
          </Reveal>
          <div className="feat-grid feat-grid-3">
            {[
              { icon: "☕", bg: "rgba(251,191,36,0.10)", title: "Small spends add up",
                desc: "₹150 here and ₹400 there is how a month's savings quietly disappear." },
              { icon: "🌙", bg: "rgba(167,139,250,0.12)", title: "Late nights cost more",
                desc: "The buys people regret most happen late, on impulse, and in a hurry." },
              { icon: "🎯", bg: "rgba(34,211,238,0.10)", title: "Goals slip out of sight",
                desc: "A trip, a phone, an emergency fund: easy to forget at the counter." },
            ].map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) + 1}>
                <div className="feat-card">
                  <div className="feat-card-icon" style={{ background: c.bg }} aria-hidden="true">{c.icon}</div>
                  <div className="feat-card-title">{c.title}</div>
                  <div className="feat-card-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          SPEND GUARD: how it works
      ════════════════════════════════════════════════════════ */}
      <section id="spend-guard" aria-labelledby="sg-heading">
        <div className="section">
          <Reveal>
            <div className="section-tag"><span className="new-pill">New feature</span> Spend Guard</div>
            <h2 className="section-h2" id="sg-heading">A second look, in seconds.</h2>
            <p className="section-sub">
              Spend Guard sits between the scan and the payment. Most payments go straight through.
              When one would hurt, it tells you why, in your own numbers.
            </p>
          </Reveal>
          <ol className="steps" aria-label="How Spend Guard works">
            {[
              { n: "1", title: "Scan as usual", desc: "Scan the shop's QR code, or enter a UPI ID. If Spend Guard can't tell what a payment is for, it simply asks." },
              { n: "2", title: "Spend Guard checks", desc: "Your budget, what's left this week, your goals and the time of day, in a few seconds." },
              { n: "3", title: "You decide", desc: "Pay in Google Pay, skip it, or put it on a 2-day wishlist. PhonePe and Paytm work too." },
            ].map((st, i) => (
              <Reveal key={st.n} delay={i + 1}>
                <li className="step">
                  <div className="step-n" aria-hidden="true">{st.n}</div>
                  <div className="feat-card-title">{st.title}</div>
                  <div className="feat-card-desc">{st.desc}</div>
                </li>
              </Reveal>
            ))}
          </ol>
          <div className="feat-grid" style={{ marginTop: 28 }}>
            {[
              { icon: "⏸️", bg: "rgba(167,139,250,0.12)", title: "A pause only when it matters",
                desc: "Essentials and small payments never wait. A buy that breaks your budget gets a short, honest note." },
              { icon: "📅", bg: "rgba(34,211,238,0.10)", title: "Payday, planned",
                desc: "Bills, goals and a safety buffer come first. The rest becomes a weekly allowance." },
              { icon: "🔄", bg: "rgba(251,191,36,0.10)", title: "Top-ups that think first",
                desc: "Need more this week? Spend Guard checks what you can spare. Bill money is never touched." },
              { icon: "🤝", bg: "rgba(74,222,128,0.10)", title: "Advice, never a block",
                desc: "You can always pay anyway. Your UPI app makes every payment, with your PIN." },
            ].map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) + 1}>
                <div className="feat-card">
                  <div className="feat-card-icon" style={{ background: c.bg }} aria-hidden="true">{c.icon}</div>
                  <div className="feat-card-title">{c.title}</div>
                  <div className="feat-card-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FEATURES: the rest of FinTwin
      ════════════════════════════════════════════════════════ */}
      <section id="features" aria-labelledby="features-heading">
        <div className="section">
          <Reveal>
            <div className="section-tag">Your money, in one place</div>
            <h2 className="section-h2" id="features-heading">Everything behind the pause.</h2>
            <p className="section-sub">
              Spend Guard knows your budget because FinTwin knows your money. Bring in your bank statements
              once and get the full picture.
            </p>
          </Reveal>
          <div className="feat-grid">
            {[
              { icon: "📊", bg: "rgba(34,211,238,0.10)", title: "See where it goes",
                desc: "Every rupee sorted into clear categories, month by month." },
              { icon: "🎯", bg: "rgba(167,139,250,0.12)", title: "Goals that keep up",
                desc: "Set a target and see when you'll get there, based on what you really save." },
              { icon: "💬", bg: "rgba(74,222,128,0.10)", title: "Ask about your money",
                desc: "\"Where did most of it go last month?\" Plain answers from your own data." },
              { icon: "📈", bg: "rgba(251,191,36,0.10)", title: "Your net worth",
                desc: "Savings, investments and loans together, so you know where you stand." },
            ].map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) + 1}>
                <div className="feat-card">
                  <div className="feat-card-icon" style={{ background: c.bg }} aria-hidden="true">{c.icon}</div>
                  <div className="feat-card-title">{c.title}</div>
                  <div className="feat-card-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          TRUST
      ════════════════════════════════════════════════════════ */}
      <div className="sec-wrap" id="security">
        <section aria-labelledby="security-heading">
          <div className="section">
            <Reveal>
              <div className="section-tag">Trust</div>
              <h2 className="section-h2" id="security-heading">
                Your money never leaves your bank.<br />
                <span className="gt-purple">Your data stays yours.</span>
              </h2>
            </Reveal>
            <div className="feat-grid feat-grid-3">
              {[
                { icon: "🏦", bg: "rgba(34,211,238,0.10)", title: "We never touch your money",
                  desc: "FinTwin can't hold, move or send money. Every payment happens in your own UPI app." },
                { icon: "🔒", bg: "rgba(167,139,250,0.12)", title: "Private by default",
                  desc: "Your data is encrypted, never sold, and yours to export or delete at any time." },
                { icon: "🔑", bg: "rgba(74,222,128,0.10)", title: "No bank passwords",
                  desc: "We never ask for them. You bring in your statements; you choose what we see." },
              ].map((c, i) => (
                <Reveal key={c.title} delay={(i % 2) + 1}>
                  <div className="feat-card">
                    <div className="feat-card-icon" style={{ background: c.bg }} aria-hidden="true">{c.icon}</div>
                    <div className="feat-card-title">{c.title}</div>
                    <div className="feat-card-desc">{c.desc}</div>
                  </div>
                </Reveal>
              ))}
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
              <p className="price-desc">Full access to every feature. Free, for now.</p>
              <div className="price-features" role="list">
                {[
                  "Spend Guard: a check before every payment",
                  "Bank and UPI statement import",
                  "Spending by category, month by month",
                  "Savings goals and a monthly plan",
                  "Answers about your money, in plain words",
                  "Net worth: savings, investments and loans",
                  "Encrypted, private, and never sold",
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
                onClick={() => navigate(isLoggedIn ? "/dashboard" : "/register")}
                aria-label={isLoggedIn ? "Go to your dashboard" : "Create your free FinTwin account"}
              >
                {isLoggedIn ? "Open Dashboard" : "Get started — no card required"}
              </button>
              <p className="fine-print" style={{ marginTop: 14 }}>
                We'll give you 30 days notice before any pricing changes.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════
          FINAL CTA
      ════════════════════════════════════════════════════════ */}
      <div className="cta-wrap cta-bg" style={{ position: "relative", overflow: "hidden" }}>
        <div className="glow-blob" style={{ width: 700, height: 700, background: "rgba(124,58,237,0.1)", top: "50%", left: "50%", transform: "translate(-50%,-50%)", animation: "none" }} aria-hidden="true" />
        <div className="cta-inner">
          <Reveal>
            <h2 className="cta-h2">
              Spend with a<br />
              <span className="gt-purple">second thought.</span>
            </h2>
            <p className="cta-sub">
              Free during beta. Try the live demo in one click, no sign-up needed.
            </p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
              {isLoggedIn ? (
                <button
                  className="btn-hero"
                  style={{ fontSize: 17, padding: "17px 40px", borderRadius: 14 }}
                  onPointerDown={() => prefetchDashboard()} onClick={() => navigate("/dashboard")}
                  aria-label="Go to your dashboard"
                >
                  Open Dashboard
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              ) : (
                <>
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
                </>
              )}
            </div>
            <p className="fine-print" style={{ marginTop: 20 }}>
              Free · No credit card · Delete anytime
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
                Personal finance for India. Pause before you pay, and see where your money goes.
              </p>
            </div>

            {/* Product */}
            <div>
              <div className="footer-col-title">Product</div>
              <div className="footer-links">
                <button className="footer-link" onClick={() => scrollTo("features")}>Features</button>
                <button className="footer-link" onClick={() => scrollTo("spend-guard")}>Spend Guard</button>
                <button className="footer-link" onClick={() => scrollTo("security")}>Security</button>
                <button className="footer-link" onClick={() => scrollTo("pricing")}>Pricing</button>
                <button className="footer-link" onClick={() => navigate(isLoggedIn ? "/dashboard" : "/register")}>{isLoggedIn ? "Dashboard" : "Get started"}</button>
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
            <span className="footer-copy">© 2026 FinTwin AI · Made in India · Beta</span>
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
