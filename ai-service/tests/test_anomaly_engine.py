"""Unit tests for anomaly_detection.anomaly_engine — pure Python, no mocks needed."""
from anomaly_detection.anomaly_engine import detect_anomalies, summarise_anomalies


def _tx(id, amount, category="Food", date="2026-01-15", merchant="Store"):
    return {"id": id, "amount": amount, "category": category, "date": date, "merchant": merchant}


# ── detect_anomalies: minimum sample guard ──────────────────────────────────

def test_returns_empty_when_fewer_than_5_expenses():
    transactions = [_tx(str(i), -100, date=f"2026-01-0{i+1}") for i in range(4)]
    assert detect_anomalies(transactions) == []


def test_returns_empty_for_no_transactions():
    assert detect_anomalies([]) == []


def test_ignores_income_transactions_when_counting():
    # 4 expenses + several income (positive) transactions: still below threshold
    transactions = [_tx(str(i), -100, date=f"2026-01-0{i+1}") for i in range(4)]
    transactions += [{"id": "inc1", "amount": 5000, "category": "Salary", "date": "2026-01-01"}]
    assert detect_anomalies(transactions) == []


# ── z_score_spike ────────────────────────────────────────────────────────────

def test_detects_z_score_spike():
    # Enough baseline transactions in the same category so the spike's own
    # value doesn't drag down the category mean/stdev below the threshold.
    transactions = [
        _tx("1", -100, category="Food", date="2026-01-01"),
        _tx("2", -105, category="Food", date="2026-01-02"),
        _tx("3", -95, category="Food", date="2026-01-03"),
        _tx("4", -100, category="Food", date="2026-01-04"),
        _tx("5", -102, category="Food", date="2026-01-05"),
        _tx("6", -103, category="Food", date="2026-01-06"),
        _tx("7", -98, category="Food", date="2026-01-07"),
        _tx("8", -5000, category="Food", date="2026-01-08", merchant="BigSpend"),
    ]
    results = detect_anomalies(transactions)
    spikes = [r for r in results if r["anomaly_type"] == "z_score_spike"]
    assert len(spikes) >= 1
    spike = next(r for r in spikes if r["transaction_id"] == "8")
    assert spike["is_anomaly"] is True
    assert spike["category"] == "Food"
    assert spike["z_score"] > 2.5
    assert spike["severity"] in ("high", "medium", "low")


def test_no_spike_when_amounts_are_uniform():
    transactions = [
        _tx(str(i), -100, category="Food", date=f"2026-01-0{i+1}") for i in range(5)
    ]
    results = detect_anomalies(transactions)
    spikes = [r for r in results if r["anomaly_type"] == "z_score_spike"]
    assert spikes == []


# ── category_surge ───────────────────────────────────────────────────────────

def test_detects_category_surge():
    transactions = []
    # Prior month: Food = 600 spread over enough transactions to not trigger spike/burst
    for i in range(5):
        transactions.append(_tx(f"p{i}", -120, category="Food", date=f"2025-12-0{i+1}"))
    # Latest month: Food = 600 * 1.8 = 1080+, spread across several days to avoid burst flag
    for i in range(5):
        transactions.append(_tx(f"c{i}", -250, category="Food", date=f"2026-01-0{i+1}"))
    results = detect_anomalies(transactions)
    surges = [r for r in results if r["anomaly_type"] == "category_surge"]
    assert len(surges) == 1
    surge = surges[0]
    assert surge["category"] == "Food"
    assert surge["is_anomaly"] is True
    assert surge["amount"] == 1250.0


def test_no_surge_when_prior_avg_below_500():
    transactions = []
    for i in range(5):
        transactions.append(_tx(f"p{i}", -50, category="Food", date=f"2025-12-0{i+1}"))
    for i in range(5):
        transactions.append(_tx(f"c{i}", -200, category="Food", date=f"2026-01-0{i+1}"))
    results = detect_anomalies(transactions)
    surges = [r for r in results if r["anomaly_type"] == "category_surge"]
    assert surges == []


def test_no_surge_when_ratio_below_threshold():
    transactions = []
    for i in range(5):
        transactions.append(_tx(f"p{i}", -120, category="Food", date=f"2025-12-0{i+1}"))
    # ratio = 1.2x prior avg of 600 -> below 1.8 threshold
    for i in range(5):
        transactions.append(_tx(f"c{i}", -144, category="Food", date=f"2026-01-0{i+1}"))
    results = detect_anomalies(transactions)
    surges = [r for r in results if r["anomaly_type"] == "category_surge"]
    assert surges == []


# ── large_single ──────────────────────────────────────────────────────────────

def test_detects_large_single():
    # Baseline transactions are spread across distinct single-sample
    # categories (so the per-category z-score path never kicks in — each
    # category falls back to global stats) and include enough natural
    # variance that the global stdev is high. This keeps the big outlier's
    # global z-score under the 2.5 threshold while its ratio-to-mean stays
    # above the 5x large_single threshold, isolating the large_single check.
    amounts = [100, 200, 300, 4000, 150, 250, 180, 220, 170, 210]
    categories = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
    transactions = [
        _tx(str(i + 1), -amt, category=cat, date=f"2026-01-{i + 1:02d}")
        for i, (amt, cat) in enumerate(zip(amounts, categories))
    ]
    transactions.append(_tx("big", -5000, category="Z", date="2026-01-11", merchant="GadgetStore"))

    results = detect_anomalies(transactions)
    large = [r for r in results if r["anomaly_type"] == "large_single"]
    assert len(large) == 1
    assert large[0]["transaction_id"] == "big"
    assert large[0]["amount"] == 5000.0
    # Must not be double-counted as a z-score spike too.
    assert [r for r in results if r["anomaly_type"] == "z_score_spike"] == []


