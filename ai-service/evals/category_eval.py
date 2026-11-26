"""Offline eval: can the sorting agent trust the model's "sure" answers?

The backend's sorting agent applies a category on its own only when the
model says it is sure, so what matters is precision among sure answers: a
wrong sure answer silently moves money into the wrong budget. This script
runs made-up payee names (no real user data) through the live model and
reports, for sure answers, how many were right, and how often a vague name
was wrongly marked sure.

Usage (needs the model the service is configured for, e.g. Vertex ADC):
    python evals/category_eval.py [runs, default 1]

Exit code is 1 when sure precision falls below SURE_PRECISION_FLOOR, so a
prompt or model change that makes the agent less trustworthy fails loudly.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from categories.suggest import suggest  # noqa: E402

SURE_PRECISION_FLOOR = 0.95

# Made-up statement payees. None = the name alone can't say; a good model
# answers Unknown or "not sure" for these.
CASES = {
    # Well-known brands
    "SWIGGY": "Food", "ZOMATO LTD": "Food", "BLINKIT": "Groceries", "BIGBASKET": "Groceries",
    "UBER INDIA": "Transport", "OLA CABS": "Transport", "INDIAN OIL PETROL PUMP": "Transport",
    "IRCTC": "Travel", "INDIGO AIRLINES": "Travel", "MAKEMYTRIP": "Travel",
    "AMAZON PAY": "Shopping", "MYNTRA": "Shopping", "CROMA RETAIL": "Shopping",
    "JIO PREPAID": "Bills", "TATA POWER": "Bills", "BESCOM": "Bills",
    "BOOKMYSHOW": "Entertainment", "NETFLIX": "Entertainment", "PVR CINEMAS": "Entertainment",
    "APOLLO PHARMACY": "Health", "CULT FIT": "Health", "PRACTO": "Health",
    "ZERODHA": "Investments", "GROWW": "Investments", "BAJAJ FINANCE EMI": "EMI",
    "BYJUS": "Education", "UNACADEMY": "Education", "NOBROKER RENT": "Housing",
    # Names that say what the business is
    "SRI SAI MEDICALS": "Health", "CITY DIAGNOSTIC CENTRE": "Health",
    "FRESH FRUITS AND VEGETABLES": "Groceries", "ANNAPURNA KIRANA STORE": "Groceries",
    "HOTEL SARAVANA BHAVAN": "Food", "MEGHANA BIRYANI": "Food", "IYENGAR BAKERY": "Food",
    "RAJ AUTO SERVICE CENTRE": "Transport", "SHELL FUEL STATION": "Transport",
    "GREEN VALLEY PUBLIC SCHOOL": "Education", "SUNRISE COACHING CLASSES": "Education",
    "PRESTIGE APARTMENT MAINTENANCE": "Housing", "URBAN COMPANY": "Housing",
    "LAKSHMI TEXTILES": "Shopping", "MOBILE WORLD ELECTRONICS": "Shopping",
    # Vague: owner names, trading houses, unclear words
    "SHARMA TRADERS": None, "KRISHNA ENTERPRISES": None, "SV ASSOCIATES": None,
    "GLOBAL SOLUTIONS PVT LTD": None, "MAHALAXMI AGENCIES": None, "RK INDUSTRIES": None,
    "BALAJI CORPORATION": None, "NEW STAR VENTURES": None, "OM SAI SERVICES": None,
    "AB HOLDINGS": None, "SUNSHINE INTERNATIONAL": None, "JAI HIND MART": None,
}


def run_once() -> dict:
    out = suggest(list(CASES))
    sure_right = sure_wrong = sure_vague = clear_total = clear_sure = 0
    wrong = []
    for payee, expected in CASES.items():
        got, sure = out["suggestions"].get(payee), out["sure"].get(payee, False)
        if expected is None:
            if sure:
                sure_vague += 1
                wrong.append(f"{payee}: vague but sure → {got}")
            continue
        clear_total += 1
        if sure:
            clear_sure += 1
            if got == expected:
                sure_right += 1
            else:
                sure_wrong += 1
                wrong.append(f"{payee}: sure {got}, expected {expected}")
    sure_total = sure_right + sure_wrong + sure_vague
    return {
        "complete": out["complete"],
        "sure_precision": sure_right / sure_total if sure_total else 1.0,
        "coverage": clear_sure / clear_total if clear_total else 0.0,
        "vague_marked_sure": sure_vague,
        "mistakes": wrong,
    }


def main() -> int:
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    worst = 1.0
    for i in range(runs):
        r = run_once()
        worst = min(worst, r["sure_precision"])
        print(f"run {i + 1}: sure precision {r['sure_precision']:.0%}, applied on its own for "
              f"{r['coverage']:.0%} of clear names, vague names marked sure: {r['vague_marked_sure']}, "
              f"complete: {r['complete']}")
        for m in r["mistakes"]:
            print("   ", m)
    return 0 if worst >= SURE_PRECISION_FLOOR else 1


if __name__ == "__main__":
    sys.exit(main())
