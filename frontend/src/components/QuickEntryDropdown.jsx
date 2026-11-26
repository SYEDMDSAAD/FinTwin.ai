import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Button, cx } from "./ui";

/*
 * Adding money by hand: "Swiggy 450" or "Salary 50000", out or in. Folded
 * behind one button next to the statement import, so the list stays first.
 */
function QuickEntryDropdown({ incomeText, setIncomeText, addIncome, expenseText, setExpenseText, addExpense, onImport }) {
    const [open, setOpen] = useState(false);
    const [kind, setKind] = useState("out");
    const out = kind === "out";
    const value = out ? expenseText : incomeText;
    const setValue = out ? setExpenseText : setIncomeText;
    const add = out ? addExpense : addIncome;

    return (
        <div className="mb-6">
            <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button variant={open ? "soft" : "secondary"} icon={Plus} onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-w-0">
                    Add
                </Button>
                {onImport && (
                    <Button variant="secondary" icon={Upload} onClick={onImport} className="min-w-0">
                        Import
                    </Button>
                )}
            </div>

            {open && (
                <div className="mt-3 p-4 rounded-card bg-surface border border-line">
                    <div role="radiogroup" aria-label="Money in or out" className="inline-flex p-1 rounded-full bg-surface-sunken">
                        {[["out", "Money out"], ["in", "Money in"]].map(([k, label]) => (
                            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                                    className={cx("h-8 px-4 rounded-full text-small font-medium transition-colors",
                                        kind === k ? "bg-surface text-ink shadow-[0_1px_2px_rgba(17,17,26,0.08)]" : "text-ink-3")}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                        <input
                            type="text"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
                            placeholder={out ? "Swiggy 450" : "Salary 50000"}
                            aria-label={out ? "Add expense" : "Add income"}
                            className="flex-1 min-w-0 h-11 rounded-control bg-surface-sunken border border-transparent px-3 text-body text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent"
                        />
                        <Button onClick={add}>Add</Button>
                    </div>
                    <p className="mt-2 text-caption text-ink-3">Name and amount. FinTwin picks the category.</p>
                </div>
            )}
        </div>
    );
}

export default QuickEntryDropdown;
