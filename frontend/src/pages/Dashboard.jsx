import { useEffect, useState, useTransition, useCallback, useRef } from "react";
import { Brain, Sparkles } from "lucide-react";
import SplashScreen from "../components/SplashScreen";

import API from "../services/api";

import { useTheme } from "../context/ThemeContext";

import { useCurrency } from "../context/CurrencyContext";

import toast from "react-hot-toast";

import SettingsPage from "../components/SettingsPage";
import HelpWidget from "../components/HelpWidget";

// =========================
// Components
// =========================

import Sidebar from "../components/Sidebar";

import Header from "../components/Header";


import AnalyticsCards from "../components/AnalyticsCards";


import OCRSection from "../components/OCRSection";

import CopilotSection from "../components/CopilotSection";

import AffordabilitySection from "../components/AffordabilitySection";

import BankConnectionSection from "../components/BankConnectionSection";

import SkeletonCard from "../components/SkeletonCard";

import TransactionSkeleton from "../components/TransactionSkeleton";

import QuickEntryDropdown from "../components/QuickEntryDropdown";

import MonthlySummaryCard from "../components/MonthlySummaryCard";

import BudgetSection from "../components/BudgetSection";

import FinancialScoreCard
from "../components/FinancialScoreCard";

import AnomalyAlerts
from "../components/AnomalyAlerts";

import SmartNotifications
from "../components/SmartNotifications";

import ForecastCard
from "../components/ForecastCard";

import CategoryForecastCard
from "../components/CategoryForecastCard";

import FinancialGoalsSection
from "../components/FinancialGoalsSection";

import WeeklyReport
from "../components/WeeklyReport";

import DashboardHero
from "../components/DashboardHero";

import NetWorthSection
from "../components/NetWorthSection";

import NetWorthManagement
from "./NetWorthManagement";

import InvestmentsPage
from "./InvestmentsPage";

import SpendingCoachPage
from "./SpendingCoachPage";

import BottomNav from "../components/BottomNav";
import CreditScoreCard from "../components/CreditScoreCard";
import EnhancedTransactionsTable from "../components/EnhancedTransactionsTable";
import SortOther from "../components/SortOther";
import InsurancePage from "./InsurancePage";
import ImportsPage from "./ImportsPage";
import AnalyticsPage from "./AnalyticsPage";
import ServicesPage from "./ServicesPage";
import AboutPage from "./AboutPage";

