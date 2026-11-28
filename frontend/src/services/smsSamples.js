/* Made-up bank SMS for testing the import on a phone with no bank
   messages. Only in builds made with VITE_SMS_TEST=1, never in a release.

   The times are fixed per day, so sending them twice on the same day shows
   the second round as already on record. */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n) => String(n).padStart(2, "0");

export const SMS_TEST_BUILD = import.meta.env.VITE_SMS_TEST === "1";

export function sampleMessages(now = Date.now()) {
    const d = new Date(now - 86_400_000);
    d.setHours(10, 0, 0, 0);
    const at = (h) => d.getTime() + h * 3_600_000;
    const dd = pad(d.getDate()), mm = pad(d.getMonth() + 1), yy = pad(d.getFullYear() % 100), mon = MON[d.getMonth()];
    return [
        { sender: "VM-HDFCBK", receivedAt: at(0),
          body: `Sent Rs.450.00 From HDFC Bank A/C *4321 To SWIGGY On ${dd}/${mm}/${yy} Ref 412345678901 Not You? Call 18002586161` },
        { sender: "JD-SBIINB-T", receivedAt: at(1),
          body: `Dear UPI user A/C X5678 debited by 250.0 on date ${dd}${mon}${yy} trf to ZOMATO Refno 412345678902 -SBI` },
        { sender: "AD-ICICIT-S", receivedAt: at(2),
          body: `Dear Customer, Acct XX789 is credited with Rs 52,000.00 on ${dd}-${mon}-${yy} from ACME PVT LTD. UPI:412345678903-ICICI Bank.` },
        // Must be dropped: an OTP, a balance and a message from an unknown sender
        { sender: "VM-HDFCBK", receivedAt: at(3),
          body: "123456 is the OTP for txn of Rs 999.00 at AMAZON on HDFC Bank Card x1234. Do not share." },
        { sender: "VM-AXISBK", receivedAt: at(4),
          body: `Your A/c no. XX1234 has Avl Bal of Rs 12,000.00 as on ${dd}-${mm}-${yy}.` },
        { sender: "VM-NEWBNK", receivedAt: at(5),
          body: "Rs 300.00 debited from A/c XX1111 to PAYTM." },
    ];
}
