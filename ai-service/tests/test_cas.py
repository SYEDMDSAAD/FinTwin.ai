"""CAS statements → holdings. The fixture is a made-up CAMS statement drawn
with fpdf2 in the CAMS layout (watermark id, two-line table header, folio
and scheme lines, balance footer) and locked with a made-up PAN."""
import json

import pytest
from fastapi.testclient import TestClient
from fpdf import FPDF

import app as app_module
from documents.cas import read_cas
from documents.extract import DocumentError

PAN = "ABCDE1234F"  # made up
client = TestClient(app_module.app)
GOOD_KEY = {"x-internal-key": "test-internal-key"}


def cams_pdf(password=PAN) -> bytes:
    pdf = FPDF(unit="pt", format="A4")
    if password:
        pdf.set_encryption(owner_password="owner-" + password, user_password=password)
    pdf.add_page()
    pdf.set_font("Helvetica", size=8)
    t = pdf.text
    t(40, 40, "Consolidated Account Statement")
    t(40, 52, "01-Apr-2025 To 25-Nov-2026")
    t(40, 70, "Email Id: riya.test@example.com")
    t(40, 82, "RIYA MEHTA")
    t(40, 94, "12 TEST ROAD PUNE 411001")
    t(40, 106, "Mobile: +919000000000")
    t(400, 40, "CAMSCASWS-000001")
    y = 140
    for x, s in ((40, "Date"), (110, "Transaction"), (330, "Amount"), (400, "Units"), (460, "NAV"), (520, "Unit")):
        t(x, y, s)
    for x, s in ((330, "(INR)"), (460, "(INR)"), (515, "Balance")):
        t(x, y + 9, s)
    y = 175
    lines = [
        "Parag Parikh Mutual Fund",
        f"Folio No: 12345678 / 0   PAN: {PAN}   KYC: OK  PAN: OK",
        "RIYA MEHTA",
        "PPFAS-PP001ZG-Parag Parikh Flexi Cap Fund - Direct Plan Growth - ISIN: INF879O01027"
        "(Advisor: DIRECT) Registrar : CAMS",
        "Opening Unit Balance: 0.000",
    ]
    for s in lines:
        t(40, y, s)
        y += 12
    rows = [("05-Jan-2026", "Purchase - Systematic", "5,000.00", "62.500", "80.0000", "62.500"),
            ("05-Feb-2026", "Purchase - Systematic", "5,000.00", "60.976", "82.0000", "123.476"),
            ("05-Mar-2026", "Purchase - Systematic", "5,000.00", "59.524", "84.0000", "183.000"),
            ("10-Jun-2026", "Redemption", "(1,700.00)", "(20.000)", "85.0000", "163.000")]
    for d, desc, amt, units, nav, bal in rows:
        t(40, y, d)
        t(110, y, desc)
        for right, s in ((360, amt), (425, units), (485, nav), (545, bal)):
            t(right - pdf.get_string_width(s), y, s)
        y += 12
    t(40, y, "Closing Unit Balance: 163.000   NAV on 25-Nov-2026: INR 90.0000   "
             "Total Cost Value: 13,300.00   Market Value on 25-Nov-2026: INR 14,670.00")
    return bytes(pdf.output())


@pytest.fixture(scope="module")
def statement():
    return read_cas(cams_pdf(), PAN)


def test_reads_a_cams_statement_into_holdings(statement):
    assert statement["source"] == "CAMS"
    assert statement["detailed"] is True
    assert statement["statementTo"] == "2026-11-25"
    (h,) = statement["holdings"]
    assert h["kind"] == "mf"
    assert h["name"] == "Parag Parikh Flexi Cap Fund - Direct Plan Growth"
    assert h["isin"] == "INF879O01027"
    assert h["amfi"]  # filled from casparser's ISIN table
    assert h["folio"] == "5678"
    assert h["units"] == pytest.approx(163.0)
    assert h["value"] == pytest.approx(14670.0)
    assert h["cost"] == pytest.approx(13300.0)
    assert [t["type"] for t in h["transactions"]] == ["PURCHASE_SIP"] * 3 + ["REDEMPTION"]
    assert h["transactions"][0] == {"date": "2026-01-05", "type": "PURCHASE_SIP", "amount": 5000.0,
                                    "units": pytest.approx(62.5, abs=0.01), "nav": 80.0}
    assert h["transactions"][-1]["amount"] < 0  # money out of the fund


def test_drops_everything_that_identifies_the_investor(statement):
    text = json.dumps(statement)
    for secret in ("RIYA", "MEHTA", PAN, "example.com", "9000000000", "411001", "12345678"):
        assert secret not in text


@pytest.mark.parametrize("password,code", [(None, "password_required"), ("WRONG1234X", "password_incorrect")])
def test_asks_for_the_right_password(password, code):
    with pytest.raises(DocumentError) as e:
        read_cas(cams_pdf(), password)
    assert e.value.code == code


def test_rejects_a_pdf_that_is_not_a_cas():
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.text(20, 20, "Electricity bill for November")
    with pytest.raises(DocumentError) as e:
        read_cas(bytes(pdf.output()), "anything")
    assert e.value.code == "not_a_cas"


def test_route_needs_the_internal_key_and_returns_holdings():
    files = {"file": ("cas.pdf", cams_pdf(), "application/pdf")}
    assert client.post("/documents/cas", files=files, data={"password": PAN}).status_code == 403
    r = client.post("/documents/cas", files=files, data={"password": PAN}, headers=GOOD_KEY)
    assert r.status_code == 200
    assert r.json()["holdings"][0]["isin"] == "INF879O01027"
    r = client.post("/documents/cas", files=files, headers=GOOD_KEY)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "password_required"
