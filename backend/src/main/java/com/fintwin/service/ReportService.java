package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.WeeklyReportDTO;

import com.fintwin.model.Transaction;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.dto.NetWorthResponseDTO;
import com.fintwin.dto.SpendingCoachResponseDTO;
import com.fintwin.service.NetWorthService;
import com.fintwin.service.SpendingCoachService;

import java.io.ByteArrayOutputStream;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import org.openpdf.text.Document;
import org.openpdf.text.Font;
import org.openpdf.text.FontFactory;
import org.openpdf.text.Paragraph;
import org.openpdf.text.pdf.PdfWriter;

import com.fintwin.repository
    .TransactionRepository;

import com.fintwin.repository
    .FinancialGoalRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class ReportService {

    private static final org.slf4j.Logger log =
        org.slf4j.LoggerFactory.getLogger(ReportService.class);

    private final TransactionRepository
        transactionRepository;

    private final FinancialGoalRepository
        goalRepository;

    private final UserRepository
        userRepository;

    private final NetWorthService
        netWorthService;

    private final SpendingCoachService
        spendingCoachService;

    @Autowired
    private FinancialScoreService financialScoreService;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    // =====================================
    // CONSTRUCTOR
    // =====================================

    public ReportService(

        TransactionRepository
            transactionRepository,

        FinancialGoalRepository
            goalRepository,

        UserRepository
            userRepository,

        NetWorthService netWorthService,

        SpendingCoachService spendingCoachService    

    ) {

        this.transactionRepository =
            transactionRepository;

        this.goalRepository =
            goalRepository;

        this.userRepository =
            userRepository;

        this.netWorthService =
            netWorthService;

        this.spendingCoachService =
            spendingCoachService;
    }

    // =====================================
    // GENERATE WEEKLY REPORT
    // =====================================

    @PreAuthorize("hasAuthority('USE_AI_REPORT')")
    @Audited(action = "READ", resource = "report", description = "Weekly financial report generated")
    public WeeklyReportDTO
    generateWeeklyReport() {

        String email =

            SecurityUtils
                .getCurrentUserEmail();

        User user =

            userRepository
                .findByEmail(email)
                .orElseThrow();

        List<Transaction>
            transactions =
                transactionRepository
                    .findLatestThreeMonthsTransactions(user.getId());

        List<FinancialGoal>
            goals =
                goalRepository
                    .findByUser(user);

        // =================================
        // ANALYTICS
        // =================================

        // Monthly averages (transfer-excluded) over months actually present —
        // the report generator labels these as monthly figures.
        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);
        double income   = com.fintwin.util.TransactionMath.income(transactions) / months;
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions) / months;
        double savings  = income - expenses;

        // =================================
        // CATEGORY SPENDING
        // =================================

        Map<String, Double>
            categorySpending =
                new HashMap<>();

        for (Transaction t : transactions) {

            if (

                t.getAmount() != null && t.getAmount() < 0

                &&

                t.getCategory() != null

            ) {

                categorySpending.put(

                    t.getCategory(),

                    categorySpending
                        .getOrDefault(
                            t.getCategory(),
                            0.0
                        )

                    +

                    Math.abs(
                        t.getAmount()
                    )
                );
            }
        }

        // =================================
        // FINANCIAL SCORE
        // Single source of truth — this was a fifth inline formula.
        // =================================

        int financialScore =
            financialScoreService.calculateScoreFor(user).getScore();

        NetWorthResponseDTO
            netWorth =

            netWorthService
                .getNetWorth();

        SpendingCoachResponseDTO
            spendingCoach =

            spendingCoachService
                .getCoachInsights();    

        // =================================
        // BUILD REQUEST BODY
        // =================================

        Map<String, Object>
            body =
                new HashMap<>();

        body.put(
            "income",
            income
        );

        body.put(
            "expenses",
            expenses
        );

        body.put(
            "savings",
            savings
        );

        body.put(
            "financialScore",
            financialScore
        );

        List<Map<String, Object>> goalSummaries = new ArrayList<>();
        for (FinancialGoal g : goals) {
            Map<String, Object> gm = new HashMap<>();
            gm.put("targetAmount",   g.getTargetAmount());
            gm.put("durationMonths", g.getDurationMonths());
            gm.put("monthlyTarget",  g.getMonthlyTarget());
            gm.put("goalHealth",     g.getGoalHealth());
            gm.put("progressPercent", g.getProgressPercent());
            goalSummaries.add(gm);
        }

        body.put(
            "goals",
            goalSummaries
        );

        body.put(
            "categorySpending",
            categorySpending
        );

        body.put(
            "netWorth",
            netWorth.getNetWorth()
        );

        body.put(
            "spendingHealth",
            spendingCoach
                .getSpendingHealth()
        );

        body.put(
            "monthlyLeakage",
            spendingCoach
                .getMonthlyLeakage()
        );

        // =================================
        // CALL FASTAPI AI SERVICE
        // =================================

        try {

            Map response =

                aiRestTemplate.postForObject(

                    aiServiceUrl + "/reports/weekly-report",

                    body,

                    Map.class
                );

            WeeklyReportDTO report =
                new WeeklyReportDTO();

            report.setSummary(
                response.get("summary")
                    .toString()
            );

            report.setInsights(
                response.get("insights")
                    .toString()
            );

            report.setRisks(
                response.get("risks")
                    .toString()
            );

            report.setRecommendations(
                response.get(
                    "recommendations"
                ).toString()
            );

            report.setFinancialScore(
                financialScore
            );

            report.setNetWorth(
                netWorth.getNetWorth()
            );

            report.setSpendingHealth(
                spendingCoach.getSpendingHealth()
            );

            report.setMonthlyLeakage(
                spendingCoach.getMonthlyLeakage()
            );

            return report;

        } catch (Exception e) {

            log.warn("Weekly report generation failed, returning empty report", e);

            WeeklyReportDTO report =
                new WeeklyReportDTO();

            report.setSummary(
                "AI report unavailable."
            );

            report.setInsights(
                "Unable to generate insights."
            );

            report.setRisks(
                "Risk analysis unavailable."
            );

            report.setRecommendations(
                "Try again later."
            );

            report.setFinancialScore(
                financialScore
            );

            report.setNetWorth(
                netWorth.getNetWorth()
            );

            report.setSpendingHealth(
                spendingCoach.getSpendingHealth()
            );

            report.setMonthlyLeakage(
                spendingCoach.getMonthlyLeakage()
            );

            return report;
        }
    }    
        @Audited(action = "READ", resource = "report", description = "PDF financial report exported")
        public ResponseEntity<byte[]>
        generatePdfReport() {

            try {

                WeeklyReportDTO report =
                    generateWeeklyReport();

                ByteArrayOutputStream out =
                    new ByteArrayOutputStream();

                Document document =
                    new Document();

                PdfWriter.getInstance(
                    document,
                    out
                );

                document.open();

                Font titleFont =
                    FontFactory.getFont(
                        FontFactory.HELVETICA_BOLD,
                        20
                    );

                Font headingFont =
                    FontFactory.getFont(
                        FontFactory.HELVETICA_BOLD,
                        14
                    );

                document.add(

                    new Paragraph(
                        "FinTwin AI Executive Report",
                        titleFont
                    )
                );

                document.add(
                    new Paragraph(" ")
                );

                document.add(

                    new Paragraph(
                        "Financial Health Score: "
                        +
                        report.getFinancialScore()
                        +
                        "/100"
                    )
                );

                document.add(

                    new Paragraph(
                        "Net Worth: ₹"
                        +
                        report.getNetWorth()
                    )
                );

                document.add(

                    new Paragraph(
                        "Spending Health: "
                        +
                        report.getSpendingHealth()
                    )
                );

                document.add(

                    new Paragraph(
                        "Monthly Leakage: ₹"
                        +
                        report.getMonthlyLeakage()
                    )
                );

                document.add(
                    new Paragraph(" ")
                );

                document.add(

                    new Paragraph(
                        "Executive Summary",
                        headingFont
                    )
                );

                document.add(

                    new Paragraph(
                        report.getSummary()
                    )
                );

                document.add(
                    new Paragraph(" ")
                );

                document.add(

                    new Paragraph(
                        "AI Insights",
                        headingFont
                    )
                );

                document.add(

                    new Paragraph(
                        report.getInsights()
                    )
                );

                document.add(
                    new Paragraph(" ")
                );

                document.add(

                    new Paragraph(
                        "Risk Analysis",
                        headingFont
                    )
                );

                document.add(

                    new Paragraph(
                        report.getRisks()
                    )
                );

                document.add(
                    new Paragraph(" ")
                );

                document.add(

                    new Paragraph(
                        "Recommendations",
                        headingFont
                    )
                );

                document.add(

                    new Paragraph(
                        report.getRecommendations()
                    )
                );

                document.close();

                return ResponseEntity.ok()

                    .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=FinTwin_Report.pdf"
                    )

                    .contentType(
                        MediaType.APPLICATION_PDF
                    )

                    .body(
                        out.toByteArray()
                    );

            } catch (Exception e) {

                log.error("PDF report generation failed", e);

                return ResponseEntity.internalServerError()
                    .build();
            }
        }
}