def test_large_single_not_flagged_if_below_1000():
    # global mean small but the "large" candidate still below 1000 absolute floor
    transactions = [
        _tx("1", -10, category="Food", date="2026-01-01"),
        _tx("2", -12, category="Food", date="2026-01-02"),
        _tx("3", -11, category="Food", date="2026-01-03"),
        _tx("4", -9, category="Food", date="2026-01-04"),
        _tx("5", -500, category="Electronics", date="2026-01-05"),
    ]
    results = detect_anomalies(transactions)
    large = [r for r in results if r["anomaly_type"] == "large_single"]
    assert large == []


def test_large_single_skips_ids_already_flagged_as_spike():
    # The same tx that causes a z-spike within its own category should not be
    # double counted as large_single because tx_id is added to seen_ids.
    transactions = [
        _tx("1", -100, category="Food", date="2026-01-01"),
        _tx("2", -105, category="Food", date="2026-01-02"),
        _tx("3", -95, category="Food", date="2026-01-03"),
        _tx("4", -100, category="Food", date="2026-01-04"),
        _tx("5", -102, category="Food", date="2026-01-05"),
        _tx("6", -103, category="Food", date="2026-01-06"),
        _tx("7", -98, category="Food", date="2026-01-07"),
        _tx("8", -5000, category="Food", date="2026-01-08", merchant="BigSpend"),
    ]
    results = detect_anomalies(transactions)
    spikes_for_8 = [r for r in results if r["anomaly_type"] == "z_score_spike" and r["transaction_id"] == "8"]
    assert len(spikes_for_8) == 1
    large_for_8 = [r for r in results if r["anomaly_type"] == "large_single" and r["transaction_id"] == "8"]
    assert large_for_8 == []


# ── burst ─────────────────────────────────────────────────────────────────────

def test_detects_burst():
    transactions = [
        _tx(str(i), -50, category="Food", date="2026-01-15") for i in range(5)
    ]
    results = detect_anomalies(transactions)
    bursts = [r for r in results if r["anomaly_type"] == "burst"]
    assert len(bursts) == 1
    assert bursts[0]["amount"] == 250.0
    assert bursts[0]["category"] == "Multiple"


def test_burst_severity_high_for_8_or_more():
    transactions = [
        _tx(str(i), -50, category="Food", date="2026-01-15") for i in range(8)
    ]
    results = detect_anomalies(transactions)
    bursts = [r for r in results if r["anomaly_type"] == "burst"]
    assert len(bursts) == 1
    assert bursts[0]["severity"] == "high"


def test_no_burst_when_fewer_than_5_same_day():
    transactions = [
        _tx(str(i), -50, category="Food", date=f"2026-01-{i+1:02d}") for i in range(5)
    ]
    results = detect_anomalies(transactions)
    bursts = [r for r in results if r["anomaly_type"] == "burst"]
    assert bursts == []


# ── summarise_anomalies ──────────────────────────────────────────────────────

def test_summarise_anomalies_empty():
    summary = summarise_anomalies([])
    assert summary == {"count": 0, "totalAmount": 0, "highSeverity": 0, "anomalies": []}


def test_summarise_anomalies_counts_and_totals():
    anomalies = [
        {"amount": 100.0, "severity": "high"},
        {"amount": 50.5, "severity": "low"},
        {"amount": 25.25, "severity": "high"},
    ]
    summary = summarise_anomalies(anomalies)
    assert summary["count"] == 3
    assert summary["totalAmount"] == 175.75
    assert summary["highSeverity"] == 2
    assert summary["anomalies"] == anomalies


# ── sort order ────────────────────────────────────────────────────────────────

def test_results_sorted_high_to_low_severity():
    transactions = [
        _tx(str(i), -50, category="Food", date="2026-01-15") for i in range(5)
    ]  # burst, medium severity (5 txns)
    # add a z-score spike (high severity) in a different category, with
    # enough baseline transactions that the spike itself doesn't drag the
    # category mean/stdev down below the detection threshold.
    transactions += [
        _tx("s1", -100, category="Travel", date="2026-01-20"),
        _tx("s2", -105, category="Travel", date="2026-01-21"),
        _tx("s3", -95, category="Travel", date="2026-01-22"),
        _tx("s4", -100, category="Travel", date="2026-01-23"),
        _tx("s5", -102, category="Travel", date="2026-01-24"),
        _tx("s6", -103, category="Travel", date="2026-01-25"),
        _tx("s7", -98, category="Travel", date="2026-01-26"),
        _tx("s8", -10000, category="Travel", date="2026-01-27", merchant="Flight"),
    ]
    results = detect_anomalies(transactions)
    severities = [r["severity"] for r in results]
    rank = {"high": 0, "medium": 1, "low": 2}
    ranks = [rank[s] for s in severities]
    assert ranks == sorted(ranks)
