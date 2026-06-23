import {
    useEffect,
    useRef,
    useState
} from "react";

import toast from "react-hot-toast";
import { useTheme } from "../context/ThemeContext";
import GlassCard from "./GlassCard";

import {
    Bot,
    User,
    Sparkles,
    SendHorizonal,
    Trash2
} from "lucide-react";

import ReactMarkdown from "react-markdown";

function CopilotSection({

    chatMessage,
    setChatMessage,
    sendMessage,
    messages,
    aiLoading,

    selectedMode,
    setSelectedMode,

    clearChat

}) {

    const { isDark } = useTheme();

    // =====================================
    // Modes
    // =====================================

    const modes = [

        "Savings Advisor",

        "Investment Advisor",

        "Budget Coach",

        "Fraud Analyst",

        "Purchase Advisor"
    ];

    // =====================================
    // Suggested Prompts
    // =====================================

    const prompts = [

        "Can I afford a car?",

        "How can I improve my savings?",

        "Analyze my subscriptions",

        "Why is my financial score low?",

        "How much can I save monthly?",

        "Analyze my spending habits"
    ];

    // =====================================
    // AUTO SCROLL
    // =====================================

    const messagesEndRef =
        useRef(null);

    useEffect(() => {

        messagesEndRef.current
            ?.scrollIntoView({

                behavior: "smooth"
            });

    }, [messages, aiLoading]);

    // =====================================
    // ENTER KEY SEND
    // =====================================

    const handleKeyDown = (e) => {

        if (

            e.key === "Enter"

            &&

            !e.shiftKey

        ) {

            e.preventDefault();

            sendMessage();
        }
    };

    return (

        <GlassCard
            className="
                relative
                overflow-hidden
                p-7
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            "
        >

            <div
                className="
                    absolute
                    inset-x-0
                    top-0
                    h-px
                    bg-gradient-to-r
                    from-transparent
                    via-white/20
                    to-transparent
                "
            />

            {/* =====================================
                HEADER
            ===================================== */}

            <div
                className="
                    flex
                    items-center
                    justify-between
                    mb-6
                "
            >

                <div
                    className="
                        flex
                        items-center
                        gap-3
                    "
                >

                    <div
                        className="
                            w-10
                            h-10
                            rounded-xl
                            flex
                            items-center
                            justify-center
                            bg-gradient-to-r
                            from-purple-500/30
                            to-cyan-500/20
                            border
                            border-purple-500/20
                        "
                    >
                        <Sparkles size={18} />
                    </div>

                    <div>

                        <div
                            className="
                                text-[11px]
                                font-bold
                                tracking-[0.12em]
                                text-zinc-500
                            "
                        >
                            AI SUITE
                        </div>

                        <h2
                            className="
                                text-lg
                                font-bold
                            "
                        >
                            Financial Copilot
                        </h2>

                    </div>

                </div>

                <div className="flex items-center gap-2">
                    <div
                        className="
                            px-3
                            py-1
                            rounded-lg
                            text-xs
                            font-bold
                            border
                            border-purple-500/20
                            bg-purple-500/10
                            text-purple-300
                        "
                    >
                        {selectedMode.replace(" Advisor", "")}
                    </div>

                    {messages.length > 0 && (
                        <button
                            onClick={() => {
                                toast.custom((t) => (
                                    <div style={{
                                        background: isDark ? "#18181b" : "#ffffff",
                                        border: `1px solid ${isDark ? "rgba(248,113,113,0.25)" : "rgba(248,113,113,0.35)"}`,
                                        borderRadius: 14,
                                        padding: "14px 18px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 10,
                                        minWidth: 280,
                                        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.4)" : "0 4px 24px rgba(0,0,0,0.12)",
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Trash2 size={15} color="#f87171" />
                                            <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#f1f5f9" : "#111827" }}>
                                                Clear all chat history?
                                            </span>
                                        </div>
                                        <p style={{ fontSize: 12, color: isDark ? "rgba(148,163,184,0.7)" : "rgba(75,85,99,0.8)", margin: 0 }}>
                                            This cannot be undone.
                                        </p>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button
                                                onClick={() => { toast.dismiss(t.id); clearChat(); }}
                                                style={{
                                                    flex: 1, padding: "7px 0", borderRadius: 8,
                                                    background: "rgba(248,113,113,0.15)",
                                                    border: "1px solid rgba(248,113,113,0.3)",
                                                    color: "#f87171", fontSize: 12, fontWeight: 700,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Yes, clear
                                            </button>
                                            <button
                                                onClick={() => toast.dismiss(t.id)}
                                                style={{
                                                    flex: 1, padding: "7px 0", borderRadius: 8,
                                                    background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
                                                    border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)"}`,
                                                    color: isDark ? "rgba(148,163,184,0.8)" : "rgba(75,85,99,0.9)", fontSize: 12, fontWeight: 600,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ), { duration: Infinity });
                            }}
                            title="Clear chat history"
                            className="
                                flex items-center gap-1.5
                                px-2.5 py-1
                                rounded-lg text-xs font-semibold
                                border border-red-500/20
                                bg-red-500/10 text-red-400
                                hover:bg-red-500/20
                                transition-colors
                            "
                        >
                            <Trash2 size={12} />
                            Clear
                        </button>
                    )}
                </div>

            </div>

            {/* =====================================
                AI MODES
            ===================================== */}

            <div className="
                flex
                flex-wrap
                gap-3
                mb-6
            ">

                {modes.map((mode) => (

                    <button
                        key={mode}
                        onClick={() =>
                            setSelectedMode(mode)
                        }
                        className={`
                            px-3
                            py-1.5
                            rounded-lg
                            text-xs
                            font-semibold
                            border
                            transition-all
                            duration-200

                            ${
                                selectedMode === mode

                                ? `
                                    bg-purple-500/10
                                    border-purple-500/20
                                    text-purple-300
                                `

                                : `
                                    bg-white/[0.02]
                                    border-white/10
                                    text-zinc-400
                                    hover:bg-white/[0.05]
                                `
                            }
                        `}
                    >
                        {mode}
                    </button>

                ))}

            </div>

            {/* =====================================
                SUGGESTED PROMPTS
            ===================================== */}

            <div className="
                flex
                flex-wrap
                gap-3
                mb-6
            ">

                {prompts.map((prompt) => (

                    <button
                        key={prompt}
                        onClick={() =>
                            setChatMessage(prompt)
                        }
                        className="
                            px-3
                            py-1.5
                            rounded-lg
                            text-xs
                            font-medium
                            border
                            border-white/10
                            bg-white/[0.02]
                            text-zinc-400
                            hover:bg-white/[0.05]
                            transition-all
                            duration-200
                        "
                    >
                        {prompt}
                    </button>

                ))}

            </div>

            {/* =====================================
                STORAGE WARNING
            ===================================== */}

            {messages.length >= 80 && (
                <div className="
                    flex items-start gap-3
                    mb-4 px-4 py-3
                    rounded-xl
                    border border-amber-500/25
                    bg-amber-500/8
                    text-amber-300
                ">
                    <span className="text-base leading-none mt-0.5">⚠</span>
                    <p className="text-xs leading-relaxed">
                        You have <span className="font-bold">{Math.floor(messages.length / 2)} / 50</span> saved exchanges.
                        Once you hit 50, the oldest messages will be automatically removed as new ones come in.
                        Use <span className="font-bold">Clear</span> above to reset if needed.
                    </p>
                </div>
            )}

            {/* =====================================
                CHAT AREA
            ===================================== */}

            <div className="
                flex
                flex-col
                gap-5
                mb-6
                max-h-[45vh]
                overflow-y-auto
                pr-2
            ">

                {messages.length === 0 && (

                    <div
                        className="
                            text-center
                            py-16
                            text-zinc-500
                        "
                    >

                        <Sparkles
                            size={40}
                            className="
                                mx-auto
                                mb-4
                                text-purple-400/60
                            "
                        />

                        <p>
                            Ask anything about your finances
                        </p>

                    </div>

                )}

                {messages.map((msg, index) => (

                    <div
                        key={index}
                        className={`
                            flex

                            ${

                                msg.role === "user"

                                ? "justify-end"

                                : "justify-start"
                            }
                        `}
                    >

                        <div
                            className="max-w-[78%] shadow-xl"
                            style={{
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 18,
                                color: "#e2e8f0",
                                padding: "14px 18px",
                            }}
                        >

                            {/* HEADER */}

                            <div className="
                                flex
                                items-center
                                gap-2
                                mb-4
                            ">

                                {

                                    msg.role === "user"

                                    ? (
                                        <User
                                            size={18}
                                        />
                                    )

                                    : (
                                        <Bot
                                            size={18}
                                            className="
                                                text-purple-400
                                            "
                                        />
                                    )
                                }

                                <span
                                    className="
                                        text-[10px]
                                        font-bold
                                        tracking-[0.08em]
                                        text-zinc-500
                                    "
                                >

                                    {

                                        msg.role === "user"

                                        ? "You"

                                        : "FinTwin AI"
                                    }

                                </span>

                            </div>

                            {/* =====================================
                                MESSAGE CONTENT
                            ===================================== */}

                            {

                                msg.role === "assistant"

                                ? (

                                    <div className="
                                        prose
                                        prose-invert
                                        max-w-none
                                        prose-sm
                                        prose-p:text-zinc-200
                                        prose-headings:text-white
                                        prose-strong:text-purple-300
                                        prose-li:text-zinc-300
                                        break-words
                                    ">

                                        <ReactMarkdown>

                                            {msg.content}

                                        </ReactMarkdown>

                                    </div>

                                )

                                : (

                                    <p className="
                                        text-sm
                                        whitespace-pre-wrap
                                        break-words
                                        leading-relaxed
                                    ">
                                        {msg.content}
                                    </p>

                                )
                            }

                        </div>

                    </div>

                ))}

                {/* =====================================
                    AI THINKING
                ===================================== */}

                {aiLoading && (

                    <div className="
                        flex
                        justify-start
                    ">

                        <div className="
                            bg-white/[0.03]
                            border-white/10
                            backdrop-blur-xl
                            border
                            rounded-3xl
                            px-5
                            py-4
                            flex
                            items-center
                            gap-3
                            shadow-xl
                        ">

                            <Bot
                                className="
                                    text-purple-400
                                "
                                size={18}
                            />

                            <div className="
                                flex
                                gap-1
                            ">

                                <div className="
                                    w-2
                                    h-2
                                    bg-purple-400
                                    rounded-full
                                    animate-bounce
                                " />

                                <div className="
                                    w-2
                                    h-2
                                    bg-purple-400
                                    rounded-full
                                    animate-bounce
                                    delay-100
                                " />

                                <div className="
                                    w-2
                                    h-2
                                    bg-purple-400
                                    rounded-full
                                    animate-bounce
                                    delay-200
                                " />

                            </div>

                            <span className="
                                text-sm
                                opacity-70
                            ">
                                FinTwin AI is analyzing your finances...
                            </span>

                        </div>

                    </div>

                )}

                <div ref={messagesEndRef} />

            </div>

            {/* =====================================
                INPUT AREA
            ===================================== */}

            <div className="
                flex
                gap-3
                items-end
            ">

                <textarea
                    placeholder="Ask FinTwin AI..."
                    value={chatMessage}
                    onChange={(e) =>
                        setChatMessage(
                            e.target.value
                        )
                    }
                    onKeyDown={handleKeyDown}
                    rows={2}
                    className="
                        flex-1
                        bg-white/[0.03]
                        backdrop-blur-xl
                        p-4
                        rounded-xl
                        outline-none
                        text-sm
                        resize-none
                        border
                        border-white/10
                        focus:border-purple-500/40
                    "
                />

                {/* SEND BUTTON */}

                <button
                    onClick={sendMessage}
                    disabled={aiLoading}
                    className="
                        bg-gradient-to-r
                        from-purple-500
                        to-violet-600
                        hover:opacity-90
                        rounded-xl
                        w-12
                        h-12
                        transition
                        flex
                        items-center
                        justify-center
                        disabled:opacity-50
                    "
                >

                    <SendHorizonal size={22} />

                </button>

            </div>

        </GlassCard>
    );
}

export default CopilotSection;