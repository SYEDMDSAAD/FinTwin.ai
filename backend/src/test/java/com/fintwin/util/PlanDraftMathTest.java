package com.fintwin.util;

import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PlanDraftMathTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 11, 26);

    private static Transaction tx(String date, String merchant, double amount, String category) {
        Transaction t = new Transaction();
        t.setDate(LocalDate.parse(date));
        t.setMerchant(merchant);
        t.setAmount(amount);
        t.setCategory(category);
        return t;
    }

    /** Aug–Nov: salary on the 1st, rent, food that spikes once, a tiny category. */
    private static List<Transaction> threeMonths() {
        List<Transaction> all = new ArrayList<>();
        String[] months = {"2026-08", "2026-09", "2026-10", "2026-11"};
        for (String m : months) {
            all.add(tx(m + "-01", "NEFT ACME PVT LTD SALARY", 52_000, "Income"));
            all.add(tx(m + "-03", "RENT LANDLORD", -15_000, "Rent"));
            all.add(tx(m + "-10", "SWIGGY", -3_000, "Food"));
            all.add(tx(m + "-12", "CHAI", -100, "Coffee"));
            all.add(tx(m + "-15", "Self transfer to own account", -10_000, "Transfer"));
        }
        all.add(tx("2026-09-20", "BIG DINNER", -9_000, "Food"));   // one expensive month
        return all;
    }

    @Test
    void findsTheSalary() {
        var s = PlanDraftMath.detectSalary(threeMonths(), TODAY);
        assertThat(s).isNotNull();
        assertThat(s.typicalAmount()).isEqualTo(52_000);
        assertThat(s.typicalDay()).isEqualTo(1);
        assertThat(s.months()).isEqualTo(4);
        assertThat(s.nextExpected()).isEqualTo(LocalDate.of(2026, 12, 1));
    }

    @Test
    void salaryAroundTheMonthEndIsStillOnePayday() {
        var credits = List.of(
                tx("2026-08-31", "INFY SAL", 80_000, "Income"),
                tx("2026-09-30", "INFY SAL", 80_000, "Income"),
                tx("2026-11-01", "INFY SAL", 81_000, "Income"));    // paid early on a holiday
        var s = PlanDraftMath.detectSalary(credits, TODAY);
        assertThat(s).isNotNull();
        assertThat(s.months()).isEqualTo(3);
    }

    @Test
    void oneOffCreditsAndUnsteadyPayersAreNotASalary() {
        var credits = List.of(
                tx("2026-09-05", "FRIEND", 20_000, "People"),
                tx("2026-10-25", "FRIEND", 6_000, "People"),
                tx("2026-10-08", "TAX REFUND", 30_000, "Income"));
        assertThat(PlanDraftMath.detectSalary(credits, TODAY)).isNull();
    }

    @Test
    void draftsBudgetsFromTypicalMonths() {
        var d = PlanDraftMath.draft(threeMonths(), Map.of("food", 2_000.0), TODAY);

        assertThat(d.monthsUsed()).isEqualTo(3);     // Aug, Sep, Oct; November isn't over
        var rent = d.budgets().stream().filter(b -> b.category().equals("Rent")).findFirst().orElseThrow();
        assertThat(rent.essential()).isTrue();
        assertThat(rent.suggested()).isEqualTo(15_000);

        // Median of 3000, 12000, 3000: the expensive month doesn't set the budget
        var food = d.budgets().stream().filter(b -> b.category().equals("Food")).findFirst().orElseThrow();
        assertThat(food.typical()).isEqualTo(3_000);
        assertThat(food.suggested()).isEqualTo(2_700);
        assertThat(food.currentLimit()).isEqualTo(2_000.0);

        // Transfers aren't spending; ₹100 a month isn't worth a budget
        assertThat(d.budgets()).extracting(PlanDraftMath.BudgetLine::category).containsExactly("Rent", "Food");
        assertThat(d.plannedShareOfIncome()).isEqualTo(34);   // 17,700 of 52,000
    }

    @Test
    void housingAndHealthcareAreEssentialsUnderTheirOtherNames() {
        assertThat(PlanDraftMath.isEssential("Housing")).isTrue();
        assertThat(PlanDraftMath.isEssential("healthcare")).isTrue();
        assertThat(PlanDraftMath.isEssential("Utilities")).isTrue();
        assertThat(PlanDraftMath.isEssential("Shopping")).isFalse();

        List<Transaction> all = new ArrayList<>();
        for (String m : new String[]{"2026-08", "2026-09", "2026-10"}) {
            all.add(tx(m + "-03", "LANDLORD", -17_500, "Housing"));
        }
        var housing = PlanDraftMath.draft(all, Map.of(), TODAY).budgets().get(0);
        assertThat(housing.essential()).isTrue();
        assertThat(housing.suggested()).isEqualTo(17_500);   // not cut by 10%
    }

    @Test
    void aFirstMonthThatStartsLateIsLeftOut() {
        List<Transaction> all = new ArrayList<>(List.of(
                tx("2026-08-20", "SWIGGY", -500, "Food"),          // SMS read began mid-August
                tx("2026-09-10", "SWIGGY", -4_000, "Food"),
                tx("2026-10-10", "SWIGGY", -4_000, "Food")));
        var d = PlanDraftMath.draft(all, Map.of(), TODAY);
        assertThat(d.monthsUsed()).isEqualTo(2);
        assertThat(d.budgets().get(0).typical()).isEqualTo(4_000);
    }

    @Test
    void notEnoughDataYet() {
        var d = PlanDraftMath.draft(List.of(tx("2026-11-20", "SWIGGY", -400, "Food")), Map.of(), TODAY);
        assertThat(d.monthsUsed()).isZero();
        assertThat(d.budgets()).isEmpty();
        assertThat(d.salary()).isNull();
    }
}
