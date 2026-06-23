function TransactionSkeleton() {

    return (

        <div className="
            animate-pulse
            space-y-4
        ">

            {[1,2,3,4,5].map((item) => (

                <div
                    key={item}
                    className="
                        bg-white/[0.03]
                        p-4
                        rounded-2xl
                        border
                        border-white/10
                        flex
                        justify-between
                    "
                >

                    <div className="
                        h-5
                        w-40
                        bg-zinc-800
                        rounded
                    "></div>

                    <div className="
                        h-5
                        w-24
                        bg-zinc-800
                        rounded
                    "></div>

                </div>
            ))}

        </div>
    );
}

export default TransactionSkeleton;