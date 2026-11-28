import { rupees } from "../../utils/money";
import { pauseToInvest } from "../../utils/investMath";
import { openFutureTwin, useOwnXirr } from "../../hooks/useOwnXirr";

/*
 * Pause → Invest: the money a pause kept, shown invested. Arithmetic only,
 * at three stated rates (and the user's own portfolio XIRR, when known);
 * nothing moves and no fund is suggested.
 */

export default function PauseInvest({ amount, years = 5, className = "", textClass = "", linkClass = "" }) {
    const ownXirr = useOwnXirr();
    const p = pauseToInvest(amount, years, ownXirr);
    if (!p) return null;
    return (
        <div className={className} aria-label="Pause → Invest">
            <p className={textClass}>
                Invested for {years} years, {rupees(amount)} could be{" "}
                {p.at.map((a, i) => (
                    <span key={a.rate}>{i > 0 && (i === p.at.length - 1 ? " or " : ", ")}<b>{rupees(a.value)}</b> at {a.rate}%</span>
                ))} a year.
                {p.own && <> At your portfolio's {p.own.rate}% so far, about <b>{rupees(p.own.value)}</b>.</>}
                {" "}Past returns aren't a promise.
            </p>
            <button type="button" className={linkClass} onClick={openFutureTwin}>See it in Future Twin</button>
        </div>
    );
}
