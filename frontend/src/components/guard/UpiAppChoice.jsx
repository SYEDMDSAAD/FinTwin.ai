import { ExternalLink } from "lucide-react";
import { BACKUP_APPS, isPhone, openUpi } from "./format";
import PayQr from "./PayQr";

/**
 * After a payment is handed over. On a phone: Google Pay again, or PhonePe or
 * Paytm when Google Pay didn't open (not installed, or the user doesn't use
 * it). On a computer: the payment as a QR code to scan with the phone. The
 * link is the same one either way; only how it reaches the app changes.
 */
export default function UpiAppChoice({ link, children }) {
    // A computer has no UPI app: show the same payment as a code to scan with the phone
    if (!isPhone()) {
        return (
            <>
                <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 12px" }}>
                    <PayQr link={link} />
                </div>
                <p className="sg-sub" style={{ margin: "0 0 12px" }}>
                    Open Google Pay on your phone, tap Scan, and point it at this code. The payee and amount
                    are filled in, and you approve it there with your PIN. PhonePe and Paytm can scan it too.
                </p>
                {children && <div className="sg-row">{children}</div>}
            </>
        );
    }
    return (
        <>
            <div className="sg-row">
                <button type="button" className="sg-btn" onClick={() => openUpi(link)}>
                    <ExternalLink size={15} /> Open Google Pay again
                </button>
                {children}
            </div>
            <p className="sg-sub" style={{ margin: "12px 0 8px" }} id="sg-backup-apps">
                Google Pay didn't open, or you don't use it? Pay with:
            </p>
            <div className="sg-row" role="group" aria-labelledby="sg-backup-apps">
                {BACKUP_APPS.map((a) => (
                    <button key={a.id} type="button" className="sg-btn" onClick={() => openUpi(link, a.id)}>
                        {a.name}
                    </button>
                ))}
            </div>
        </>
    );
}
