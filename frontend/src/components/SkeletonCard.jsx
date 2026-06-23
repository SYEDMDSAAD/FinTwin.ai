function SkeletonCard() {

    return (

        <div className="
            animate-pulse
            bg-zinc-900
            rounded-3xl
            p-6
            h-40
            border
            border-zinc-800
        ">

            <div className="
                h-5
                bg-zinc-800
                rounded
                w-1/2
                mb-5
            "></div>

            <div className="
                h-10
                bg-zinc-800
                rounded
                w-3/4
            "></div>

        </div>
    );
}

export default SkeletonCard;