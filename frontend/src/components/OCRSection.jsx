import { ImagePlus, Check } from "lucide-react";
import { Button, cx } from "./ui";

/*
 * One receipt or payment screenshot in, its transactions out. Statements
 * with many rows go through Add data instead.
 */
function OCRSection({ selectedFile, setSelectedFile, uploadScreenshot }) {
    return (
        <section aria-label="Receipts" className="max-w-2xl">
            <div className="px-1 mb-5">
                <h2 className="text-title text-ink">Add from a screenshot</h2>
                <p className="mt-1 text-body text-ink-2">
                    A receipt, UPI history or wallet screen. FinTwin reads the payments,
                    sorts them into categories and adds them to your list.
                </p>
            </div>

            <label
                htmlFor="screenshot-upload"
                className={cx(
                    "flex flex-col items-center justify-center text-center gap-2 h-48 px-6 rounded-card border-2 border-dashed cursor-pointer transition-colors",
                    selectedFile ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-accent"
                )}
            >
                <span className="w-12 h-12 rounded-full bg-accent-soft text-accent flex items-center justify-center">
                    {selectedFile ? <Check size={22} aria-hidden /> : <ImagePlus size={22} aria-hidden />}
                </span>
                {selectedFile ? (
                    <>
                        <span className="text-body font-medium text-ink truncate max-w-full">{selectedFile.name}</span>
                        <span className="text-small text-ink-3">Tap to choose a different image</span>
                    </>
                ) : (
                    <>
                        <span className="text-body font-medium text-ink">Choose an image</span>
                        <span className="text-small text-ink-3">PNG or JPG</span>
                    </>
                )}
            </label>
            <input
                id="screenshot-upload"
                type="file"
                accept="image/*"
                onChange={(e) => setSelectedFile(e.target.files[0])}
                className="hidden"
            />

            <Button size="lg" className="w-full mt-4" disabled={!selectedFile} onClick={uploadScreenshot}>
                Read payments
            </Button>
            <p className="mt-3 text-small text-ink-3 text-center">Bank statements with many rows go under Add data.</p>
        </section>
    );
}

export default OCRSection;
