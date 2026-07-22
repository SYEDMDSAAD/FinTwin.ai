import {
    useEffect,
    useRef,
    useState
} from "react";

import { useTheme } from "../context/ThemeContext";

import {
    Sparkles,
    ArrowUp,
    Trash2,
    ChevronDown,
    Check
} from "lucide-react";

import ReactMarkdown from "react-markdown";
import { AI_MODE_IDS } from "../constants/aiModes";

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

            sendMessage();
        }
    };

    // =====================================
    // THEME TOKENS
    // =====================================

    const subtleText  = isDark ? "text-zinc-500"   : "text-gray-400";
    const bodyText    = isDark ? "text-zinc-200"   : "text-gray-800";
    const userBubble  = isDark
        ? "bg-purple-500/[0.16] border border-purple-500/25"
        : "bg-white border border-purple-200/70 shadow-[0_2px_10px_rgba(109,40,217,0.07)]";
    const composerBg  = isDark
        ? "bg-[#15171e] border-white/[0.09] shadow-[0_8px_30px_rgba(0,0,0,0.35)] focus-within:border-purple-500/40"
        : "bg-white border-gray-200 shadow-[0_8px_30px_rgba(15,23,42,0.08)] focus-within:border-purple-400/70 focus-within:shadow-[0_8px_30px_rgba(109,40,217,0.12)]";
    const chipStyle   = isDark
        ? "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.07] hover:border-purple-500/30"
        : "border-gray-200 bg-white text-gray-600 shadow-sm hover:border-purple-300 hover:text-purple-700";
    const proseTheme  = isDark
        ? `prose-invert
           prose-p:text-zinc-200
           prose-headings:text-white
           prose-strong:text-purple-300
           prose-li:text-zinc-300`
        : `prose-p:text-gray-800
           prose-headings:text-gray-900
           prose-strong:text-purple-700
           prose-li:text-gray-700`;

    const canSend = !aiLoading && chatMessage.trim().length > 0;

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
                bg-gradient-to-br
                from-purple-500
                to-violet-600
                shadow-md
                mt-0.5
            "
        >
            <Sparkles size={14} color="#fff" />
        </div>
    );

    return (

        <div
            className={`
                relative
                overflow-hidden
                flex
                flex-col
                pt-3
                h-[calc(100vh-6rem)]
                w-full
                md:w-auto
                md:h-screen
                md:-my-6
                md:-mx-6
                xl:-my-10
                xl:-mx-10
                rounded-2xl
                md:rounded-none
                border
                ${isDark
                    ? "bg-[#0d0f14] border-white/[0.07]"
                    : "bg-[#fbfaf9] border-gray-200 shadow-[0_2px_16px_rgba(15,23,42,0.05)]"}
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
                    px-5
                    py-3.5
                    border-b
                    ${isDark
                        ? "border-purple-500/15 bg-purple-500/[0.05]"
                        : "border-purple-200/60 bg-purple-50/50"}
                `}
            >

                <div className="flex items-center gap-3">

                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                            background: "linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))",
                            border: "1px solid rgba(167,139,250,0.3)",
                        }}
                    >
                        <Sparkles size={18} color="#a78bfa" />
                    </div>

                    <div>
                        <div
                            className={`
                                text-[10px]
                                font-bold
                                tracking-[0.1em]
                                ${isDark ? "text-slate-400/60" : "text-gray-500/80"}
                            `}
                        >
                            AI SUITE
                        </div>
                        <h2 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
                            Financial Copilot
                        </h2>
                    </div>

                </div>

                <div className="flex items-center gap-2.5">

                    <span
                        className={`
                            hidden sm:block
                            text-[10px]
                            font-mono
                            ${isDark ? "text-slate-500/60" : "text-gray-400"}
                        `}
                    >
                        {selectedMode}
                    </span>

                    {messages.length > 0 && (
                        <button
                            onClick={clearChat}
                            title="Delete the entire chat history"
                            className={`
                                flex items-center gap-2
                                px-[18px] py-[9px]
                                rounded-[10px]
                                border
                                text-xs
                                font-bold
                                transition-colors
                                ${isDark
                                    ? "border-red-500/25 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                                    : "border-red-300 bg-red-50 text-red-500 hover:bg-red-100"}
                            `}
                        >
                            <Trash2 size={13} />
                            Delete full chat
                        </button>
                    )}

                </div>

            </div>

            {/* =====================================
                MESSAGES
            ===================================== */}

            <div className="flex-1 min-h-0 overflow-y-auto">

                <div className="w-full px-6 py-6 flex flex-col gap-6">

                    {/* ── Empty state: centered greeting + prompt chips ── */}

                    {messages.length === 0 && !aiLoading && (

                        <div className="flex flex-col items-center justify-center text-center pt-[14vh]">

                            <div
                                className="
                                    w-12 h-12
                                    rounded-2xl
                                    flex items-center justify-center
                                    bg-gradient-to-br
                                    from-purple-500
                                    to-violet-600
                                    shadow-lg
                                    mb-5
                                "
                            >
                                <Sparkles size={22} color="#fff" />
                            </div>

                            <h3 className="text-xl font-semibold mb-1.5">
                                How can I help with your finances?
                            </h3>

                            <p className={`text-sm mb-8 ${subtleText}`}>
                                Ask about spending, goals, budgets or anything money.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-xl">
                                {prompts.map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => setChatMessage(prompt)}
                                        className={`
                                            px-4 py-3
                                            rounded-xl
                                            border
                                            text-[13px]
                                            text-left
                                            font-medium
                                            transition-colors
                                            duration-150
                                            ${chipStyle}
                                        `}
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
                            border border-amber-500/25
                            bg-amber-500/10
                            text-amber-500
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
                                        <ReactMarkdown>
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>

                                </div>

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
                                            ${isDark
                                                ? "border-white/[0.14]"
                                                : "border-gray-300"}
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
                                        #a78bfa 0%,
                                        #e879f9 25%,
                                        #22d3ee 50%,
                                        #e879f9 75%,
                                        #a78bfa 100%
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
                                        rgba(167,139,250,0.10) 25%,
                                        rgba(167,139,250,0.30) 50%,
                                        rgba(167,139,250,0.10) 75%
                                    );
                                    background-size: 200% 100%;
                                    animation: copilot-shimmer 1.6s ease-in-out infinite;
                                }
                                .copilot-glow-ring {
                                    animation: copilot-glow 1.8s ease-in-out infinite;
                                }
                            `}</style>

                            <div className="relative shrink-0">
                                <div className="copilot-glow-ring absolute inset-0 rounded-full bg-purple-500 blur-md" />
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

            <div className="px-5 pb-5 pt-2">

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
                        placeholder="Ask FinTwin AI anything about your money..."
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
                                ? "placeholder:text-zinc-600"
                                : "placeholder:text-gray-400"}
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
                                    ${isDark ? "hover:bg-white/[0.06]" : "hover:bg-gray-100"}
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
                                        ${isDark
                                            ? "bg-zinc-900 border-white/10"
                                            : "bg-white border-gray-200"}
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
                                                text-xs
                                                font-medium
                                                text-left
                                                transition-colors
                                                ${isDark
                                                    ? "hover:bg-white/[0.06]"
                                                    : "hover:bg-gray-50"}
                                                ${selectedMode === mode
                                                    ? "text-purple-400"
                                                    : (isDark ? "text-zinc-300" : "text-gray-700")}
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
                                    ? "bg-gradient-to-br from-purple-500 to-violet-600 text-white shadow-[0_4px_14px_rgba(139,92,246,0.4)] hover:scale-105"
                                    : (isDark
                                        ? "bg-white/[0.06] text-zinc-600"
                                        : "bg-gray-200/80 text-gray-400")}
                            `}
                        >
                            <ArrowUp size={17} />
                        </button>

                    </div>

                </div>

            </div>

        </div>
    );
}

export default CopilotSection;
