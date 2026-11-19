"""Made-up QR codes and times shared by the tests."""
from datetime import datetime
from zoneinfo import ZoneInfo

IST = ZoneInfo("Asia/Kolkata")
NOON = datetime(2026, 11, 19, 14, 0, tzinfo=IST)      # a Thursday
LATE = datetime(2026, 11, 19, 23, 10, tzinfo=IST)

CAFE = "upi://pay?pa=chaipoint@icici&pn=Chai%20Point&mc=5814&cu=INR"     # Food
ZARA = "upi://pay?pa=zara.store@hdfcbank&pn=Zara&mc=5651"                # Shopping
GROCER = "upi://pay?pa=dmart@hdfcbank&pn=DMart&mc=5411"                  # Groceries
BETTING = "upi://pay?pa=quickbet@ybl&pn=QuickBet&mc=7995"
PERSON = "upi://pay?pa=9876543210@ybl&pn=Ravi%20Kumar&tn=rent%20share"