function Dashboard() {

    useTheme();
    useCurrency();

    // =========================
    // State
    // =========================

    const [transactions, setTransactions] =
        useState([]);

    const [insights, setInsights] =
        useState([]);

    const [monthlySummary,
        setMonthlySummary] =
        useState(null);

    const [recurringExpenses,
        setRecurringExpenses] =
        useState([]);

    const [budgets,
        setBudgets] =
        useState([]);

    const [scoreData,
        setScoreData] =
        useState(null);

    const [anomalies,
        setAnomalies] =
        useState([]);

    const [notifications,
        setNotifications] =
        useState([]);

    const [forecast,
        setForecast] =
        useState(null);

    const [expenseText,
        setExpenseText] =
        useState("");

    const [incomeText,
        setIncomeText] =
        useState("");

    const [activeSection,
        setActiveSection] =
        useState(() => {
            const saved = localStorage.getItem("activeSection");
            // Discover moved into Investments; Today became About App
            if (saved === "Discover") return "Investments";
            if (!saved || saved === "Today") return "About App";
            return saved;
        });

    const [, startTransition] = useTransition();
    const navigateTo = useCallback((section) => {
        localStorage.setItem("activeSection", section);
        startTransition(() => setActiveSection(section));
    }, []);

    // Allow child components (NetWorthPage, PortfolioTab) to trigger section navigation
    useEffect(() => {
        const handler = () => {
            const section = localStorage.getItem("activeSection");
            if (section) startTransition(() => setActiveSection(section));
        };
        window.addEventListener("dashboardNav", handler);
        return () => window.removeEventListener("dashboardNav", handler);
    }, []);

    const [selectedFile,
        setSelectedFile] =
        useState(null);

    const [chatMessage,
        setChatMessage] =
        useState("");

    const [messages, setMessages] =
        useState([]);

    const [selectedMode, setSelectedMode] =
        useState("Savings Advisor");

    const [aiLoading, setAiLoading] =
        useState(false);    

    const [price,
        setPrice] =
        useState("");

    const [affordability,
        setAffordability] =
        useState(null);

    const [loading,
        setLoading] =
        useState(true);

    // Splash screen — show once per browser session
    const [showSplash, setShowSplash] = useState(
        () => !sessionStorage.getItem("splashShown")
    );
    const [dataReady, setDataReady] = useState(false);
    const criticalCount = useRef(0);
    const markCriticalDone = useCallback(() => {
        criticalCount.current += 1;
        if (criticalCount.current >= 2) setDataReady(true);
    }, []);

    const [goals, setGoals] =
        useState([]);

    const [monthlyHistory,
        setMonthlyHistory] =
        useState([]);  
        
    const [
        categoryForecast,
        setCategoryForecast
    ] = useState([]);
    
    const [netWorth, setNetWorth] =
        useState(null);

    const [assets, setAssets] =
        useState([]);

    const [liabilities, setLiabilities] =
        useState([]); 
        
    // =========================
    // Initial Load
    // =========================

    // ── Aggregated load-error reporting ──────────────────────────────────
    // refreshDashboard fires ~15 fetches in parallel; when the backend is
    // unreachable, each used to raise its own toast — a 15-toast storm.
    // Failures within a short window are collected: many failures produce
    // one summary toast, isolated failures keep their specific message.
    // Stable toast ids also stop the 30s notification poll from stacking
    // an endless column of identical toasts during an outage.
    const loadErrors = useRef(new Set());
    const loadErrorTimer = useRef(null);
    const reportLoadError = (section) => {
        loadErrors.current.add(section);
        clearTimeout(loadErrorTimer.current);
        loadErrorTimer.current = setTimeout(() => {
            const failed = [...loadErrors.current];
            loadErrors.current = new Set();
            if (failed.length >= 3) {
                toast.error(
                    `Couldn't load ${failed.length} dashboard sections. Check your connection and refresh.`,
                    { id: "dashboard-load-errors" }
                );
            } else {
                failed.forEach((name) =>
                    toast.error(`Failed to load ${name}.`, { id: `load-${name}` })
                );
            }
        }, 800);
    };

    useEffect(() => {

        API.get("/transactions/chat/history")
            .then(res => {
                if (res.data?.length > 0) setMessages(res.data);
            })
            .catch(() => {});

        // Splash: mark session on first visit; skip gate if splash already shown
        if (!sessionStorage.getItem("splashShown")) {
            sessionStorage.setItem("splashShown", "true");
        } else {
            setDataReady(true);
        }

        refreshDashboard();

        const interval = setInterval(() => {

            fetchNotifications();

        }, 30000);

        return () =>
            clearInterval(interval);

    }, []);

    // =========================
    // Fetch Transactions
    // =========================

    // How far back the Transactions page asks for. The dashboard's own figures
    // are monthly, so 3 months is the default; the whole history is a click away.
    const [txMonths, setTxMonths] = useState(
        () => Number(localStorage.getItem("txMonths")) || 3);
    useEffect(() => { localStorage.setItem("txMonths", String(txMonths)); }, [txMonths]);

    const fetchTransactions = async (months = txMonths) => {

        try {

            setLoading(true);

            const response =
                await API.get("/transactions", { params: { months } });

            setTransactions(response.data);

        } catch {

            reportLoadError("transactions");

        } finally {

            setLoading(false);
            markCriticalDone();
        }
    };

    // Refresh without the loading skeleton — for background changes (the
    // categoriser re-sorting old rows) that shouldn't blank the table
    const refreshTransactionsQuietly = async () => {
        try {
            const response = await API.get("/transactions", { params: { months: txMonths } });
            setTransactions(response.data);
        } catch {
            // the visible data is still valid; next full load will catch up
        }
    };

    // =========================
    // Category change — patch state in place (mirrors the backend's update)
    // instead of refetching, so the table doesn't flash a loading skeleton.
    // =========================

    const normMerchant = (m) =>
        (m || "").toLowerCase().trim().replace(/\s+/g, " ");

    const handleCategoryChanged = ({ id, category, applyToSimilar, merchant }) => {
        const pattern = normMerchant(merchant);
        setTransactions(prev => prev.map(t => {
            if (t.id === id) return { ...t, category };
            if (applyToSimilar && normMerchant(t.merchant) === pattern)
                return { ...t, category };
            return t;
        }));
    };

    // =========================
    // Fetch Insights
    // =========================

    const fetchInsights = async () => {

        try {

            const response =
                await API.get("/insights");

            setInsights(response.data);

        } catch {



            reportLoadError("insights");
        }
    };

    // =========================
    // Fetch Monthly Summary
    // =========================

    const fetchMonthlySummary =
        async () => {

            try {

                const response =
                    await API.get(
                        "/analytics/monthly-summary"
                    );

                setMonthlySummary(
                    response.data
                );

            } catch {

    

                reportLoadError("monthly summary");
            }
        };

    // =========================
    // Fetch Recurring Expenses
    // =========================

    const fetchRecurringExpenses =
        async () => {

            try {

                const response =
                    await API.get(
                        "/analytics/recurring-expenses"
                    );

                setRecurringExpenses(
                    response.data
                );

            } catch {

    

                reportLoadError("recurring expenses");
            }
        };

    // =========================
    // Fetch Budgets
    // =========================

    const fetchBudgets =
        async () => {

            try {

                const response =
                    await API.get(
                        "/budgets/status"
                    );

                setBudgets(
                    response.data
                );

            } catch {

    

                reportLoadError("budgets");
            }
        };

    // =========================
    // Fetch Financial Score
    // =========================

    const fetchFinancialScore =
        async () => {

            try {

                const response =
                    await API.get(
                        "/financial-score"
                    );

                setScoreData(
                    response.data
                );

            } catch {

                reportLoadError("financial score");

            } finally {
                markCriticalDone();
            }
        };

    // =========================
    // Fetch Anomalies
    // =========================

    const fetchAnomalies =
        async () => {

            try {

                const response =
                    await API.get(
                        "/anomalies"
                    );

                setAnomalies(
                    response.data
                );

            } catch {

    

                reportLoadError("anomalies");
            }
        };

    // =========================
    // Fetch Notifications
    // =========================

    const fetchNotifications = async () => {

        try {

            const response =
                await API.get(
                    "/notifications"
                );

            setNotifications(
                response.data
            );

        } catch {


        }
    };

    // =========================
    // Fetch Forecast
    // =========================

    const fetchForecast =
        async () => {

            try {

                const response =
                    await API.get(
                        "/forecast"
                    );

                setForecast(
                    response.data
                );

            } catch {

    

                reportLoadError("forecast");
            }
        };

    // =========================
    // Fetch Monthly History
    // =========================

    const fetchMonthlyHistory =
        async () => {

            try {

                const response =
                    await API.get(
                        "/forecast/monthly-history"
                    );

                setMonthlyHistory(
                    response.data
                );

            } catch {

    
            }
        };

    // =========================
    // Fetch Category Forecast
    // =========================    
        
    const fetchCategoryForecast =
        async () => {

            try {

                const response =
                    await API.get(
                        "/forecast/category"
                    );

                setCategoryForecast(
                    response.data
                );

            } catch {

    

                reportLoadError("category forecast");
            }
        };
        
    // =========================
    // Fetch Net Worth, Assets, Liabilities
    // =========================    

    const fetchNetWorth = async () => {

        try {

            const response =
                await API.get(
                    "/net-worth"
                );

            setNetWorth(
                response.data
            );

        } catch {


        }
    };

    const fetchAssets = async () => {

        try {

            const response =
                await API.get(
                    "/assets"
                );

            setAssets(
                response.data
            );

        } catch {


        }
    };

    const fetchLiabilities = async () => {

        try {

            const response =
                await API.get(
                    "/liabilities"
                );

            setLiabilities(
                response.data
            );

        } catch {


        }
    };

    // =========================
    // Create Asset
    // =========================
    
    const createAsset = async (

        asset

    ) => {

        try {

            await API.post(
                "/assets",
                asset
            );

            toast.success(
                "Asset Added!"
            );

            fetchAssets();

            fetchNetWorth();

        } catch {



            toast.error(
                "Failed to add asset."
            );
        }
    };

    // =========================
    // Create Liability
    // =========================

    const createLiability = async (

        liability

    ) => {

        try {

            await API.post(
                "/liabilities",
                liability
            );

            toast.success(
                "Liability Added!"
            );

            fetchLiabilities();

            fetchNetWorth();

        } catch {



            toast.error(
                "Failed to add liability."
            );
        }
    };

    // =========================
    // Update Asset
    // =========================

    const updateAsset = async (id, asset) => {

        try {

            await API.put(
                `/assets/${id}`,
                asset
            );

            toast.success(
                "Asset updated!"
            );

            fetchAssets();
            fetchNetWorth();

        } catch {



            toast.error(
                "Failed to update asset."
            );
        }
    };

    // =========================
    // Delete Asset
    // =========================

    const deleteAsset = async (id) => {

        try {

            await API.delete(
                `/assets/${id}`
            );

            toast.success(
                "Asset deleted!"
            );

            fetchAssets();
            fetchNetWorth();

        } catch {



            toast.error(
                "Failed to delete asset."
            );
        }
    };

    // =========================
    // Update Liability
    // =========================

    const updateLiability = async (id, liability) => {

        try {

            await API.put(
                `/liabilities/${id}`,
                liability
            );

            toast.success(
                "Liability updated!"
            );

            fetchLiabilities();
            fetchNetWorth();

        } catch {



            toast.error(
                "Failed to update liability."
            );
        }
    };

    // =========================
    // Delete Liability
    // =========================

    const deleteLiability = async (id) => {

        try {

            await API.delete(
                `/liabilities/${id}`
            );

            toast.success(
                "Liability deleted!"
            );

            fetchLiabilities();
            fetchNetWorth();

        } catch {



            toast.error(
                "Failed to delete liability."
            );
        }
    };

    // =========================
    // Create Budget
    // =========================

    const createBudget =
        async (budget) => {

            try {

                await API.post(
                    "/budgets",
                    budget
                );

                await fetchBudgets();

                await fetchFinancialScore();

                await fetchNotifications();

                await fetchForecast();

                toast.success(
                    "Budget created!"
                );

            } catch {

    

                toast.error(
                    "Failed to create budget."
                );
            }
        };

    // =========================
    // UPDATE BUDGET (limit only)
    // =========================

    const updateBudget =
        async (id, limitAmount) => {

            try {

                await API.put(
                    `/budgets/${id}`,
                    { limitAmount }
                );

                await fetchBudgets();

                await fetchFinancialScore();

                await fetchNotifications();

                toast.success(
                    "Budget limit updated!"
                );

            } catch {

                toast.error(
                    "Failed to update budget."
                );

                throw new Error("update failed");
            }
        };

    // =========================
    // DELETE BUDGET
    // =========================

    const deleteBudget = (id, category) => {

        toast((t) => (

            <div className="
                flex
                flex-col
                gap-4
                min-w-[280px]
            ">

                <p className="
                    text-white
                    font-medium
                ">
                    Delete budget for
                    <span className="
                        text-red-400
                        ml-1
                    ">
                        {category}
                    </span>
                    ?
                </p>

                <div className="
                    flex
                    gap-2
                    justify-end
                ">

                    <button

                        onClick={() => {

                            toast.dismiss(t.id);

                        }}

                        className="
                            px-4
                            py-2
                            rounded-xl
                            bg-zinc-700
                            hover:bg-zinc-600
                        "
                    >
                        Cancel
                    </button>

                    <button

                        onClick={async () => {

                            try {

                                await API.delete(
                                    `/budgets/${id}`
                                );

                                toast.dismiss(
                                    t.id
                                );

                                toast.success(
                                    "Budget deleted"
                                );

                                fetchBudgets();

                                fetchNotifications();

                                fetchFinancialScore();

                            } catch {

                                toast.error(
                                    "Delete failed"
                                );
                            }
                        }}

                        className="
                            px-4
                            py-2
                            rounded-xl
                            bg-red-500
                            hover:bg-red-600
                        "
                    >
                        Delete
                    </button>

                </div>

            </div>

        ));
    };    

    // =========================
    // Refresh Dashboard
    // =========================

    const refreshDashboard =
        async () => {

            fetchTransactions();

            fetchInsights();

            fetchMonthlySummary();

            fetchRecurringExpenses();

            fetchBudgets();

            fetchFinancialScore();

            fetchAnomalies();

            fetchNotifications();

            fetchForecast();

            fetchGoals();

            fetchMonthlyHistory();

            fetchCategoryForecast();

            fetchNetWorth();

            fetchAssets();

            fetchLiabilities();
        };

    // =========================
    // Add Expense
    // =========================

    const addExpense = async () => {

        if (!expenseText.trim()) {

            toast.error(
                "Please enter expense."
            );

            return;
        }

        try {

            await API.post(
                "/transactions/expense",
                {
                    text: expenseText
                }
            );

            toast.success(
                "Expense added successfully!"
            );

            setExpenseText("");

            refreshDashboard();

        } catch {



            toast.error(
                "Failed to add expense."
            );
        }
    };

    // =========================
    // Add Income
    // =========================

    const addIncome = async () => {

        if (!incomeText.trim()) {

            toast.error(
                "Please enter income."
            );

            return;
        }

        try {

            await API.post(
                "/transactions/income",
                {
                    text: incomeText
                }
            );

            toast.success(
                "Income added successfully!"
            );

            setIncomeText("");

            refreshDashboard();

        } catch {



            toast.error(
                "Failed to add income."
            );
        }
    };

    // =========================
    // Upload Screenshot
    // =========================

    const uploadScreenshot = async () => {

        if (!selectedFile) {

            toast.error(
                "Please select a screenshot."
            );

            return;
        }

        try {

            const formData =
                new FormData();

            formData.append(
                "file",
                selectedFile
            );

            await API.post(
                "/transactions/upload-screenshot",
                formData
            );

            toast.success(
                "📸 Screenshot uploaded successfully. Check Transaction History."
            );

            setSelectedFile(null);

            refreshDashboard();

        } catch {



            toast.error(
                "Failed to upload screenshot."
            );
        }
    };
    // =========================
    // AI Chat
    // =========================

    const clearChat = async () => {
        try {
            await API.delete("/transactions/chat/history");
            setMessages([]);
            toast.success("Chat history cleared.");
        } catch {
            toast.error("Failed to clear chat.");
        }
    };

    // Deletes one exchange (the user message and its AI reply share an exchangeId).
    const deleteExchange = async (exchangeId) => {
        try {
            await API.delete(`/transactions/chat/history/${exchangeId}`);
            setMessages((prev) =>
                prev.filter((m) => m.exchangeId !== exchangeId)
            );
            toast.success("Message deleted.");
        } catch {
            toast.error("Failed to delete message.");
        }
    };

    const sendMessage = async () => {

        if (!chatMessage.trim()) {

            toast.error(
                "Please enter message."
            );

            return;
        }

        // =====================================
        // USER MESSAGE
        // =====================================

        const userMessage = {

            role: "user",

            content: chatMessage
        };

        // ADD USER MESSAGE

        setMessages((prev) => [

            ...prev,

            userMessage
        ]);

        const currentMessage =
            chatMessage;

        setChatMessage("");

        setAiLoading(true);

        try {

            const response =
                await API.post(

                    "/transactions/chat",

                    {

                        message: currentMessage,
                        mode: selectedMode
                        
                    }
                );

            // =====================================
            // AI REPLY
            // =====================================

            const aiReply =
                (response.data.reply || "").replace(/\$\s*([\d,]+)/g, "₹$1");

            const exchangeId =
                response.data.exchangeId != null
                    ? String(response.data.exchangeId)
                    : undefined;

            // =====================================
            // ASSISTANT MESSAGE
            // =====================================

            const assistantMessage = {

                role: "assistant",

                content: aiReply,

                exchangeId
            };

            // =====================================
            // ADD AI MESSAGE (and tag the user message
            // with the same exchangeId so both can be
            // deleted together)
            // =====================================

            setMessages((prev) => [

                ...prev.map((m) =>
                    m === userMessage
                        ? { ...m, exchangeId }
                        : m
                ),

                assistantMessage
            ]);

            toast.success(
                "AI generated response!"
            );

        } catch (err) {

            // The backend says why: too slow this time (504) vs unavailable
            const reason = err?.response?.data?.reply;
            const slow = err?.response?.status === 504;

            toast.error(slow ? "The copilot took too long." : "AI failed to respond.");

            setMessages((prev) => [
                ...prev,
                {
                    role: "assistant",
                    content: reason || "FinTwin AI is temporarily unavailable."
                }
            ]);

        } finally {

            setAiLoading(false);
        }
    };

    // =========================
    // Affordability
    // =========================

    const analyzeAffordability =
        async () => {

            if (!price) {

                toast.error(
                    "Enter product price."
                );

                return;
            }

            try {

                const response =
                    await API.get(
                        `/affordability?price=${price}`
                    );

                setAffordability(
                    response.data
                );

                toast.success(
                    "Affordability analyzed!"
                );

            } catch {

    

                toast.error(
                    "Failed affordability analysis."
                );
            }
        };

    // =========================
    // Analytics
    // =========================

    const income = transactions

        .filter((t) => t.amount > 0)

        .reduce(
            (acc, curr) =>
                acc + curr.amount,
            0
        );

    const expenses = transactions

        .filter((t) => t.amount < 0)

        .reduce(
            (acc, curr) =>
                acc + curr.amount,
            0
        );

    const savings = income + expenses;

    // Current-month income/expenses (for the headline cards — savings above stays all-time)
    const currentMonthKey =
        `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    const monthlyIncome = transactions

        .filter((t) => t.amount > 0 && t.date?.slice(0, 7) === currentMonthKey)

        .reduce(
            (acc, curr) =>
                acc + curr.amount,
            0
        );

    const monthlyExpenses = transactions

        .filter((t) => t.amount < 0 && t.date?.slice(0, 7) === currentMonthKey)

        .reduce(
            (acc, curr) =>
                acc + curr.amount,
            0
        );

    // =========================
    // Fetch Financial Goals
    // =========================

    const fetchGoals = async () => {

        try {

            const response =
                await API.get("/goals");

            setGoals(response.data);

        } catch {



            reportLoadError("goals");
        }
    };
    
    // =========================
    // Create Financial Goal
    // =========================

    const createGoal = async (goal) => {

        try {

            const response =
                await API.post(
                    "/goals",
                    goal
                );

            toast.success(
                "Goal created!"
            );

            await fetchGoals();

            return response.data;

        } catch (error) {



            toast.error(
                "Failed to create goal."
            );

            throw error;
        }
    };

    // =========================
    // Update Financial Goal
    // =========================

    const updateGoal = async (

        goalId,

        goal

    ) => {

        try {

            const response =

                await API.put(

                    `/goals/${goalId}`,

                    goal
                );

            toast.success(
                "Goal updated!"
            );

            await fetchGoals();

            return response.data;

        } catch (error) {



            toast.error(
                "Failed to update goal."
            );

            throw error;
        }
    };

    // =========================
    // DELETE GOAL
    // =========================

    const deleteGoal = async (id) => {

        try {

            await API.delete(
                `/goals/${id}`
            );

            setGoals((prev) =>

                prev.filter(
                    (goal) =>
                        goal.id !== id
                )
            );

            toast.success(
                "Goal deleted!"
            );

        } catch {



            toast.error(
                "Failed to delete goal."
            );
        }
    };

    // =========================
    // REGENERATE GOAL AI
    // =========================

    const regenerateGoal = async (id) => {

        try {

            const response =
                await API.post(
                    `/goals/${id}/regenerate`
                );

            setGoals((prev) =>

                prev.map((goal) =>

                    goal.id === id

                        ? response.data

                        : goal
                )
            );

            toast.success(
                "AI regenerated!"
            );

        } catch {



            toast.error(
                "Failed to regenerate AI."
            );
        }
    };

    // =========================
    // MARK GOAL COMPLETE
    // =========================

    const completeGoal = async (id) => {

        try {

            const response =
                await API.post(
                    `/goals/${id}/complete`
                );

            setGoals((prev) =>

                prev.map((goal) =>

                    goal.id === id

                        ? response.data

                        : goal
                )
            );

            toast.success(
                "🎉 Congratulations on achieving your goal!",
                { duration: 5000 }
            );

        } catch {



            toast.error(
                "Goal hasn't reached 100% yet — couldn't mark it complete."
            );
        }
    };

    // =========================
    // UI
    // =========================

    return (

        <div
            className="
                h-screen
                overflow-hidden
                w-full
                bg-[#080A0F]
                text-white
                flex
            "
            style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
        >

            {/* Splash screen — fixed overlay, only on first session visit */}
            {showSplash && (
                <SplashScreen
                    isDataReady={dataReady}
                    onComplete={() => setShowSplash(false)}
                />
            )}

            {/* Sidebar */}

            <Sidebar
                activeSection={activeSection}
                setActiveSection={navigateTo}
            />

            {/* Main Content */}

            <div
                className="
                    flex-1
                    p-4
                    md:p-6
                    xl:p-10
                    pb-20
                    md:pb-6
                    xl:pb-10
                    overflow-y-auto
                    overflow-x-hidden
                    min-w-0
                "
            >

                {activeSection === "Dashboard" && (
                  <Header
                    notifications={notifications}
                    scoreData={scoreData}
                  />
                )}

                {/* =========================
                    About App — the landing section
                ========================= */}

                {activeSection === "About App" && (
                    <AboutPage navigateTo={navigateTo} />
                )}

                

                {/* =========================
                    Dashboard
                ========================= */}

                {activeSection ===
                    "Dashboard" && (

                    <>

                        <DashboardHero
                            score={scoreData?.score}
                            savingsRatio={
                                income > 0
                                    ? Math.round(
                                        (savings / income) * 100
                                    )
                                    : 0
                            }
                            activeGoals={goals.length}
                            alerts={notifications.length}
                        />

                        {loading ? (

                            <div className="
                                grid
                                grid-cols-1
                                sm:grid-cols-2
                                xl:grid-cols-4
                                gap-6
                                mb-10
                            ">

                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />
                                <SkeletonCard />

                            </div>

                        ) : (

                            <AnalyticsCards
                                income={monthlyIncome}
                                expenses={monthlyExpenses}
                                savings={savings}
                                prediction={
                                    forecast?.predictedExpenses || 0
                                }

                                incomeTrend={
                                    monthlySummary?.incomeTrend || 0
                                }

                                expenseTrend={
                                    monthlySummary?.expenseTrend || 0
                                }

                                savingsTrend={
                                    monthlySummary?.savingsTrend || 0
                                }
                            />

                        )}

                        {/* Financial Score */}

                        <FinancialScoreCard
                            scoreData={scoreData}
                        />

                        {/* AI Forecast */}

                        <ForecastCard
                            forecast={forecast}
                            monthlyHistory={monthlyHistory}
                        />

                        {/* Category Forecast */}

                        <CategoryForecastCard
                            categoryForecast={
                                categoryForecast
                            }
                        />

                        {/* Smart Notifications */}

                        <SmartNotifications
                            notifications={
                                notifications
                            }
                            setNotifications={setNotifications}
                        />

                        {/* Monthly Summary */}

                        <MonthlySummaryCard
                            summary={monthlySummary}
                        />
                        
                        {/* Net Worth */}

                        <NetWorthSection
                            netWorth={netWorth}
                            assets={assets}
                            liabilities={liabilities}
                        />

                        {/* Credit Score */}
                        <CreditScoreCard />
                    </>
                )}

                {/* =========================
                    Transactions
                ========================= */}

                {activeSection ===
                    "Transactions" && (

                    <>
                        <BankConnectionSection
                            onSynced={fetchTransactions}
                        />

                        {/* Import nudge banner */}
                        <div
                            onClick={() => {
                                localStorage.setItem("activeSection", "Imports");
                                window.dispatchEvent(new Event("dashboardNav"));
                            }}
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "14px 18px", marginBottom: 12, borderRadius: 14, cursor: "pointer",
                                background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.15)",
                                transition: "all 0.2s",
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(34,211,238,0.09)"; e.currentTarget.style.borderColor = "rgba(34,211,238,0.28)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "rgba(34,211,238,0.05)"; e.currentTarget.style.borderColor = "rgba(34,211,238,0.15)"; }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                                    📂
                                </div>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>
                                        Have a bank statement or CSV?
                                    </div>
                                    <div style={{ fontSize: 11, color: "rgba(148,163,184,0.6)" }}>
                                        Import transactions in bulk — supports CSV, Excel and PDF statements
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#22d3ee", flexShrink: 0 }}>
                                Import file <span style={{ fontSize: 14 }}>→</span>
                            </div>
                        </div>

                        <QuickEntryDropdown
                            incomeText={incomeText}
                            setIncomeText={setIncomeText}
                            addIncome={addIncome}
                            expenseText={expenseText}
                            setExpenseText={setExpenseText}
                            addExpense={addExpense}
                        />

                        <div role="note" style={{ display: "flex", gap: 10, alignItems: "flex-start", margin: "-8px 0 20px", padding: "12px 16px", borderRadius: 12, background: "rgba(167,139,250,0.07)", border: "1px solid rgba(167,139,250,0.2)" }}>
                            <Sparkles size={15} color="#a78bfa" style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
                            <span style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                                Day-to-day transactions are messy — a shop name or a UPI ID doesn't always say what you bought.
                                FinTwin puts each one in its most probable category, but it won't always be right. If you spot a
                                transaction in the wrong category, change it: FinTwin remembers your choice for that merchant, and
                                it helps us improve.
                            </span>
                        </div>

                        {/* Outside the loading swap so it never unmounts and refetches */}
                        <SortOther
                            onSorted={handleCategoryChanged}
                            onBulkChanged={refreshTransactionsQuietly}
                        />

                        {loading ? (

                            <TransactionSkeleton />

                        ) : (

                            <EnhancedTransactionsTable
                                transactions={transactions}
                                onChanged={handleCategoryChanged}
                                months={txMonths}
                                onMonthsChange={(m) => { setTxMonths(m); fetchTransactions(m); }}
                            />

                        )}
                    </>

                )}

                {/* =========================
                    OCR Uploads
                ========================= */}

                {activeSection ===
                    "OCR Uploads" && (

                    <OCRSection

                        selectedFile={
                            selectedFile
                        }

                        setSelectedFile={
                            setSelectedFile
                        }

                        uploadScreenshot={
                            uploadScreenshot
                        }

                    />

                )}

                {/* =========================
                    AI Copilot
                ========================= */}

                {activeSection ===
                    "AI Copilot" && (

                    <CopilotSection

                        chatMessage={
                            chatMessage
                        }

                        setChatMessage={
                            setChatMessage
                        }

                        sendMessage={
                            sendMessage
                        }

                        messages={
                            messages
                        }

                        aiLoading={
                            aiLoading
                        }

                        selectedMode={
                        selectedMode
                        }

                        setSelectedMode={
                        setSelectedMode
                        }

                        clearChat={
                            clearChat
                        }

                        deleteExchange={
                            deleteExchange
                        }

                    />

                )}

                {/* =========================
                    Analytics
                ========================= */}

                {activeSection ===
                    "Analytics" && (

                    <AnalyticsPage
                        transactions={transactions}
                        recurringExpenses={recurringExpenses}
                        insights={insights}
                        onCategoryChanged={handleCategoryChanged}
                    />

                )}

                {/* =========================
                    Executive Reports
                ========================= */}

                {activeSection ===
                    "Executive Reports" && (

                    <WeeklyReport />

                )}

                {/* =========================
                AI Intelligence
                ========================= */}

                {activeSection ===
                "AI Intelligence" && (

                <>

                    {/* AI Suite header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                        <div style={{
                            width: 40, height: 40, borderRadius: 12,
                            background: "linear-gradient(135deg,rgba(167,139,250,0.25),rgba(34,211,238,0.15))",
                            border: "1px solid rgba(167,139,250,0.3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <Brain size={18} color="#a78bfa" />
                        </div>
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(148,163,184,0.5)", letterSpacing: "0.1em" }}>AI SUITE</div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>AI Intelligence</h1>
                        </div>
                    </div>

                    <FinancialScoreCard
                        scoreData={scoreData}
                    />

                    <ForecastCard
                        forecast={forecast}
                        monthlyHistory={monthlyHistory}
                    />

                    <SmartNotifications
                        notifications={
                            notifications
                        }
                        setNotifications={setNotifications}
                    />

                    <AnomalyAlerts
                        anomalies={anomalies}
                    />

                </>

                )}

                {/* =========================
                Goals Planner
                ========================= */}

                {activeSection ===
                "Goals Planner" && (

                <>

                    <FinancialGoalsSection
                        goals={goals}
                        createGoal={createGoal}
                        updateGoal={updateGoal}
                        deleteGoal={deleteGoal}
                        regenerateGoal={
                            regenerateGoal
                        }
                        completeGoal={completeGoal}
                    />

                </>

                )}

                {/* =========================
                Budgeting
                ========================= */}

                {activeSection ===
                "Budgeting" && (

                <>

                    <BudgetSection
                        budgets={budgets}
                        createBudget={
                            createBudget
                        }
                        deleteBudget={
                            deleteBudget
                        }
                        updateBudget={
                            updateBudget
                        }
                    />

                    <AffordabilitySection
                        price={price}
                        setPrice={setPrice}
                        analyzeAffordability={
                            analyzeAffordability
                        }
                        affordability={
                            affordability
                        }
                    />

                </>

                )}

                {/* =========================
                    AI Spending Coach
                ========================= */}

                {
                    activeSection ===
                    "AI Spending Coach" && (

                        <SpendingCoachPage />

                    )
                }

                {/* =========================
                    Net Worth
                ========================= */}

                {
                    activeSection ===
                    "Net Worth" && (

                        <NetWorthManagement

                            netWorth={netWorth}

                            assets={assets}

                            liabilities={liabilities}

                            createAsset={createAsset}

                            updateAsset={updateAsset}

                            deleteAsset={deleteAsset}

                            createLiability={createLiability}

                            updateLiability={updateLiability}

                            deleteLiability={deleteLiability}

                        />

                    )
                }

                {/* =========================
                    Investments
                ========================= */}

                {
                    activeSection ===
                    "Investments" && (

                        <InvestmentsPage />

                    )
                }

                {/* =========================
                    Insurance
                ========================= */}

                {activeSection === "Insurance" && (
                    <InsurancePage />
                )}

                {/* =========================
                    Imports
                ========================= */}

                {activeSection === "Imports" && (
                    <ImportsPage onImported={refreshDashboard} />
                )}

                {/* =========================
                    Settings
                ========================= */}

                {activeSection === "Settings" && (
                    <SettingsPage navigateTo={navigateTo} />
                )}

                {/* =========================
                    Services (mobile nav hub)
                ========================= */}

                {activeSection === "Services" && (
                    <ServicesPage navigateTo={navigateTo} />
                )}

            </div>

            {/* Mobile bottom navigation — hidden on md+ */}
            <BottomNav
                activeSection={activeSection}
                setActiveSection={navigateTo}
            />

            {/* Global help widget */}
            <HelpWidget />

        </div>
    );
}

export default Dashboard;