import GlassCard from "./GlassCard";

function OCRSection({

    selectedFile,
    setSelectedFile,
    uploadScreenshot

}) {

    return (

        <GlassCard
            className="
                relative
                overflow-hidden
                p-6
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            "
        >

            <div
                className="
                    absolute
                    inset-x-0
                    top-0
                    h-px
                    bg-gradient-to-r
                    from-transparent
                    via-white/20
                    to-transparent
                "
            />

            <div
                className="
                    flex
                    items-center
                    gap-3
                    mb-6
                "
            >

                <div
                    className="
                        w-10
                        h-10
                        rounded-xl
                        flex
                        items-center
                        justify-center
                        bg-cyan-500/10
                        border
                        border-cyan-500/20
                    "
                >
                    📸
                </div>

                <div>

                    <div
                        className="
                            text-[11px]
                            font-bold
                            tracking-[0.12em]
                            text-zinc-500
                        "
                    >
                        OCR UPLOADS
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                        "
                    >
                        Upload Screenshot
                    </h2>

                </div>

            </div>

            <div className="
                flex
                flex-col
                gap-5
            ">

                <p
                    className="
                        text-sm
                        text-zinc-400
                        leading-relaxed
                        mb-5
                        max-w-2xl
                    "
                >
                    Upload a screenshot of your bank statement, UPI history,
                    wallet transactions, or expense records. FinTwin AI will
                    automatically extract the transactions, categorize them,
                    and add them to your transaction history for analysis,
                    budgeting, and financial insights.
                </p>

                {/* =========================
                    Upload Area
                ========================= */}

                <label

                    htmlFor="screenshot-upload"

                    className="
                        border-2
                        border-dashed
                        border-purple-500/25
                        rounded-2xl
                        h-44
                        flex
                        flex-col
                        items-center
                        justify-center
                        cursor-pointer
                        hover:border-purple-500/50
                        hover:bg-purple-500/[0.04]
                        transition-all
                        duration-200
                    "
                >

                    <div className="
                        text-4xl
                        mb-3
                    ">
                        📸
                    </div>

                    <p className="
                        text-sm
                        font-semibold
                        text-white
                    ">
                        Click to Upload Screenshot
                    </p>

                    <p className="
                        text-xs
                        text-zinc-500
                        mt-2
                    ">
                        PNG, JPG, JPEG — AI extracts transactions automatically
                    </p>

                    {selectedFile && (

                        <div
                            className="
                                mt-4
                                px-3
                                py-1
                                rounded-lg
                                text-xs
                                font-semibold
                                bg-green-500/10
                                border
                                border-green-500/20
                                text-green-400
                            "
                        >

                            ✓ {selectedFile.name}

                        </div>

                    )}

                </label>

                <input

                    id="screenshot-upload"

                    type="file"

                    accept="image/*"

                    onChange={(e) =>
                        setSelectedFile(
                            e.target.files[0]
                        )
                    }

                    className="hidden"
                />

                {/* =========================
                    Upload Button
                ========================= */}

                <button

                    onClick={uploadScreenshot}

                    className="
                        w-full
                        py-3
                        rounded-xl
                        bg-gradient-to-r
                        from-cyan-500
                        to-purple-500
                        hover:opacity-90
                        transition-all
                        duration-200
                        text-sm
                        font-semibold
                    "
                >

                    Upload & Extract Transactions

                </button>

            </div>

        </GlassCard>
    );
}

export default OCRSection;