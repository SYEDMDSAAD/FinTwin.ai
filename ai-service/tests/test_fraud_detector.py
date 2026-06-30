"""Unit tests for anomaly_detection.fraud_detector — pure Python, no mocks needed."""
from anomaly_detection.fraud_detector import detect_fraud_signals


def _tx(id, amount, date, merchant=None, description=None):
    t = {"id": id, "amount": amount, "date": date}
    if merchant is not None:
        t["merchant"] = merchant
    if description is not None:
        t["description"] = description
    return t


# ── LATE_NIGHT ────────────────────────────────────────────────────────────────

def test_late_night_detected_above_500():
    transactions = [_tx("1", -600, "2026-01-15T02:30:00")]
    signals = detect_fraud_signals(transactions)
    late_night = [s for s in signals if s["signal_type"] == "LATE_NIGHT"]
    assert len(late_night) == 1
    assert late_night[0]["severity"] == "medium"
    assert late_night[0]["amount"] == 600.0


def test_late_night_not_detected_below_threshold_amount():
    transactions = [_tx("1", -300, "2026-01-15T02:30:00")]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "LATE_NIGHT"] == []


def test_late_night_not_detected_outside_window():
    transactions = [_tx("1", -600, "2026-01-15T10:30:00")]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "LATE_NIGHT"] == []


def test_late_night_boundary_5am_excluded():
    # 5:00 AM is not < 5, so should NOT be flagged
    transactions = [_tx("1", -600, "2026-01-15T05:00:00")]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "LATE_NIGHT"] == []


def test_late_night_boundary_midnight_included():
    transactions = [_tx("1", -600, "2026-01-15T00:00:00")]
    signals = detect_fraud_signals(transactions)
    assert len([s for s in signals if s["signal_type"] == "LATE_NIGHT"]) == 1


# ── RAPID_SUCCESSION ──────────────────────────────────────────────────────────

def test_rapid_succession_detected_3_within_10_minutes():
    transactions = [
        _tx("1", -100, "2026-01-15T10:00:00"),
        _tx("2", -100, "2026-01-15T10:03:00"),
        _tx("3", -100, "2026-01-15T10:08:00"),
    ]
    signals = detect_fraud_signals(transactions)
    rapid = [s for s in signals if s["signal_type"] == "RAPID_SUCCESSION"]
    assert len(rapid) == 1
    assert rapid[0]["severity"] == "high"
    assert rapid[0]["amount"] == 300.0


def test_rapid_succession_not_detected_with_only_2():
    transactions = [
        _tx("1", -100, "2026-01-15T10:00:00"),
        _tx("2", -100, "2026-01-15T10:03:00"),
    ]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "RAPID_SUCCESSION"] == []


def test_rapid_succession_not_detected_outside_window():
    transactions = [
        _tx("1", -100, "2026-01-15T10:00:00"),
        _tx("2", -100, "2026-01-15T10:15:00"),
        _tx("3", -100, "2026-01-15T10:30:00"),
    ]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "RAPID_SUCCESSION"] == []


def test_rapid_succession_only_reported_once_per_cluster():
    transactions = [
        _tx("1", -100, "2026-01-15T10:00:00"),
        _tx("2", -100, "2026-01-15T10:03:00"),
        _tx("3", -100, "2026-01-15T10:05:00"),
        _tx("4", -100, "2026-01-15T10:07:00"),
    ]
    signals = detect_fraud_signals(transactions)
    rapid = [s for s in signals if s["signal_type"] == "RAPID_SUCCESSION"]
    assert len(rapid) == 1


# ── LARGE_ROUND_AMOUNT ────────────────────────────────────────────────────────

def test_large_round_amount_detected():
    transactions = [_tx("1", -10000, "2026-01-15T12:00:00")]
    signals = detect_fraud_signals(transactions)
    large_round = [s for s in signals if s["signal_type"] == "LARGE_ROUND_AMOUNT"]
    assert len(large_round) == 1
    assert large_round[0]["severity"] == "low"


def test_large_round_amount_not_detected_below_threshold():
    transactions = [_tx("1", -9000, "2026-01-15T12:00:00")]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "LARGE_ROUND_AMOUNT"] == []


def test_large_round_amount_not_detected_when_not_divisible_by_1000():
    transactions = [_tx("1", -10500, "2026-01-15T12:00:00")]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "LARGE_ROUND_AMOUNT"] == []


def test_large_round_amount_detected_at_higher_multiple():
    transactions = [_tx("1", -25000, "2026-01-15T12:00:00")]
    signals = detect_fraud_signals(transactions)
    assert len([s for s in signals if s["signal_type"] == "LARGE_ROUND_AMOUNT"]) == 1


# ── DUPLICATE_TRANSACTION ─────────────────────────────────────────────────────

def test_duplicate_transaction_detected():
    transactions = [
        _tx("1", -250, "2026-01-15T10:00:00", merchant="Amazon"),
        _tx("2", -250, "2026-01-16T11:00:00", merchant="Amazon"),
    ]
    signals = detect_fraud_signals(transactions)
    dupes = [s for s in signals if s["signal_type"] == "DUPLICATE_TRANSACTION"]
    assert len(dupes) == 1
    assert dupes[0]["amount"] == 500.0
    assert dupes[0]["severity"] == "medium"


def test_duplicate_transaction_not_detected_for_different_merchants():
    transactions = [
        _tx("1", -250, "2026-01-15T10:00:00", merchant="Amazon"),
        _tx("2", -250, "2026-01-16T11:00:00", merchant="Flipkart"),
    ]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "DUPLICATE_TRANSACTION"] == []


def test_duplicate_transaction_not_detected_for_single_occurrence():
    transactions = [_tx("1", -250, "2026-01-15T10:00:00", merchant="Amazon")]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "DUPLICATE_TRANSACTION"] == []


def test_duplicate_transaction_skipped_when_merchant_blank():
    transactions = [
        _tx("1", -250, "2026-01-15T10:00:00"),
        _tx("2", -250, "2026-01-16T11:00:00"),
    ]
    signals = detect_fraud_signals(transactions)
    assert [s for s in signals if s["signal_type"] == "DUPLICATE_TRANSACTION"] == []


def test_duplicate_transaction_uses_description_fallback():
    transactions = [
        _tx("1", -250, "2026-01-15T10:00:00", description="Coffee Shop"),
        _tx("2", -250, "2026-01-16T11:00:00", description="Coffee Shop"),
    ]
    signals = detect_fraud_signals(transactions)
    dupes = [s for s in signals if s["signal_type"] == "DUPLICATE_TRANSACTION"]
    assert len(dupes) == 1


def test_no_signals_for_empty_transactions():
    assert detect_fraud_signals([]) == []
