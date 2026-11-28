"""Reading a policy or loan PDF into form fields."""

import json
from unittest.mock import patch

import pytest

from documents import extract as d


def test_policy_fields_are_kept_only_when_they_fit_the_form():
    raw = {"type": "health", "provider": "Star Health", "premium": "12,500", "frequency": "annually",
           "sumAssured": 500000, "renewalDate": "2027-03-14"}
    assert d.clean("policy", raw) == {"type": "Health", "provider": "Star Health", "premium": 12500.0,
                                      "frequency": "Annually", "sumAssured": 500000.0, "renewalDate": "2027-03-14"}


def test_doubtful_values_are_dropped_not_guessed():
    raw = {"type": "Pet", "provider": "", "premium": -5, "frequency": "Weekly",
           "sumAssured": True, "renewalDate": "14/03/2027"}
    assert d.clean("policy", raw) == {}
    assert d.clean("loan", {"interestRate": 95, "termMonths": 9999, "amount": "lots"}) == {}
    assert d.clean("loan", "not a dict") == {}


def test_loan_fields():
    raw = {"type": "Home Loan", "name": "SBI home loan", "amount": 2450000.4, "emi": 23150,
           "interestRate": 8.4, "termMonths": 182.0}
    assert d.clean("loan", raw) == {"type": "Home Loan", "name": "SBI home loan", "amount": 2450000.4,
                                    "emi": 23150.0, "interestRate": 8.4, "termMonths": 182}


def test_the_model_never_sees_policy_or_phone_numbers():
    text = "Policy No 123456789012345 Insured mobile 9876543210 Premium Rs 12,500 payable annually"
    with patch.object(d, "pdf_text", return_value=text), \
         patch.object(d, "ask", return_value=json.dumps({"premium": 12500, "frequency": "Annually"})) as ask:
        out = d.extract_fields("policy", b"%PDF-fake")
    prompt = ask.call_args.args[0]
    assert "123456789012345" not in prompt and "9876543210" not in prompt
    assert "12,500" in prompt
    assert ask.call_args.kwargs["json_mode"] is True
    assert out == {"fields": {"premium": 12500.0, "frequency": "Annually"}}


def test_names_the_model_returns_are_masked_too():
    with patch.object(d, "pdf_text", return_value="x" * 50), \
         patch.object(d, "ask", return_value=json.dumps({"name": "Loan for 9876543210"})):
        assert "9876543210" not in d.extract_fields("loan", b"%PDF")["fields"]["name"]


def test_unreadable_model_output_fills_nothing():
    with patch.object(d, "pdf_text", return_value="x" * 50), patch.object(d, "ask", return_value="nope"):
        assert d.extract_fields("loan", b"%PDF") == {"fields": {}}


def test_a_model_outage_is_reported_as_such():
    with patch.object(d, "pdf_text", return_value="x" * 50), \
         patch.object(d, "ask", side_effect=RuntimeError("down")):
        with pytest.raises(d.DocumentError) as e:
            d.extract_fields("policy", b"%PDF")
    assert e.value.code == "reader_unavailable"


def test_only_pdfs_and_known_kinds():
    with pytest.raises(d.DocumentError) as e:
        d.pdf_text(b"GIF89a....")
    assert e.value.code == "not_pdf"
    with pytest.raises(d.DocumentError) as e:
        d.extract_fields("payslip", b"%PDF")
    assert e.value.code == "bad_kind"
