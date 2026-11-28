import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui";
import FundPage from "./FundPage";
import StockPage from "./StockPage";
import { DepositPage, IpoPage, BasicPage } from "./OtherPages";
import { pageKind } from "../../utils/investMath";

/*
 * One holding, opened from the portfolio. Each kind gets the page the big
 * apps give it: funds a NAV chart and calculator, stocks a price chart and
 * 52-week range, deposits their interest, IPOs their timeline.
 */

export default function HoldingPage({ holding, onBack, onEdit, onDelete }) {
    const kind = pageKind(holding);
    const [confirming, setConfirming] = useState(false);
    return (
        <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-4 -ml-2">
                <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>Holdings</Button>
                <span className="flex gap-1">
                    {onEdit && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(holding)}>Edit</Button>}
                    {onDelete && !confirming && <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirming(true)}>Remove</Button>}
                    {onDelete && confirming && (
                        <Button variant="ghost" size="sm" className="text-bad" onClick={() => onDelete(holding)}>Remove it from FinTwin?</Button>
                    )}
                </span>
            </div>
            {kind === "fund" && <FundPage code={holding.tickerCode.trim()} name={holding.name} holding={holding} />}
            {kind === "stock" && <StockPage symbol={holding.tickerCode.trim()} name={holding.name} holding={holding} />}
            {kind === "deposit" && <DepositPage holding={holding} />}
            {kind === "ipo" && <IpoPage holding={holding} />}
            {kind === "basic" && <BasicPage holding={holding}
                hint={holding.type === "Mutual Fund" ? "Import your CAS, or edit this fund and pick it from the search, to see its NAV chart and past returns."
                    : holding.type === "Stocks" ? "Edit this holding and add its NSE symbol to see the price chart." : null} />}
        </div>
    );
}
