import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, ArrowLeft } from "lucide-react";

function BankConnectedPage() {

    const [params] = useSearchParams();

    const status  = params.get("status") || params.get("fi") || "";
    const FAILURE = ["REJECTED", "FAILED", "EXPIRED", "DENIED"];
    const success = !FAILURE.includes(status.toUpperCase());

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
            <div className="text-center space-y-4 p-8 max-w-sm">
                {success ? (
                    <>
                        <CheckCircle2 size={56} className="text-green-400 mx-auto" />
                        <h1 className="text-2xl font-bold text-white">Bank Connected!</h1>
                        <p className="text-zinc-400 text-sm">
                            Your consent was approved. Bank transactions, mutual fund holdings, stock portfolio and NPS data will sync to your dashboard automatically.
                        </p>
                        <p className="text-zinc-500 text-xs">You can close this tab and return to your dashboard.</p>
                    </>
                ) : (
                    <>
                        <XCircle size={56} className="text-red-400 mx-auto" />
                        <h1 className="text-2xl font-bold text-white">Consent Not Approved</h1>
                        <p className="text-zinc-400 text-sm">
                            You can try again from your dashboard whenever you're ready.
                        </p>
                        <p className="text-zinc-500 text-xs">You can close this tab and return to your dashboard.</p>
                    </>
                )}
                <button
                    onClick={() => window.close()}
                    className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-all"
                >
                    <ArrowLeft size={14} />
                    Close this tab
                </button>
            </div>
        </div>
    );
}

export default BankConnectedPage;
