package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.NetWorthResponseDTO;
import com.fintwin.dto.ReportItemDTO;
import com.fintwin.dto.ReportTrendDTO;
import com.fintwin.dto.SpendingCoachResponseDTO;
import com.fintwin.dto.WeeklyReportDTO;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.FinancialScoreHistory;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.FinancialScoreHistoryRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.TransactionMath;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.FontFactory;
import org.openpdf.text.Paragraph;
import org.openpdf.text.pdf.PdfWriter;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.io.ByteArrayOutputStream;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class ReportService {

    private static final org.slf4j.Logger log =
            org.slf4j.LoggerFactory.getLogger(ReportService.class);

    private final TransactionRepository transactionRepository;
    private final FinancialGoalRepository goalRepository;
    private final UserRepository userRepository;
    private final NetWorthService netWorthService;
    private final SpendingCoachService spendingCoachService;
    private final FinancialScoreHistoryRepository scoreHistoryRepository;

    @Autowired
    private FinancialScoreService financialScoreService;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    /**
     * A report costs an LLM generation, and its inputs are fully determined by
     * the transaction window, the goals and the score — so identical inputs are
     * served the previous answer.
     *
     * This also fixes a divergence users could see: the PDF export re-ran
     * generation, so the downloaded document could contain different prose and
     * different findings than the report on screen. Both paths now read the
     * same cached report.
     *
     * Only non-degraded reports are cached, matching the spending coach: pinning
     * an outage's fallback output for hours after the AI recovered would be
     * worse than regenerating. Degraded reports are deterministic functions of
     * the same inputs anyway, so screen and PDF still agree.
     */
    private final Cache<String, WeeklyReportDTO> reportCache =
            Caffeine.newBuilder()
                    .expireAfterWrite(Duration.ofHours(6))
                    .maximumSize(2_000)
                    .build();

    public ReportService(
            TransactionRepository transactionRepository,
            FinancialGoalRepository goalRepository,
            UserRepository userRepository,
            NetWorthService netWorthService,
            SpendingCoachService spendingCoachService,
            FinancialScoreHistoryRepository scoreHistoryRepository
    ) {
        this.transactionRepository  = transactionRepository;
        this.goalRepository         = goalRepository;
        this.userRepository         = userRepository;
        this.netWorthService        = netWorthService;
        this.spendingCoachService   = spendingCoachService;
        this.scoreHistoryRepository = scoreHistoryRepository;
    }

    // =====================================
    // GENERATE WEEKLY REPORT
    // =====================================

    @PreAuthorize("hasAuthority('USE_AI_REPORT')")
    @Audited(action = "READ", resource = "report", description = "Weekly financial report generated")
    public WeeklyReportDTO generateWeeklyReport() {

        User user = userRepository
                .findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow();

        List<Transaction> transactions =
                transactionRepository.findLatestThreeMonthsTransactions(user.getId());

        List<FinancialGoal> goals = goalRepository.findByUser(user);

        int financialScore = financialScoreService.calculateScoreFor(user).getScore();

        String cacheKey = cacheKey(user, transactions, goals, financialScore);
        WeeklyReportDTO cached = reportCache.getIfPresent(cacheKey);
        if (cached != null) {
            return cached;
        }

        // Headline figures: monthly averages (transfer-excluded) over the
        // months actually present.
        int months      = TransactionMath.monthsPresent(transactions);
        double income   = TransactionMath.income(transactions) / months;
        double expenses = TransactionMath.expenses(transactions) / months;
        double savings  = income - expenses;

        Map<String, Double> categorySpending = categorySpending(transactions);

        NetWorthResponseDTO netWorth = netWorthService.getNetWorth();
        SpendingCoachResponseDTO spendingCoach = spendingCoachService.getCoachInsights();

        // Trend inputs: the last two COMPLETE months, so like is compared with
        // like. The current month is partial and would always look like a
        // collapse in spending.
        Map<YearMonth, double[]> byMonth = monthlyFigures(transactions);
        List<YearMonth> complete = byMonth.keySet().stream()
                .filter(ym -> ym.isBefore(YearMonth.now()))
                .sorted()
                .collect(Collectors.toList());

        YearMonth currentMonth  = complete.size() >= 1 ? complete.get(complete.size() - 1) : null;
        YearMonth previousMonth = complete.size() >= 2 ? complete.get(complete.size() - 2) : null;

        Map<String, Object> currentPeriod  = periodBody(byMonth, currentMonth,
                scoreFor(user, currentMonth));
        Map<String, Object> previousPeriod = periodBody(byMonth, previousMonth,
                scoreFor(user, previousMonth));

        // Next-month projection: a trailing average of the complete months.
        // Deliberately not presented as a forecast — it is a simple mean, and
        // the DTO/UI label it as a projection.
        double predictedExpenses = trailingAverage(byMonth, complete, 1);
        double predictedSavings  = trailingAverage(byMonth, complete, 2);

        Map<String, Object> body = new HashMap<>();
        body.put("income",            income);
        body.put("expenses",          expenses);
        body.put("savings",           savings);
        body.put("financialScore",    financialScore);
        body.put("goals",             goalSummaries(goals));
        body.put("categorySpending",  categorySpending);
        body.put("netWorth",          netWorth.getNetWorth());
        body.put("spendingHealth",    spendingCoach.getSpendingHealth());
        body.put("monthlyLeakage",    spendingCoach.getMonthlyLeakage());
        body.put("predictedExpenses", predictedExpenses);
        body.put("predictedSavings",  predictedSavings);
        body.put("currentPeriod",     currentPeriod);
        body.put("previousPeriod",    previousPeriod);

        double savingsRate = income > 0
                ? Math.round((savings / income) * 1000.0) / 10.0
                : 0.0;

        WeeklyReportDTO report;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = aiRestTemplate.postForObject(
                    aiServiceUrl + "/reports/weekly-report", body, Map.class);

            report = mapResponse(response);

        } catch (Exception e) {
            log.warn("Weekly report generation failed, returning computed report: {}", e.getMessage());
            report = new WeeklyReportDTO();
            report.setDegraded(true);
        }

        // Figures are the backend's to state, never the model's to echo back.
        report.setFinancialScore(financialScore);
        report.setNetWorth(netWorth.getNetWorth());
        report.setSpendingHealth(spendingCoach.getSpendingHealth());
        report.setMonthlyLeakage(spendingCoach.getMonthlyLeakage());
        report.setSavingsRate(savingsRate);
        report.setPredictedExpenses(round2(predictedExpenses));
        report.setPredictedSavings(round2(predictedSavings));
        report.setGeneratedAt(Instant.now());
        report.setComparisonPeriod(comparisonLabel(currentMonth, previousMonth));

        if (report.getSummary() == null || report.getSummary().isBlank()) {
            applyLocalFallback(report, income, expenses, savings, savingsRate,
                    spendingCoach.getMonthlyLeakage(), netWorth.getNetWorth(),
                    financialScore, categorySpending);
        }

        if (!report.isDegraded()) {
            reportCache.put(cacheKey, report);
        }
        return report;
    }

    // =====================================
    // AI RESPONSE MAPPING
    // =====================================

    @SuppressWarnings("unchecked")
    private WeeklyReportDTO mapResponse(Map<String, Object> response) {
        WeeklyReportDTO report = new WeeklyReportDTO();
        if (response == null) {
            report.setDegraded(true);
            return report;
        }

        // Every read is defensive: the previous version called .toString() on
        // each key, so one missing field threw and collapsed the whole report
        // into "AI report unavailable".
        report.setSummary(str(response.get("summary")));
        report.setInsights(items(response.get("insights")));
        report.setRisks(items(response.get("risks")));
        report.setRecommendations(items(response.get("recommendations")));
        report.setTrends(trends(response.get("trends")));
        report.setDegraded(Boolean.TRUE.equals(response.get("degraded")));
        return report;
    }

    @SuppressWarnings("unchecked")
    private List<ReportItemDTO> items(Object raw) {
        if (!(raw instanceof List<?> list)) return new ArrayList<>();
        List<ReportItemDTO> out = new ArrayList<>();
        for (Object element : list) {
            if (element instanceof Map<?, ?> map) {
                String title  = str(map.get("title"));
                String detail = str(map.get("detail"));
                if (title == null && detail == null) continue;
                out.add(new ReportItemDTO(title, detail, str(map.get("severity"))));
            }
        }
        return out;
    }

    private List<ReportTrendDTO> trends(Object raw) {
        if (!(raw instanceof List<?> list)) return new ArrayList<>();
        List<ReportTrendDTO> out = new ArrayList<>();
        for (Object element : list) {
            if (element instanceof Map<?, ?> map) {
                ReportTrendDTO trend = new ReportTrendDTO();
                trend.setLabel(str(map.get("label")));
                trend.setCurrent(dbl(map.get("current")));
                trend.setPrevious(dbl(map.get("previous")));
                trend.setChangePercent(dbl(map.get("changePercent")));
                trend.setDirection(str(map.get("direction")));
                trend.setGoodDirection(str(map.get("goodDirection")));
                out.add(trend);
            }
        }
        return out;
    }

    private static String str(Object value) {
        return value == null ? null : value.toString();
    }

    private static Double dbl(Object value) {
        return value instanceof Number n ? n.doubleValue() : null;
    }

    private static Double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    // =====================================
    // LOCAL FALLBACK
    // =====================================

    /**
     * Used only when the AI service is unreachable — the ai-service produces
     * its own computed report when the model itself misbehaves, so this covers
     * the case where nothing answered at all.
     */
    private void applyLocalFallback(WeeklyReportDTO report, double income, double expenses,
                                    double savings, double savingsRate, Double leakage,
                                    Double netWorth, int score,
                                    Map<String, Double> categorySpending) {

        long leak = Math.round(leakage != null ? leakage : 0);
        long worth = Math.round(netWorth != null ? netWorth : 0);

        report.setSummary(String.format(
                "Your financial health score of %d/100 reflects a %.1f%% savings rate on "
                + "₹%d monthly income. Reducing the ₹%d monthly leakage is the fastest way "
                + "to strengthen your net worth of ₹%d.",
                score, savingsRate, Math.round(income), leak, worth));

        String topCategory = categorySpending.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse(null);

        List<ReportItemDTO> insights = new ArrayList<>();
        if (topCategory != null) {
            insights.add(new ReportItemDTO(
                    "Largest spending category",
                    String.format("%s is your biggest outflow against ₹%d of monthly expenses.",
                            topCategory, Math.round(expenses)),
                    "medium"));
        }
        insights.add(new ReportItemDTO(
                "Savings rate",
                String.format("You are saving ₹%d a month, a %.1f%% savings rate.",
                        Math.round(savings), savingsRate),
                savingsRate >= 20 ? "low" : "medium"));
        report.setInsights(insights);

        report.setRisks(List.of(
                new ReportItemDTO("Recurring spending leakage",
                        String.format("A monthly leakage of ₹%d is eroding your savings capacity.", leak),
                        leak > 0 ? "high" : "low"),
                new ReportItemDTO("Limited expense buffer",
                        String.format("₹%d of monthly expenses leaves little room for an unexpected cost.",
                                Math.round(expenses)),
                        "medium")));

        report.setRecommendations(List.of(
                new ReportItemDTO("Redirect the leakage",
                        String.format("Move ₹%d of monthly leakage into a recurring deposit or SIP.", leak),
                        leak > 0 ? "high" : "low"),
                new ReportItemDTO("Commit savings to goals",
                        String.format("Allocate your ₹%d monthly savings against active goals.",
                                Math.round(savings)),
                        "medium")));

        if (report.getTrends() == null) {
            report.setTrends(new ArrayList<>());
        }
        report.setDegraded(true);
    }

    // =====================================
    // ANALYTICS HELPERS
    // =====================================

    private Map<String, Double> categorySpending(List<Transaction> transactions) {
        Map<String, Double> categorySpending = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() != null && t.getAmount() < 0 && t.getCategory() != null
                    && !TransactionMath.isSelfTransfer(t)) {
                categorySpending.merge(t.getCategory(), Math.abs(t.getAmount()), Double::sum);
            }
        }
        return categorySpending;
    }

    /** month -> {income, expenses, savings}, transfer-excluded. */
    private Map<YearMonth, double[]> monthlyFigures(List<Transaction> transactions) {
        Map<YearMonth, List<Transaction>> grouped = transactions.stream()
                .filter(t -> t.getDate() != null)
                .collect(Collectors.groupingBy(t -> YearMonth.from(t.getDate())));

        Map<YearMonth, double[]> out = new TreeMap<>();
        grouped.forEach((month, list) -> {
            double income   = TransactionMath.income(list);
            double expenses = TransactionMath.expenses(list);
            out.put(month, new double[]{income, expenses, income - expenses});
        });
        return out;
    }

    private Map<String, Object> periodBody(Map<YearMonth, double[]> byMonth,
                                           YearMonth month, Integer score) {
        Map<String, Object> body = new HashMap<>();
        double[] figures = month != null ? byMonth.get(month) : null;
        body.put("income",   figures != null ? figures[0] : 0.0);
        body.put("expenses", figures != null ? figures[1] : 0.0);
        body.put("savings",  figures != null ? figures[2] : 0.0);
        // Net worth has no history table, so it is left at zero and the
        // ai-service drops it from the trend list rather than inventing one.
        body.put("netWorth", 0.0);
        body.put("financialScore", score != null ? score.doubleValue() : 0.0);
        return body;
    }

    /** The recorded score for a month, or null when never snapshotted. */
    private Integer scoreFor(User user, YearMonth month) {
        if (month == null) return null;
        String key = month.toString();
        return scoreHistoryRepository.findByUserOrderByMonthAsc(user).stream()
                .filter(h -> key.equals(h.getMonth()))
                .map(FinancialScoreHistory::getScore)
                .filter(Objects::nonNull)
                .findFirst()
                .orElse(null);
    }

    /** Mean of the complete months for one figure index (1=expenses, 2=savings). */
    private double trailingAverage(Map<YearMonth, double[]> byMonth,
                                   List<YearMonth> complete, int index) {
        if (complete.isEmpty()) return 0.0;
        double total = 0;
        for (YearMonth month : complete) {
            total += byMonth.get(month)[index];
        }
        return total / complete.size();
    }

    private String comparisonLabel(YearMonth current, YearMonth previous) {
        if (current == null || previous == null) return null;
        return String.format("%s vs %s %d",
                current.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                previous.getMonth().getDisplayName(TextStyle.FULL, Locale.ENGLISH),
                previous.getYear());
    }

    private List<Map<String, Object>> goalSummaries(List<FinancialGoal> goals) {
        List<Map<String, Object>> summaries = new ArrayList<>();
        for (FinancialGoal g : goals) {
            Map<String, Object> gm = new HashMap<>();
            gm.put("targetAmount",    g.getTargetAmount());
            gm.put("durationMonths",  g.getDurationMonths());
            gm.put("monthlyTarget",   g.getMonthlyTarget());
            gm.put("goalHealth",      g.getGoalHealth());
            gm.put("progressPercent", g.getProgressPercent());
            summaries.add(gm);
        }
        return summaries;
    }

    /**
     * Keyed on everything the report reads, so any change to transactions,
     * goals or the score misses the cache instead of serving stale analysis.
     */
    private String cacheKey(User user, List<Transaction> transactions,
                            List<FinancialGoal> goals, int score) {
        StringBuilder goalPart = new StringBuilder();
        for (FinancialGoal g : goals) {
            goalPart.append(g.getId()).append(':')
                    .append(g.getTargetAmount()).append(':')
                    .append(g.getProgressPercent()).append(':')
                    .append(g.getGoalHealth()).append('|');
        }
        return user.getId()
                + ":" + SpendingCoachService.windowFingerprint(transactions)
                + ":" + Integer.toHexString(goalPart.toString().hashCode())
                + ":" + score;
    }

    // =====================================
    // PDF EXPORT
    // =====================================

    @PreAuthorize("hasAuthority('USE_AI_REPORT')")
    @Audited(action = "READ", resource = "report", description = "PDF financial report exported")
    public ResponseEntity<byte[]> generatePdfReport() {

        try {
            // Reads the cached report, so the PDF matches what the user is
            // looking at on screen.
            WeeklyReportDTO report = generateWeeklyReport();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            Document document = new Document();
            PdfWriter.getInstance(document, out);
            document.open();

            Font titleFont   = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 20);
            Font headingFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 14);
            Font itemFont    = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11);
            Font metaFont    = FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 9);

            document.add(new Paragraph("FinTwin AI Executive Report", titleFont));
            if (report.getGeneratedAt() != null) {
                document.add(new Paragraph("Generated " + report.getGeneratedAt(), metaFont));
            }
            if (report.isDegraded()) {
                document.add(new Paragraph(
                        "Note: AI analysis was unavailable; this report uses computed figures.",
                        metaFont));
            }
            document.add(new Paragraph(" "));

            document.add(new Paragraph("Financial Health Score: " + report.getFinancialScore() + "/100"));
            document.add(new Paragraph("Net Worth: ₹" + report.getNetWorth()));
            document.add(new Paragraph("Spending Health: " + report.getSpendingHealth()));
            document.add(new Paragraph("Monthly Leakage: ₹" + report.getMonthlyLeakage()));
            if (report.getSavingsRate() != null) {
                document.add(new Paragraph("Savings Rate: " + report.getSavingsRate() + "%"));
            }
            document.add(new Paragraph(" "));

            if (report.getTrends() != null && !report.getTrends().isEmpty()) {
                String period = report.getComparisonPeriod();
                document.add(new Paragraph(
                        "Period Comparison" + (period != null ? " (" + period + ")" : ""),
                        headingFont));
                for (ReportTrendDTO trend : report.getTrends()) {
                    document.add(new Paragraph(String.format("%s: %s -> %s (%+.1f%%)",
                            trend.getLabel(), trend.getPrevious(), trend.getCurrent(),
                            trend.getChangePercent() != null ? trend.getChangePercent() : 0.0)));
                }
                document.add(new Paragraph(" "));
            }

            document.add(new Paragraph("Executive Summary", headingFont));
            document.add(new Paragraph(nullSafe(report.getSummary())));
            document.add(new Paragraph(" "));

            addSection(document, "AI Insights", report.getInsights(), headingFont, itemFont);
            addSection(document, "Risk Analysis", report.getRisks(), headingFont, itemFont);
            addSection(document, "Recommendations", report.getRecommendations(), headingFont, itemFont);

            Paragraph disclaimer = new Paragraph(
                    "Educational analysis generated from your own financial data. "
                    + "Not investment advice.", metaFont);
            disclaimer.setAlignment(Element.ALIGN_LEFT);
            document.add(disclaimer);

            document.close();

            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            "attachment; filename=FinTwin_Report.pdf")
                    .contentType(MediaType.APPLICATION_PDF)
                    .body(out.toByteArray());

        } catch (Exception e) {
            log.error("PDF report generation failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    private void addSection(Document document, String heading, List<ReportItemDTO> items,
                            Font headingFont, Font itemFont) throws Exception {
        if (items == null || items.isEmpty()) return;

        document.add(new Paragraph(heading, headingFont));
        for (ReportItemDTO item : items) {
            String severity = item.getSeverity() != null
                    ? " [" + item.getSeverity().toUpperCase(Locale.ENGLISH) + "]" : "";
            document.add(new Paragraph(nullSafe(item.getTitle()) + severity, itemFont));
            document.add(new Paragraph(nullSafe(item.getDetail())));
        }
        document.add(new Paragraph(" "));
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
