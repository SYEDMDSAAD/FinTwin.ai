import {
    useEffect,
    useRef,
    useState
} from "react";

import { useTheme } from "../context/ThemeContext";
import useAiStatus from "../hooks/useAiStatus";

import {
    Sparkles,
    ArrowUp,
    Trash2,
    ChevronDown,
    Check,
    CloudOff
} from "lucide-react";

import SafeMarkdown from "./SafeMarkdown";
import { AI_MODE_IDS } from "../constants/aiModes";
import AnswerRating from "./AnswerRating";

function CopilotSection({

    chatMessage,
    setChatMessage,
    sendMessage,
    messages,
    aiLoading,

    selectedMode,
    setSelectedMode,

    clearChat,
    deleteExchange

}) {

    const { isDark } = useTheme();

    // =====================================
    // Mode picker (dropdown inside the composer, Claude-style)
    // =====================================

    const [modeMenuOpen, setModeMenuOpen] = useState(false);
    const modeMenuRef = useRef(null);

    useEffect(() => {

        if (!modeMenuOpen) return;

        const handleClickOutside = (e) => {
            if (
                modeMenuRef.current
                &&
                !modeMenuRef.current.contains(e.target)
            ) {
                setModeMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);

        return () =>
            document.removeEventListener("mousedown", handleClickOutside);

    }, [modeMenuOpen]);

    const modes = AI_MODE_IDS;

    // =====================================
    // Suggested Prompts (empty state only)
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

            if (canSend) sendMessage();
        }
    };

    // =====================================
    // THEME TOKENS
    // =====================================

    const subtleText  = "text-ink-3";
    const bodyText    = "text-ink";
    const userBubble  = "bg-accent-soft";
    const composerBg  = "bg-surface border-line shadow-[0_4px_20px_rgba(17,17,26,0.06)] focus-within:border-accent";
    const chipStyle   = "border-line bg-surface text-ink hover:border-accent";
    const proseTheme  = `${isDark ? "prose-invert" : ""}
           prose-p:text-ink
           prose-headings:text-ink
           prose-strong:text-ink
           prose-li:text-ink`;

    const aiOnline = useAiStatus();

    const canSend = aiOnline && !aiLoading && chatMessage.trim().length > 0;

    // =====================================
    // AI AVATAR (small sparkle disc)
    // =====================================

    const AiAvatar = () => (
        <div
            className="
                w-7 h-7
                shrink-0
                rounded-full
                flex items-center justify-center
                bg-accent-soft
                text-accent
                mt-0.5
            "
        >
            <Sparkles size={14} aria-hidden />
        </div>
    );

    return (

        <div
            className={`
                copilot-shell
                fixed
                inset-x-0
                top-0
                z-[55]
                md:relative
                md:inset-auto
                md:z-auto
                overflow-hidden
                flex
                flex-col
                md:pt-3
                w-full
                md:w-auto
                md:h-screen
                md:-my-6
                md:-mx-6
                xl:-my-10
                xl:-mx-10
                md:border
                bg-surface border-line
            `}
        >

            {/* =====================================
                SLIM HEADER
            ===================================== */}

            <div
                className={`
                    flex
                    items-center
                    justify-between
                    px-4
                    md:px-5
                    py-3
                    md:py-3.5
                    border-b
                    border-line
                `}
            >

                <div className="flex items-center gap-3">

                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-accent-soft text-accent">
                        <Sparkles size={18} aria-hidden />
                    </div>

                    <div>
                        <h2 className="text-title text-ink leading-tight">Copilot</h2>
                        <p className="text-small text-ink-3">{selectedMode}</p>
                    </div>

                </div>

                <div className="flex items-center gap-2.5">

                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            title="Delete the entire chat history"
                            aria-label="Clear chat"
                            className="flex items-center gap-1.5 h-9 px-2.5 md:px-3.5 rounded-full text-small font-semibold text-bad hover:bg-bad-soft transition-colors"
                        >
                            <Trash2 size={16} aria-hidden />
                            <span className="hidden sm:inline">Clear chat</span>
                        </button>
                    )}

                </div>

            </div>

            {/* =====================================
                MESSAGES
            ===================================== */}

            <div className="flex-1 min-h-0 overflow-y-auto">

                <div className="w-full px-4 py-5 md:px-6 md:py-6 flex flex-col gap-5 md:gap-6">

                    {/* ── Empty state: centered greeting + prompt chips ── */}

                    {messages.length === 0 && !aiLoading && (

                        <div className="flex flex-col items-center justify-center text-center pt-[6vh]">

                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-accent-soft text-accent mb-4">
                                <Sparkles size={22} aria-hidden />
                            </div>

                            <h3 className="text-title text-ink mb-1">
                                How can I help with your finances?
                            </h3>

                            <p className="text-body text-ink-3 mb-6">
                                Ask about spending, goals, budgets or anything money.
                            </p>

                            <div className="flex flex-wrap justify-center gap-2 w-full max-w-xl">
                                {prompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => setChatMessage(prompt)}
                                        className={`h-10 px-4 rounded-full border text-small font-medium transition-colors ${chipStyle}`}
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>

                        </div>

                    )}

                    {/* ── Storage warning ── */}

                    {messages.length >= 80 && (
                        <div className="
                            flex items-start gap-3
                            px-4 py-3
                            rounded-xl
                            bg-warn-soft
                            text-ink
                        ">
                            <span className="text-base leading-none mt-0.5">⚠</span>
                            <p className="text-xs leading-relaxed">
                                You have <span className="font-bold">{Math.floor(messages.length / 2)} / 50</span> saved exchanges.
                                Once you hit 50, the oldest messages will be automatically removed as new ones come in.
                            </p>
                        </div>
                    )}

                    {/* ── Conversation ── */}

                    {messages.map((msg, index) => (

                        msg.role === "user"

                        ? (

                            /* USER — compact right-aligned bubble, delete on hover */

                            <div
                                key={
                                    msg.exchangeId
                                        ? `${msg.exchangeId}-user`
                                        : `i-${index}`
                                }
                                className="group flex items-center justify-end gap-2"
                            >

                                {msg.exchangeId && deleteExchange && (
                                    <button
                                        onClick={() => deleteExchange(msg.exchangeId)}
                                        title="Delete this message and its reply"
                                        className={`
                                            opacity-0
                                            group-hover:opacity-100
                                            transition-opacity
                                            duration-150
                                            p-1.5
                                            rounded-md
                                            ${subtleText}
                                            hover:text-red-400
                                        `}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                )}

                                <div
                                    className={`
                                        max-w-[80%]
                                        px-4 py-2.5
                                        rounded-2xl
                                        rounded-br-md
                                        text-sm
                                        leading-relaxed
                                        whitespace-pre-wrap
                                        break-words
                                        ${userBubble}
                                        ${bodyText}
                                    `}
                                >
                                    {msg.content}
                                </div>

                            </div>

                        )

                        : (

                            /* ASSISTANT — avatar + plain markdown, no box */

                            <div
                                key={
                                    msg.exchangeId
                                        ? `${msg.exchangeId}-assistant`
                                        : `i-${index}`
                                }
                            >

                                <div className="flow-root">

                                    <div className="float-left mr-3">
                                        <AiAvatar />
                                    </div>

                                    <div
                                        className={`
                                            prose
                                            prose-sm
                                            max-w-none
                                            break-words
                                            ${proseTheme}
                                        `}
                                    >
                                        <SafeMarkdown>
                                            {msg.content}
                                        </SafeMarkdown>
                                    </div>

                                </div>

                                {msg.exchangeId && (
                                    <AnswerRating
                                        key={msg.exchangeId}
                                        exchangeId={msg.exchangeId}
                                        initial={msg.rating ?? null}
                                    />
                                )}

                                {/* End-of-exchange divider — short centered
                                    dotted line so exchanges are easy to tell
                                    apart. Skipped after the newest message. */}
                                {index < messages.length - 1 && (
                                    <div
                                        className={`
                                            w-24
                                            mx-auto
                                            mt-7
                                            border-t-2
                                            border-dotted
                                            border-line
                                        `}
                                    />
                                )}

                            </div>

                        )

                    ))}

                    {/* ── Thinking indicator ── */}

                    {aiLoading && (

                        <div className="flex items-start gap-3">

                            <style>{`
                                @keyframes copilot-shimmer {
                                    0%   { background-position: 200% 0; }
                                    100% { background-position: -200% 0; }
                                }
                                @keyframes copilot-glow {
                                    0%, 100% { opacity: 0.35; transform: scale(1); }
                                    50%      { opacity: 0.9;  transform: scale(1.25); }
                                }
                                .copilot-thinking-text {
                                    background: linear-gradient(
                                        90deg,
                                        var(--text-dim) 0%,
                                        var(--accent) 50%,
                                        var(--text-dim) 100%
                                    );
                                    background-size: 200% 100%;
                                    -webkit-background-clip: text;
                                    background-clip: text;
                                    color: transparent;
                                    animation: copilot-shimmer 2s linear infinite;
                                }
                                .copilot-skel {
                                    height: 10px;
                                    border-radius: 6px;
                                    background: linear-gradient(
                                        90deg,
                                        var(--bg-input) 25%,
                                        var(--border-card-hover) 50%,
                                        var(--bg-input) 75%
                                    );
                                    background-size: 200% 100%;
                                    animation: copilot-shimmer 1.6s ease-in-out infinite;
                                }
                                .copilot-glow-ring {
                                    animation: copilot-glow 1.8s ease-in-out infinite;
                                }
                            `}</style>

                            <div className="relative shrink-0">
                                <div className="copilot-glow-ring absolute inset-0 rounded-full bg-accent-soft blur-sm" />
                                <AiAvatar />
                            </div>

                            <div className="flex-1 min-w-0 pt-0.5">

                                <div className="copilot-thinking-text text-[13px] font-bold tracking-wide mb-3">
                                    Analyzing your finances…
                                </div>

                                <div className="flex flex-col gap-2.5 max-w-md">
                                    <div className="copilot-skel w-[92%]" />
                                    <div className="copilot-skel w-[74%]" />
                                    <div className="copilot-skel w-[56%]" />
                                </div>

                            </div>

                        </div>

                    )}

                    <div ref={messagesEndRef} />

                </div>

            </div>

            {/* =====================================
                COMPOSER (Claude-style: textarea + mode
                picker chip + send button in one card)
            ===================================== */}

            <div className="px-3 pb-3 pt-2 md:px-5 md:pb-5">

                {!aiOnline && (
                    <div
                        role="status"
                        className={`
                            mb-3
                            flex items-start gap-3
                            rounded-2xl
                            border
                            px-4 py-3
                            text-[13px]
                            leading-relaxed
                            bg-warn-soft border-transparent text-ink
                        `}
                    >
                        <CloudOff size={17} aria-hidden className="shrink-0 mt-0.5 text-warn" />
                        <div>
                            <div className="font-semibold">FinTwin AI is offline right now</div>
                            <div className="text-ink-2">
                                The copilot can't answer until it's back. Everything else works:
                                your transactions, budgets, goals and analytics are up to date,
                                and the coach and reports show calculated figures meanwhile.
                            </div>
                        </div>
                    </div>
                )}

                <div
                    className={`
                        w-full
                        rounded-3xl
                        border
                        transition-all
                        duration-200
                        ${composerBg}
                    `}
                >

                    <textarea
                        placeholder={aiOnline
                            ? "Ask about your money…"
                            : "Copilot is offline. Try again later."}
                        disabled={!aiOnline}
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={2}
                        className={`
                            w-full
                            bg-transparent
                            px-5
                            pt-4
                            pb-1
                            outline-none
                            text-[15px]
                            resize-none
                            leading-relaxed
                            ${bodyText}
                            ${isDark
                                ? "placeholder:text-ink-3"
                                : "placeholder:text-ink-3"}
                        `}
                    />

                    <div className="flex items-center justify-between px-2.5 pb-2.5">

                        {/* Mode picker — opens upward */}

                        <div ref={modeMenuRef} className="relative">

                            <button
                                onClick={() => setModeMenuOpen(o => !o)}
                                className={`
                                    flex items-center gap-1.5
                                    px-2.5 py-1.5
                                    rounded-lg
                                    text-xs
                                    font-medium
                                    transition-colors
                                    ${subtleText}
                                    hover:bg-surface-sunken
                                `}
                            >
                                {selectedMode}
                                <ChevronDown
                                    size={13}
                                    className={`
                                        transition-transform
                                        duration-200
                                        ${modeMenuOpen ? "rotate-180" : ""}
                                    `}
                                />
                            </button>

                            {modeMenuOpen && (
                                <div
                                    className={`
                                        absolute
                                        bottom-full
                                        left-0
                                        mb-2
                                        w-52
                                        rounded-xl
                                        border
                                        shadow-xl
                                        overflow-hidden
                                        z-20
                                        bg-surface border-line
                                    `}
                                >
                                    {modes.map((mode) => (
                                        <button
                                            key={mode}
                                            onClick={() => {
                                                setSelectedMode(mode);
                                                setModeMenuOpen(false);
                                            }}
                                            className={`
                                                w-full
                                                flex items-center justify-between
                                                px-3.5 py-2.5
                                                text-small
                                                font-medium
                                                text-left
                                                transition-colors
                                                hover:bg-surface-sunken
                                                ${selectedMode === mode ? "text-accent" : "text-ink"}
                                            `}
                                        >
                                            {mode}
                                            {selectedMode === mode && (
                                                <Check size={13} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                        </div>

                        {/* Send */}

                        <button
                            onClick={sendMessage}
                            disabled={!canSend}
                            title="Send"
                            className={`
                                w-9 h-9
                                rounded-full
                                flex items-center justify-center
                                transition-all
                                duration-150
                                ${canSend
                                    ? "bg-accent-strong text-white"
                                    : "bg-surface-sunken text-ink-3"}
                            `}
                        >
                            <ArrowUp size={17} />
                        </button>

                    </div>

                </div>

                <p
                    data-testid="copilot-ai-notice"
                    className="mt-2 text-center text-caption text-ink-3"
                >
                    FinTwin AI answers money questions from your data and can make mistakes.
                    It is guidance, not SEBI-registered investment advice.
                </p>

            </div>

        </div>
    );
}

export default CopilotSection;
