import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sun, Moon, CalendarDays, Coffee, Handshake, KeyRound, Landmark, Lock, MessageCircle, PauseCircle, PieChart, RefreshCw, Target, TrendingUp, FileSpreadsheet, Smartphone, QrCode, LineChart, ShieldAlert } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { toLight } from "./landingLightCss";
import { prefetchDashboard } from "../utils/prefetchDashboard";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { recordVisit, startDemo } from "../utils/demo";
import { isNativeApp } from "../native";

/* One typeface everywhere: Inter, from the app bundle */

/* ─── All Landing CSS ──────────────────────────────────────────── */
const CSS = `

.land *, .land *::before, .land *::after { box-sizing: border-box; margin: 0; padding: 0; }
.land { font-family: 'Inter Variable', 'Inter', system-ui, sans-serif; font-feature-settings: 'tnum' 1, 'cv11' 1; background: #060810; color: #e2e8f0; min-height: 100vh; overflow-x: hidden; }
.sg { font-family: inherit; }
.dm { font-family: inherit; }

/* ── Navbar ─────────────────────── */
.lnav { position: fixed; top: 0; left: 0; right: 0; z-index: 200; transition: background 0.35s ease, border-color 0.35s ease, padding 0.3s ease; padding: 22px 0; border-bottom: 1px solid transparent; }
.lnav.solid { background: rgba(6,8,16,0.93); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom-color: rgba(255,255,255,0.06); padding: 14px 0; }
.lnav-inner { max-width: 1200px; margin: 0 auto; padding: 0 32px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.lnav-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
.lnav-logo-mark { width: 34px; height: 34px; border-radius: 10px; background: #7c3aed; display: flex; align-items: center; justify-content: center; font-family: inherit; font-weight: 800; font-size: 18px; color: #fff; flex-shrink: 0; }
.lnav-wordmark { font-family: inherit; font-weight: 700; font-size: 17px; color: #e2e8f0; letter-spacing: -0.01em; }
.lnav-wordmark span { color: #a78bfa; }
.lnav-links { display: flex; align-items: center; gap: 8px; }
.lnav-link { background: none; border: none; color: rgba(148,163,184,0.8); font-size: 14px; font-weight: 500; cursor: pointer; padding: 8px 14px; border-radius: 8px; transition: color 0.15s, background 0.15s; font-family: inherit; text-decoration: none; }
.lnav-link:hover { color: #e2e8f0; background: rgba(255,255,255,0.05); }
.lnav-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-ghost { background: transparent; color: rgba(226,232,240,0.85); border: 1px solid rgba(255,255,255,0.12); border-radius: 11px; padding: 10px 22px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
.btn-ghost:hover { border-color: rgba(167,139,250,0.45); color: #a78bfa; background: rgba(167,139,250,0.06); }
.btn-primary { background: #7c3aed; color: #fff; border: none; border-radius: 999px; padding: 10px 22px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
.btn-primary:hover { transform: translateY(-2px); }
.btn-primary:active { transform: translateY(0); }
.lnav-ham { display: none; flex-direction: column; gap: 5px; background: none; border: none; cursor: pointer; padding: 8px; border-radius: 8px; }
.lnav-ham span { display: block; width: 22px; height: 2px; background: #e2e8f0; border-radius: 2px; transition: all 0.25s; }
.mob-menu { display: none; position: fixed; inset: 0; z-index: 210; /* above .lnav (200), or the navbar hides its ✕ */ background: rgba(6,8,16,0.97); backdrop-filter: blur(20px); flex-direction: column; align-items: center; justify-content: center; gap: 24px; }
.mob-menu.open { display: flex; }
.mob-link { font-family: inherit; font-size: 28px; font-weight: 700; color: #e2e8f0; text-decoration: none; background: none; border: none; cursor: pointer; transition: color 0.15s; }
.mob-link:hover { color: #a78bfa; }

/* ── Hero ───────────────────────── */
.hero { min-height: 100vh; display: flex; align-items: center; position: relative; overflow: hidden; padding-top: 80px; }
.hero-inner { max-width: 1200px; margin: 0 auto; padding: 80px 32px 60px; display: grid; grid-template-columns: 55fr 45fr; gap: 64px; align-items: center; width: 100%; }
.hero-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(167,139,250,0.1); border: 1px solid rgba(167,139,250,0.25); border-radius: 100px; padding: 7px 16px; font-size: 12px; color: #c4b5fd; font-weight: 600; letter-spacing: 0; margin-bottom: 28px; }
.hero-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #a78bfa; animation: pulse-dot 2s ease infinite; flex-shrink: 0; }
.hero-h1 { font-family: inherit; font-size: clamp(44px, 6vw, 76px); font-weight: 700; line-height: 1.05; letter-spacing: -0.035em; color: #f1f5f9; margin-bottom: 24px; }
.hero-h1 .grad { color: #a78bfa; }
.hero-h1 .gold { color: #fbbf24; }
.hero-sub { font-size: 17px; line-height: 1.65; color: rgba(148,163,184,0.85); max-width: 520px; margin-bottom: 40px; }
.hero-ctas { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 52px; }
.btn-hero { background: #7c3aed; color: #fff; border: none; border-radius: 999px; padding: 15px 32px; font-weight: 600; font-size: 16px; cursor: pointer; transition: all 0.2s; font-family: inherit; display: flex; align-items: center; gap: 8px; }
.btn-hero:hover { transform: translateY(-3px); }
.btn-hero-ghost { background: transparent; color: rgba(226,232,240,0.85); border: 1px solid rgba(255,255,255,0.15); border-radius: 13px; padding: 15px 28px; font-weight: 600; font-size: 16px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
.demo-cta { flex-basis: 100%; display: flex; align-items: center; gap: 18px; flex-wrap: wrap; margin-top: 10px; padding: 18px 20px; border-radius: 18px; background: linear-gradient(135deg, rgba(34,211,238,0.16) 0%, rgba(167,139,250,0.16) 100%); border: 1px solid rgba(34,211,238,0.5); box-shadow: 0 0 0 4px rgba(34,211,238,0.07), 0 10px 36px rgba(34,211,238,0.2); }
.demo-cta-text { flex: 1; min-width: 220px; }
.demo-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 11px; font-weight: 800; letter-spacing: 0; color: #22d3ee; margin-bottom: 6px; }
.demo-badge-dot { width: 7px; height: 7px; border-radius: 50%; background: #22d3ee; animation: demoPulse 1.8s ease-out infinite; }
.demo-cta-title { font-family: inherit; font-size: 18px; font-weight: 800; color: #f1f5f9; line-height: 1.3; }
.demo-cta-sub { font-size: 13.5px; color: rgba(226,232,240,0.78); line-height: 1.5; margin-top: 3px; }
.btn-demo { background: #7c3aed; color: #fff; border: none; border-radius: 999px; padding: 14px 26px; font-weight: 600; font-size: 15px; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; white-space: nowrap; }
.btn-demo:hover { transform: translateY(-2px); }
.btn-demo:active { transform: translateY(0); }
.btn-demo:disabled { opacity: 0.7; cursor: wait; transform: none; }
@keyframes demoPulse { 0% { box-shadow: 0 0 0 0 rgba(34,211,238,0.65); } 70% { box-shadow: 0 0 0 8px rgba(34,211,238,0); } 100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); } }
.btn-hero-ghost:hover { border-color: rgba(167,139,250,0.45); color: #a78bfa; background: rgba(167,139,250,0.06); transform: translateY(-1px); }
.hero-stats { display: flex; gap: 32px; flex-wrap: wrap; }
.hero-stat-val { font-family: inherit; font-size: 26px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.02em; }
.hero-stat-val .rupee { color: #fbbf24; }
.hero-stat-label { font-size: 12px; color: rgba(100,116,139,0.7); font-weight: 500; margin-top: 2px; letter-spacing: 0; }

/* ── Transaction Theater ─────────── */
.tx-theater { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 24px; padding: 24px; backdrop-filter: blur(16px); position: relative; }
.tx-theater-hdr { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.tx-theater-dot { width: 8px; height: 8px; border-radius: 50%; }
.tx-theater-title { font-size: 12px; font-weight: 600; color: rgba(148,163,184,0.7); letter-spacing: 0; font-family: inherit; }
.tx-list { display: flex; flex-direction: column; gap: 10px; min-height: 340px; }
.tx-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); transition: all 0.3s ease; }
.tx-item.active { background: rgba(167,139,250,0.06); border-color: rgba(167,139,250,0.2); }
.tx-raw { font-family: inherit; font-size: 11px; color: rgba(100,116,139,0.65); letter-spacing: 0; line-height: 1.4; max-width: 200px; }
.tx-resolved { display: flex; align-items: center; gap: 8px; }
.tx-tag { display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; }
.tx-amount { font-family: inherit; font-size: 14px; font-weight: 700; color: #fbbf24; }
.tx-thinking { display: flex; gap: 4px; align-items: center; padding: 4px 10px; }
.tx-dot { width: 5px; height: 5px; border-radius: 50%; background: #a78bfa; }
.tx-dot-1 { animation: txPulse 0.9s ease-in-out 0s infinite; }
.tx-dot-2 { animation: txPulse 0.9s ease-in-out 0.2s infinite; }
.tx-dot-3 { animation: txPulse 0.9s ease-in-out 0.4s infinite; }
.tx-theater-footer { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 8px; }
.tx-ai-tag { font-size: 11px; color: rgba(167,139,250,0.7); font-family: inherit; }

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
.section-tag { font-size: 11px; font-weight: 700; letter-spacing: 0; color: #a78bfa; margin-bottom: 16px; font-family: inherit; }
.section-h2 { font-family: inherit; font-size: clamp(32px, 4vw, 52px); font-weight: 700; letter-spacing: -0.03em; color: #f1f5f9; line-height: 1.1; margin-bottom: 16px; }
.section-sub { font-size: 17px; line-height: 1.65; color: rgba(148,163,184,0.8); max-width: 560px; }

/* ── Feature cards ──────────────── */
.feat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 56px; }
.feat-grid-3 { grid-template-columns: repeat(3, 1fr); }
.feat-split { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: center; }
.feat-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.07); border-radius: 20px; padding: 28px; transition: all 0.25s ease; cursor: default; }
.feat-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.04); border-color: rgba(167,139,250,0.18); box-shadow: 0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(167,139,250,0.12); }
.feat-card-icon { width: 44px; height: 44px; border-radius: 999px; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; flex-shrink: 0; background: rgba(167,139,250,0.12); color: #a78bfa; }
.feat-card-title { font-family: inherit; font-size: 18px; font-weight: 700; color: #f1f5f9; margin-bottom: 10px; letter-spacing: -0.01em; }
.feat-card-desc { font-size: 14px; line-height: 1.65; color: rgba(148,163,184,0.75); }
.feat-card-visual { margin-top: 20px; border-radius: 12px; overflow: hidden; }

/* mini UI elements inside cards */
.mini-bar-wrap { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
.mini-bar-row { display: flex; align-items: center; gap: 10px; }
.mini-bar-label { font-size: 11px; color: rgba(100,116,139,0.7); width: 72px; flex-shrink: 0; font-family: inherit; }
.mini-bar-track { flex: 1; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.mini-bar-fill { height: 100%; border-radius: 3px; transition: width 1.2s ease; }
.mini-bar-val { font-size: 11px; font-family: inherit; font-weight: 700; width: 40px; text-align: right; flex-shrink: 0; }

.mini-score-ring { display: flex; align-items: center; justify-content: center; padding: 20px; }
.mini-chat { display: flex; flex-direction: column; gap: 8px; padding: 14px; background: rgba(0,0,0,0.2); border-radius: 12px; }
.mini-chat-user { align-self: flex-end; background: rgba(124,58,237,0.2); border: 1px solid rgba(167,139,250,0.2); border-radius: 10px 10px 2px 10px; padding: 8px 12px; font-size: 12px; color: #c4b5fd; max-width: 80%; }
.mini-chat-ai { align-self: flex-start; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px 10px 10px 2px; padding: 8px 12px; font-size: 12px; color: rgba(226,232,240,0.85); max-width: 90%; line-height: 1.5; }
.mini-chat-ai-tag { font-size: 10px; color: #a78bfa; margin-bottom: 4px; font-weight: 700; font-family: inherit; }

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
.mini-goal-pct { font-size: 11px; font-family: inherit; font-weight: 700; color: #4ade80; flex-shrink: 0; }

.mini-forecast { display: flex; align-items: flex-end; gap: 4px; padding: 14px; height: 72px; }
.mini-forecast-bar { flex: 1; border-radius: 4px 4px 0 0; position: relative; }
.mini-forecast-bar.projected { opacity: 0.45; border: 1px dashed rgba(255,255,255,0.15); }

.mini-recurring { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
.mini-rec-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: rgba(255,255,255,0.025); border-radius: 8px; }
.mini-rec-name { font-size: 12px; color: rgba(226,232,240,0.8); display: flex; align-items: center; gap: 6px; }
.mini-rec-amt { font-size: 12px; font-family: inherit; font-weight: 700; color: #fbbf24; }

/* ── Security section ────────────── */
.sec-wrap { background: rgba(6,8,16,1); border-top: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); position: relative; overflow: hidden; }
.sec-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 56px; }
.sec-card { background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 18px; padding: 28px; transition: border-color 0.2s; }
.sec-card:hover { border-color: rgba(34,211,238,0.2); }
.sec-card-icon { width: 42px; height: 42px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 18px; margin-bottom: 16px; }
.sec-card-title { font-family: inherit; font-size: 16px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; letter-spacing: -0.01em; }
.sec-card-desc { font-size: 13px; line-height: 1.65; color: rgba(148,163,184,0.7); }
.sec-card-mono { font-family: inherit; font-size: 11px; color: rgba(34,211,238,0.7); margin-top: 10px; background: rgba(34,211,238,0.05); border: 1px solid rgba(34,211,238,0.1); border-radius: 6px; padding: 6px 10px; display: inline-block; }

/* ── Pricing ─────────────────────── */
.price-card { background: rgba(255,255,255,0.025); border: 1px solid rgba(167,139,250,0.2); border-radius: 24px; padding: 44px 40px; max-width: 520px; margin: 56px auto 0; position: relative; overflow: hidden; }
.price-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; background: linear-gradient(90deg, #7c3aed, #a78bfa, #22d3ee); }
.price-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(74,222,128,0.1); border: 1px solid rgba(74,222,128,0.25); border-radius: 100px; padding: 5px 14px; font-size: 12px; color: #4ade80; font-weight: 700; margin-bottom: 20px; font-family: inherit; letter-spacing: 0; }
.price-amount { font-family: inherit; font-size: 64px; font-weight: 700; color: #f1f5f9; letter-spacing: -0.04em; line-height: 1; margin-bottom: 8px; }
.price-amount span { font-size: 24px; color: rgba(148,163,184,0.6); font-weight: 500; }
.price-desc { font-size: 15px; color: rgba(148,163,184,0.75); margin-bottom: 32px; line-height: 1.6; }
.price-features { display: flex; flex-direction: column; gap: 12px; margin-bottom: 36px; }
.price-feat { display: flex; align-items: flex-start; gap: 12px; text-align: left; font-size: 14px; color: rgba(226,232,240,0.85); }
.price-feat-check { margin-top: 1px; width: 20px; height: 20px; border-radius: 50%; background: rgba(74,222,128,0.12); border: 1px solid rgba(74,222,128,0.3); display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }


/* ── Final CTA ──────────────────── */
.cta-wrap { position: relative; overflow: hidden; }
.cta-inner { max-width: 800px; margin: 0 auto; padding: 120px 32px; text-align: center; }
.cta-h2 { font-family: inherit; font-size: clamp(36px, 5vw, 64px); font-weight: 700; letter-spacing: -0.035em; color: #f1f5f9; line-height: 1.05; margin-bottom: 20px; }
.cta-sub { font-size: 17px; color: rgba(148,163,184,0.75); margin-bottom: 40px; line-height: 1.6; }

/* ── Footer ─────────────────────── */
.footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 60px 32px 40px; }
.footer-inner { max-width: 1200px; margin: 0 auto; }
.footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 48px; }
.footer-brand-desc { font-size: 13px; line-height: 1.7; color: rgba(100,116,139,0.7); margin-top: 14px; max-width: 240px; }
.footer-col-title { font-family: inherit; font-size: 13px; font-weight: 700; color: rgba(226,232,240,0.9); margin-bottom: 16px; letter-spacing: 0; }
.footer-links { display: flex; flex-direction: column; gap: 10px; }
.footer-link { font-size: 13px; color: rgba(100,116,139,0.7); text-decoration: none; transition: color 0.15s; cursor: pointer; background: none; border: none; font-family: inherit; text-align: left; }
.footer-link:hover { color: #a78bfa; }
.footer-bottom { padding-top: 28px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.footer-copy { font-size: 12px; color: #94a3b8; font-family: inherit; }
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
.gt-purple { color: #a78bfa; }
.gt-gold { color: #fbbf24; }
.gt-green { color: #4ade80; }


/* ══ Website-only layer (.land.web; the Android app never gets this class) ══ */
.web .hero { min-height: auto; }
.web .hero-inner { grid-template-columns: 44fr 56fr; gap: 56px; padding: 120px 32px 96px; }
.web .hero-h1 { font-size: clamp(44px, 5.4vw, 72px); }
.web .hero-stats { gap: 24px; flex-wrap: nowrap; }
.pv { position: relative; padding: 0 0 70px 0; margin-right: 40px; }
.pv-frame { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09); border-radius: 18px; overflow: hidden; box-shadow: 0 40px 100px -30px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02); }
.pv-top { display: flex; align-items: center; gap: 6px; padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); }
.pv-top i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.12); display: block; }
.pv-url { margin-left: 12px; flex: 1; max-width: 260px; height: 20px; border-radius: 6px; background: rgba(255,255,255,0.05); font-size: 10.5px; color: rgba(148,163,184,0.8); display: flex; align-items: center; padding: 0 10px; }
.pv-body { display: grid; grid-template-columns: 104px 1fr; min-height: 360px; }
.pv-side { border-right: 1px solid rgba(255,255,255,0.07); padding: 14px 10px; display: flex; flex-direction: column; gap: 6px; }
.pv-side span { font-size: 11px; color: rgba(148,163,184,0.8); padding: 6px 8px; border-radius: 8px; }
.pv-side span.on { background: rgba(167,139,250,0.12); color: #a78bfa; font-weight: 600; }
.pv-main { padding: 16px; display: grid; grid-template-columns: 1.15fr 1fr; gap: 10px; align-content: start; }
.pv-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 12px; }
.pv-k { font-size: 10px; color: rgba(148,163,184,0.85); }
.pv-v { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: #f1f5f9; margin-top: 2px; }
.pv-v.sm { font-size: 15px; }
.pv-n { font-size: 10px; color: #4ade80; margin-top: 2px; }
.pv-track { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.07); margin-top: 10px; overflow: hidden; }
.pv-track b { display: block; height: 100%; border-radius: 3px; background: #7c3aed; }
.pv-wide { grid-column: 1 / -1; }
.pv-bars { display: flex; align-items: flex-end; gap: 8px; height: 96px; margin-top: 10px; }
.pv-bars b { flex: 1; border-radius: 5px 5px 2px 2px; background: rgba(167,139,250,0.28); display: block; }
.pv-bars b.hi { background: #7c3aed; }
.pv-months { display: flex; gap: 8px; margin-top: 6px; }
.pv-months span { flex: 1; text-align: center; font-size: 9px; color: rgba(148,163,184,0.8); }
.pv .gm-card { position: absolute; right: -48px; bottom: 0; width: 262px; max-width: none; margin: 0; padding: 16px; background: rgba(6,8,16,0.96); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); box-shadow: 0 30px 70px -20px rgba(0,0,0,0.6); }
.pv .gm-name { font-size: 15px; }
.pv .gm-amount { font-size: 20px; }
.pv .gm-msg { font-size: 12px; margin: 8px 0; }
.pv .gm-facts { display: none; }
.pv .gm-btn { font-size: 11.5px; padding: 7px 10px; }

.pv-gain { font-size: 11px; font-weight: 600; color: #4ade80; margin-left: 6px; letter-spacing: 0; }
.pv-line { display: block; width: 100%; height: 70px; margin-top: 10px; }
.pv-area { fill: rgba(124,58,237,0.16); stroke: none; }
.pv-stroke { fill: none; stroke: #7c3aed; stroke-width: 1.4; vector-effect: non-scaling-stroke; }
.pv-split { display: flex; gap: 2px; height: 7px; border-radius: 4px; overflow: hidden; margin-top: 10px; }
.pv-split b { display: block; height: 100%; }
.pv-legend { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 8px; font-size: 10px; color: rgba(148,163,184,0.85); }
.pv-rows { padding: 4px 12px; }
.pv-row { display: grid; grid-template-columns: 1fr auto 44px; gap: 10px; padding: 8px 0; font-size: 11.5px; color: rgba(226,232,240,0.85); border-bottom: 1px solid rgba(255,255,255,0.06); }
.pv-row:last-child { border-bottom: none; }
.pv-row span:nth-child(2) { font-weight: 600; color: #f1f5f9; }
.pv-row .pv-gain { margin-left: 0; text-align: right; }
.pi-chip { background: rgba(74,222,128,0.14); color: #4ade80; }
.pi-card .gm-msg b { color: #f1f5f9; }

.hold-table { border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; }
.hold-row { display: grid; grid-template-columns: 1.6fr 1fr 0.8fr 0.9fr; gap: 10px; padding: 10px 14px; font-size: 13px; color: rgba(226,232,240,0.85); border-bottom: 1px solid rgba(255,255,255,0.06); }
.hold-row:last-child { border-bottom: none; }
.hold-row span:nth-child(2) { font-weight: 600; color: #f1f5f9; }
.hold-row .pv-gain { margin-left: 0; font-size: 13px; }
.hold-head { font-size: 11px; font-weight: 600; color: rgba(148,163,184,0.85); background: rgba(255,255,255,0.03); }
.hold-head span:nth-child(2) { font-weight: 600; color: rgba(148,163,184,0.85); }
.flag-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; line-height: 1.5; color: rgba(226,232,240,0.85); padding: 9px 12px; border-radius: 10px; background: rgba(251,191,36,0.08); margin-top: 8px; }
.flag-dot { width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; margin-top: 6px; flex-shrink: 0; }

.works { border-top: 1px solid rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.06); }
.works-inner { max-width: 1200px; margin: 0 auto; padding: 22px 32px; display: flex; align-items: center; justify-content: center; gap: 14px 34px; flex-wrap: wrap; }
.works-label { font-size: 12px; font-weight: 600; color: rgba(148,163,184,0.8); }
.works-item { font-size: 14px; font-weight: 600; color: rgba(226,232,240,0.78); display: inline-flex; align-items: center; gap: 8px; }
.works-item svg { color: #a78bfa; }

.why-split { display: grid; grid-template-columns: 1fr 1.1fr; gap: 72px; align-items: start; }
.why-list { list-style: none; }
.why-row { display: grid; grid-template-columns: 56px 1fr; gap: 6px 18px; padding: 26px 0; border-top: 1px solid rgba(255,255,255,0.08); }
.why-row:last-child { border-bottom: 1px solid rgba(255,255,255,0.08); }
.why-num { font-size: 13px; font-weight: 700; color: #a78bfa; padding-top: 3px; }

.web .steps { counter-reset: none; grid-template-columns: repeat(3, 1fr); gap: 0; margin-top: 48px; border: 1px solid rgba(255,255,255,0.07); border-radius: 22px; overflow: hidden; background: rgba(255,255,255,0.025); }
.web .step { border: none; border-radius: 0; background: transparent; padding: 30px 28px; border-right: 1px solid rgba(255,255,255,0.07); }
.web .steps > div:last-child .step { border-right: none; }
.feat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; margin-top: 48px; }
.feat-row .feat-card-icon { margin-bottom: 14px; }

.bento { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 56px; }
.bento .feat-card { height: 100%; display: flex; flex-direction: column; }
.bento-2 { grid-column: span 2; }
.bento-viz { margin-top: auto; padding-top: 22px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips span { font-size: 12px; font-weight: 600; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: rgba(226,232,240,0.85); }
.big-fig { font-size: 34px; font-weight: 700; letter-spacing: -0.03em; color: #f1f5f9; }
.big-fig small { display: block; font-size: 14px; font-weight: 600; color: #4ade80; margin-top: 4px; letter-spacing: 0; }

.web .sec-wrap { background: rgba(255,255,255,0.02); }
.footer-a { font-size: 13px; color: rgba(100,116,139,0.7); text-decoration: none; transition: color 0.15s; }
.footer-a:hover { color: #a78bfa; }
.web .footer-grid { grid-template-columns: 2fr 1fr 1fr; }

@media (max-width: 1100px) {
  .web .hero-inner { grid-template-columns: 1fr; }
  .pv { max-width: 640px; margin: 0 auto; width: 100%; }
  .pv { margin-right: 0; }
  .pv .gm-card { right: -8px; }
}
@media (max-width: 900px) {
  .web .hero-right { display: none; }
  .why-split { grid-template-columns: 1fr; gap: 24px; }
  .web .steps { grid-template-columns: 1fr; }
  .web .step { border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .feat-row { grid-template-columns: 1fr 1fr; }
  .bento { grid-template-columns: 1fr; }
  .bento-2 { grid-column: auto; }
}
@media (max-width: 600px) {
  .feat-row { grid-template-columns: 1fr; gap: 24px; }
  .web .footer-grid { grid-template-columns: 1fr; }
}

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
.new-pill { display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0; padding: 2px 7px; border-radius: 999px; background: #15803d; color: #fff; vertical-align: 2px; margin-right: 2px; font-family: inherit; }
.lnav-link .new-pill { margin: 0 0 0 4px; }
.fine-print { font-size: 12px; color: #94a3b8; font-family: inherit; }
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
.land.light.web .pv-frame { box-shadow: 0 40px 90px -36px rgba(40,24,90,0.28), 0 0 0 1px rgba(15,23,42,0.04); }
.land.light.web .pv .gm-card { box-shadow: 0 30px 60px -24px rgba(40,24,90,0.35); }
.land.light.web .hero { background: radial-gradient(900px 520px at 78% 30%, rgba(124,58,237,0.09), transparent 70%); }
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


/* The website's hero picture: the portfolio, with a skipped buy shown invested (made-up figures) */
function ProductPreview() {
  const line = [412, 418, 409, 431, 440, 436, 452, 461, 457, 470, 476, 482];
  const max = 490, min = 400;
  const pts = line.map((v, i) => `${(i / (line.length - 1)) * 100},${38 - ((v - min) / (max - min)) * 34}`).join(" ");
  return (
    <div className="pv" role="img" aria-label="The FinTwin portfolio: ₹4,82,310 across five funds and stocks, with a skipped ₹2,400 buy shown as what it could grow to">
      <div className="pv-frame" aria-hidden="true">
        <div className="pv-top"><i /><i /><i /><span className="pv-url">fintwin · Portfolio</span></div>
        <div className="pv-body">
          <div className="pv-side">
            <span>Home</span><span className="on">Invest</span><span>Spend</span><span>Me</span><span>Copilot</span>
          </div>
          <div className="pv-main">
            <div className="pv-card pv-wide">
              <div className="pv-k">Portfolio value</div>
              <div className="pv-v">₹4,82,310 <span className="pv-gain">+₹61,240 · 13.8% a year</span></div>
              <svg className="pv-line" viewBox="0 0 100 40" preserveAspectRatio="none">
                <polyline points={`0,40 ${pts} 100,40`} className="pv-area" />
                <polyline points={pts} className="pv-stroke" />
              </svg>
            </div>
            <div className="pv-card">
              <div className="pv-k">Where it sits</div>
              <div className="pv-split"><b style={{ width: "64%", background: "#7c3aed" }} /><b style={{ width: "24%", background: "#0ea5a4" }} /><b style={{ width: "12%", background: "#f59e0b" }} /></div>
              <div className="pv-legend"><span>Equity 64%</span><span>Debt 24%</span><span>Gold 12%</span></div>
            </div>
            <div className="pv-card">
              <div className="pv-k">Next SIP</div>
              <div className="pv-v sm">₹5,000</div>
              <div className="pv-n" style={{ color: "inherit", opacity: 0.7 }}>Flexi cap fund · 5 Dec</div>
            </div>
            <div className="pv-card pv-rows">
              {[["Flexi cap fund", "₹1,84,200", "+16.9%"], ["Nifty 50 index fund", "₹1,21,400", "+12.1%"], ["Gold ETF", "₹58,900", "+9.4%"]].map(([n, v, r]) => (
                <div className="pv-row" key={n}><span>{n}</span><span>{v}</span><span className="pv-gain">{r}</span></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="gm-card pi-card">
        <div className="gm-top">
          <span className="gm-chip pi-chip">Pause → Invest</span>
          <span className="gm-time">Skipped today</span>
        </div>
        <div className="gm-payee">
          <div>
            <div className="gm-name">Urban Threads</div>
            <div className="gm-sub">₹2,400 you didn't spend</div>
          </div>
        </div>
        <p className="gm-msg">At your SIP's past 11% a year, that's about <b>₹4,040 in 5 years</b>. Past returns aren't a promise.</p>
        <div className="gm-actions">
          <span className="gm-btn gm-primary">Add to my SIP plan</span>
          <span className="gm-btn gm-quiet">Not now</span>
        </div>
      </div>
    </div>
  );
}


/* The website's feature grid: each card shows a little of the real thing (made-up figures) */
function FeatureBento() {
  const rows = [
    { n: "Flexi cap fund", v: "₹1,84,200", r: "+16.9%", x: "15.2% a yr" },
    { n: "Nifty 50 index fund", v: "₹1,21,400", r: "+12.1%", x: "12.8% a yr" },
    { n: "Gold ETF", v: "₹58,900", r: "+9.4%", x: "11.0% a yr" },
    { n: "Short duration fund", v: "₹42,300", r: "+6.8%", x: "7.1% a yr" },
  ];
  return (
    <div className="bento">
      <Reveal className="bento-2">
        <div className="feat-card">
          <div className="feat-card-icon" aria-hidden="true"><LineChart size={20} /></div>
          <div className="feat-card-title">Every holding, valued today</div>
          <div className="feat-card-desc">One statement brings in every mutual fund you hold, from any app or AMC. Add stocks, FDs, PPF and gold by hand.</div>
          <div className="bento-viz" aria-hidden="true">
            <div className="hold-table">
              <div className="hold-row hold-head"><span>Holding</span><span>Value</span><span>Return</span><span>XIRR</span></div>
              {rows.map((h) => (
                <div className="hold-row" key={h.n}><span>{h.n}</span><span>{h.v}</span><span className="pv-gain">{h.r}</span><span>{h.x}</span></div>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 14 }}><span>CAMS</span><span>KFintech</span><span>NSDL</span><span>CDSL</span></div>
          </div>
        </div>
      </Reveal>
      <Reveal delay={1}>
        <div className="feat-card">
          <div className="feat-card-icon" aria-hidden="true"><TrendingUp size={20} /></div>
          <div className="feat-card-title">Your real return</div>
          <div className="feat-card-desc">"+42% total" says nothing without time. XIRR counts when each rupee went in, so you can compare it with an FD or the index.</div>
          <div className="bento-viz" aria-hidden="true">
            <div className="big-fig">13.8%<small>a year, XIRR</small></div>
          </div>
        </div>
      </Reveal>
      <Reveal>
        <div className="feat-card">
          <div className="feat-card-icon" aria-hidden="true"><ShieldAlert size={20} /></div>
          <div className="feat-card-title">A health check</div>
          <div className="feat-card-desc">What quietly costs you: regular plans, one fund carrying the portfolio, prices gone stale.</div>
          <div className="bento-viz" aria-hidden="true">
            <div className="flag-row"><span className="flag-dot" />Regular plan: about ₹6,200 a year more than direct</div>
            <div className="flag-row"><span className="flag-dot" />One fund is 42% of your portfolio</div>
          </div>
        </div>
      </Reveal>
      <Reveal delay={1}>
        <div className="feat-card">
          <div className="feat-card-icon" aria-hidden="true"><Landmark size={20} /></div>
          <div className="feat-card-title">Tax-loss and gain harvesting</div>
          <div className="feat-card-desc">Long-term equity gains up to ₹1.25 lakh a year are tax-free. FinTwin shows which units to sell and buy back to use it.</div>
          <div className="bento-viz" aria-hidden="true">
            <div className="big-fig">₹84,000<small>of gains you can book tax-free</small></div>
          </div>
        </div>
      </Reveal>
      <Reveal delay={2}>
        <div className="feat-card">
          <div className="feat-card-icon" aria-hidden="true"><MessageCircle size={20} /></div>
          <div className="feat-card-title">Ask about your money</div>
          <div className="feat-card-desc">Plain answers from your own numbers, typed or spoken.</div>
          <div className="bento-viz" aria-hidden="true">
            <div className="mini-chat">
              <div className="mini-chat-user">How have my funds done this year?</div>
              <div className="mini-chat-ai"><div className="mini-chat-ai-tag">FinTwin</div>Up ₹38,400 this year. The flexi-cap fund did most of it.</div>
            </div>
          </div>
        </div>
      </Reveal>
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

const WHY_WEB = [
  { title: "Money leaks before it's invested",
    desc: "₹150 here and ₹400 there is a SIP that never started. The leak happens at the counter, not in the portfolio." },
  { title: "Returns are hard to read",
    desc: "\"+18%\" means little without time. FinTwin shows XIRR: your real yearly return, counting when each rupee went in." },
  { title: "Costs hide in plain sight",
    desc: "A regular plan can cost 0.5–1.5% a year more than the direct one. Over 20 years, that's lakhs." },
];

const WHY = [
  { icon: Coffee, title: "Small spends add up",
    desc: "₹150 here and ₹400 there is how a month's savings quietly disappear." },
  { icon: Moon, title: "Late nights cost more",
    desc: "The buys people regret most happen late, on impulse, and in a hurry." },
  { icon: Target, title: "Goals slip out of sight",
    desc: "A trip, a phone, an emergency fund: easy to forget at the counter." },
];

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
  // The Android app opens on this page too; the newer website layout is for browsers only
  const web = !isNativeApp();

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
      toast("Your demo session ended. Start a new one any time.");
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

  const featuresSection = (
      <section id="features" aria-labelledby="features-heading">
        <div className="section">
          <Reveal>
            {web ? (<>
            <div className="section-tag">Investing</div>
            <h2 className="section-h2" id="features-heading">Every fund you own. Measured honestly.</h2>
            <p className="section-sub">
              Import your mutual-fund statement once. FinTwin values every holding, shows your real return,
              and flags what quietly costs you money.
            </p>
            </>) : (<>
            <div className="section-tag">Your money, in one place</div>
            <h2 className="section-h2" id="features-heading">Everything behind the pause.</h2>
            <p className="section-sub">
              Spend Guard knows your budget because FinTwin knows your money. Bring in your bank statements
              once and get the full picture.
            </p>
            </>)}
          </Reveal>
          {web ? <FeatureBento /> : (
          <div className="feat-grid">
            {[
              { icon: PieChart, title: "See where it goes",
                desc: "Every rupee sorted into clear categories, month by month." },
              { icon: Target, title: "Goals that keep up",
                desc: "Set a target and see when you'll get there, based on what you really save." },
              { icon: MessageCircle, title: "Ask about your money",
                desc: "\"Where did most of it go last month?\" Plain answers from your own data." },
              { icon: TrendingUp, title: "Your net worth",
                desc: "Savings, investments and loans together, so you know where you stand." },
            ].map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) + 1}>
                <div className="feat-card">
                  <div className="feat-card-icon" aria-hidden="true"><c.icon size={20} /></div>
                  <div className="feat-card-title">{c.title}</div>
                  <div className="feat-card-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
          )}
        </div>
      </section>
  );

  return (
    <div className={`land${isDark ? "" : " light"}${web ? " web" : ""}`}>
      <style>{isDark ? DARK_CSS : LIGHT_CSS}</style>

      {/* ── Mobile menu ──────────────────────────────────────── */}
      <div className={`mob-menu${menuOpen ? " open" : ""}`} role="dialog" aria-label="Navigation menu">
        {web ? (<>
        <button className="mob-link" onClick={() => scrollTo("features")} aria-label="Go to Investing">Investing</button>
        <button className="mob-link" onClick={() => scrollTo("spend-guard")} aria-label="Go to Pause → Invest">Pause → Invest</button>
        </>) : (<>
        <button className="mob-link" onClick={() => scrollTo("spend-guard")} aria-label="Go to Spend Guard">Spend Guard</button>
        <button className="mob-link" onClick={() => scrollTo("features")} aria-label="Go to Features">Features</button>
        </>)}
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
            {web ? (<>
              <button className="lnav-link" role="menuitem" onClick={() => scrollTo("features")}>Investing</button>
              <button className="lnav-link" role="menuitem" onClick={() => scrollTo("spend-guard")}>Pause → Invest</button>
            </>) : (<>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("spend-guard")}>Spend Guard <span className="new-pill">New</span></button>
            <button className="lnav-link" role="menuitem" onClick={() => scrollTo("features")}>Features</button>
            </>)}
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
            {web ? (<>
            <div className="hero-badge h-el-1" aria-label="Product highlights">
              <span className="new-pill">New</span>
              Future Twin is live · Made for India
            </div>

            <h1 className="hero-h1 h-el-2" id="hero-heading">
              Spend smart.<br />
              <span className="grad">Invest the rest.</span>
            </h1>

            <p className="hero-sub h-el-3">
              Every fund and stock you own in one place, with your real yearly return and what each one costs you.
              Then FinTwin finds money to invest in your own spending, before it slips away.
            </p>
            </>) : (<>
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
            </>)}

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
              {(web ? [["1 file", "All your funds"], ["XIRR", "Real yearly return"], ["₹0", "Money we hold"]]
                    : [["₹0", "Money we hold"], ["5 sec", "A pause, not a block"], ["You", "Make the call"]]).flatMap(([v, l], i) => [
                i > 0 && <div key={`sep-${l}`} style={{ width: 1, height: 36, background: "rgba(255,255,255,0.07)", alignSelf: "center" }} aria-hidden="true" />,
                <div key={l}>
                  <div className="hero-stat-val">{v}</div>
                  <div className="hero-stat-label">{l}</div>
                </div>,
              ]).filter(Boolean)}
            </div>
          </div>

          <div className="hero-right" aria-label="Example: Spend Guard pausing a payment">
            {web ? <ProductPreview /> : <GuardMockup />}
          </div>
        </div>
      </section>

      {web && (
        <div className="works" aria-label="What FinTwin works with">
          <div className="works-inner">
            <span className="works-label">Works with</span>
            <span className="works-item"><QrCode size={16} aria-hidden /> Google Pay, PhonePe, Paytm</span>
            <span className="works-item"><FileSpreadsheet size={16} aria-hidden /> Bank statements: CSV, PDF, Excel</span>
            <span className="works-item"><LineChart size={16} aria-hidden /> Mutual-fund CAS</span>
            <span className="works-item"><Smartphone size={16} aria-hidden /> Bank SMS on Android</span>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          WHY
      ════════════════════════════════════════════════════════ */}
      {web ? (
      <section id="why" aria-labelledby="why-heading">
        <div className="section why-split">
          <Reveal>
            <div className="section-tag">Why FinTwin</div>
            <h2 className="section-h2" id="why-heading">
              Investing apps show your funds.<br />
              <span className="gt-purple">Nobody shows where the money came from.</span>
            </h2>
            <p className="section-sub">
              Brokers show what you hold. Budget apps show what you spent. FinTwin joins the two, so the money
              you'd have wasted ends up working for you.
            </p>
          </Reveal>
          <Reveal delay={1}>
            <ol className="why-list">
              {WHY_WEB.map((c, i) => (
                <li className="why-row" key={c.title}>
                  <span className="why-num" aria-hidden="true">0{i + 1}</span>
                  <div>
                    <div className="feat-card-title">{c.title}</div>
                    <div className="feat-card-desc">{c.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>
      ) : (
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
            {WHY.map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) + 1}>
                <div className="feat-card">
                  <div className="feat-card-icon" aria-hidden="true"><c.icon size={20} /></div>
                  <div className="feat-card-title">{c.title}</div>
                  <div className="feat-card-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      )}

      {web && featuresSection}

      {/* ════════════════════════════════════════════════════════
          SPEND GUARD: how it works
      ════════════════════════════════════════════════════════ */}
      <section id="spend-guard" aria-labelledby="sg-heading">
        <div className="section">
          <Reveal>
            {web ? (<>
            <div className="section-tag">Pause → Invest</div>
            <h2 className="section-h2" id="sg-heading">Your next SIP is hiding in your spending.</h2>
            <p className="section-sub">
              Spend Guard sits between the scan and the payment. When a buy would hurt, it pauses for a second.
              Skip it, and FinTwin shows that money invested.
            </p>
            </>) : (<>
            <div className="section-tag"><span className="new-pill">New feature</span> Spend Guard</div>
            <h2 className="section-h2" id="sg-heading">A second look, in seconds.</h2>
            <p className="section-sub">
              Spend Guard sits between the scan and the payment. Most payments go straight through.
              When one would hurt, it tells you why, in your own numbers.
            </p>
            </>)}
          </Reveal>
          <ol className="steps" aria-label="How Spend Guard works">
            {(web ? [
              { n: "1", title: "Pause before you pay", desc: "Scan any UPI QR. Groceries and bills go straight through; a buy that breaks your budget gets a short, honest note." },
              { n: "2", title: "Keep the difference", desc: "Skip it or wishlist it for 2 days. Round-ups and money left in your week add to the pile." },
              { n: "3", title: "See it invested", desc: "Future Twin shows that money in your SIPs over 5, 10 and 20 years, at a return you choose." },
            ] : [
              { n: "1", title: "Scan as usual", desc: "Scan the shop's QR code, or enter a UPI ID. If Spend Guard can't tell what a payment is for, it simply asks." },
              { n: "2", title: "Spend Guard checks", desc: "Your budget, what's left this week, your goals and the time of day, in a few seconds." },
              { n: "3", title: "You decide", desc: "Pay in Google Pay, skip it, or put it on a 2-day wishlist. PhonePe and Paytm work too." },
            ]).map((st, i) => (
              <Reveal key={st.n} delay={i + 1}>
                <li className="step">
                  <div className="step-n" aria-hidden="true">{st.n}</div>
                  <div className="feat-card-title">{st.title}</div>
                  <div className="feat-card-desc">{st.desc}</div>
                </li>
              </Reveal>
            ))}
          </ol>
          <div className={web ? "feat-row" : "feat-grid"} style={web ? undefined : { marginTop: 28 }}>
            {[
              { icon: PauseCircle, title: "A pause only when it matters",
                desc: "Essentials and small payments never wait. A buy that breaks your budget gets a short, honest note." },
              { icon: CalendarDays, title: "Payday, planned",
                desc: "Bills, goals and a safety buffer come first. The rest becomes a weekly allowance." },
              { icon: RefreshCw, title: "Top-ups that think first",
                desc: "Need more this week? Spend Guard checks what you can spare. Bill money is never touched." },
              { icon: Handshake, title: "Advice, never a block",
                desc: "You can always pay anyway. Your UPI app makes every payment, with your PIN." },
            ].map((c, i) => (
              <Reveal key={c.title} delay={(i % 2) + 1}>
                <div className={web ? "" : "feat-card"}>
                  <div className="feat-card-icon" aria-hidden="true"><c.icon size={20} /></div>
                  <div className="feat-card-title">{c.title}</div>
                  <div className="feat-card-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {!web && featuresSection}

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
                { icon: Landmark, title: "We never touch your money",
                  desc: "FinTwin can't hold, move or send money. Every payment happens in your own UPI app." },
                { icon: Lock, title: "Private by default",
                  desc: "Your data is encrypted, never sold, and yours to export or delete at any time." },
                { icon: KeyRound, title: "No bank passwords",
                  desc: "We never ask for them. You bring in your statements; you choose what we see." },
              ].map((c, i) => (
                <Reveal key={c.title} delay={(i % 2) + 1}>
                  <div className="feat-card">
                    <div className="feat-card-icon" aria-hidden="true"><c.icon size={20} /></div>
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
                {(web ? [
                  "Every fund from one CAS statement, valued daily",
                  "XIRR: your real yearly return, per fund and overall",
                  "Health check: plan costs, concentration, stale prices",
                  "Tax harvesting and SIP tracking",
                  "Pause → Invest and Future Twin",
                  "Spending, budgets and Spend Guard",
                  "Encrypted, private, and never sold",
                ] : [
                  "Spend Guard: a check before every payment",
                  "Bank and UPI statement import",
                  "Spending by category, month by month",
                  "Savings goals and a monthly plan",
                  "Answers about your money, in plain words",
                  "Net worth: savings, investments and loans",
                  "Encrypted, private, and never sold",
                ]).map(f => (
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
              {web ? <>Start with one<br /><span className="gt-purple">statement.</span></>
                   : <>Spend with a<br /><span className="gt-purple">second thought.</span></>}
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
                    {web ? "See your real returns" : "Start understanding your money"}
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

            {web ? (
            <div>
              <div className="footer-col-title">Legal</div>
              <div className="footer-links">
                <a className="footer-a" href="/privacy-policy">Privacy policy</a>
                <a className="footer-a" href="/terms">Terms of service</a>
              </div>
            </div>
            ) : (<>
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
            </>)}
          </div>

          <div className="footer-bottom">
            <span className="footer-copy">© 2026 FinTwin AI · Made in India · Beta</span>
            {web ? (
              <div className="footer-legal">
                <a className="footer-a" style={{ fontSize: 12 }} href="/privacy-policy">Privacy</a>
                <a className="footer-a" style={{ fontSize: 12 }} href="/terms">Terms</a>
              </div>
            ) : (
            <div className="footer-legal">
              <span className="footer-link" style={{ fontSize: 12 }}>Privacy</span>
              <span className="footer-link" style={{ fontSize: 12 }}>Terms</span>
              <span className="footer-link" style={{ fontSize: 12 }}>Security</span>
            </div>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
