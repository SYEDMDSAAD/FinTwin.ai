import GlassCard from "./GlassCard";

import API from "../services/api";

import { useState } from "react";

import {
    CheckCircle,
    X
} from "lucide-react";

function NotificationCard({
    children,
    style,
    className
}) {

    const [transform, setTransform] =
        useState(
            "perspective(1000px) rotateX(0deg) rotateY(0deg)"
        );

    const handleMove = (e) => {

        const rect =
            e.currentTarget.getBoundingClientRect();

        const x =
            e.clientX - rect.left;

        const y =
            e.clientY - rect.top;

        const rotateY =
            ((x / rect.width) - 0.5) * 10;

        const rotateX =
            ((y / rect.height) - 0.5) * -10;

        setTransform(
            `
            perspective(1000px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            `
        );
    };

    const handleLeave = () => {

        setTransform(
            `
            perspective(1000px)
            rotateX(0deg)
            rotateY(0deg)
            `
        );
    };

    return (

        <div
            onMouseMove={handleMove}
            onMouseLeave={handleLeave}
            className={className}
            style={{
                transform,
                transition:
                    "transform 120ms ease-out",
                transformStyle:
                    "preserve-3d",
                ...style
            }}
        >

            <div
                className="
                    absolute
                    inset-0
                    opacity-0
                    hover:opacity-100
                    transition-opacity
                    duration-300
                    pointer-events-none
                    bg-gradient-to-r
                    from-white/[0.03]
                    to-transparent
                "
            />

            {children}

        </div>
    );
}

function SmartNotifications({

    notifications,

    setNotifications

}) {

    // =========================
    // DELETE NOTIFICATION
    // =========================

    const removeNotification =
        async (index) => {

            try {

                await API.delete(
                    `/notifications/${index}`
                );

                setNotifications((prev) =>

                    prev.filter(
                        (_, i) =>
                            i !== index
                    )
                );

            } catch (error) {

                console.log(error);
            }
        };

    // =========================
    // Empty State
    // =========================

    if (!notifications?.length) {

        return (

            <GlassCard className="p-6 mb-10">

                <div className="
                    flex
                    items-center
                    gap-4
                ">

                    <div className="
                        p-4
                        rounded-2xl
                        bg-green-500/20
                    ">

                        <CheckCircle
                            size={32}
                            className="
                                text-green-400
                            "
                        />

                    </div>

                    <div>

                        <h2 className="
                            text-2xl
                            font-bold
                            text-green-400
                        ">
                            No Notifications
                        </h2>

                        <p className="
                            text-zinc-400
                            mt-1
                        ">
                            Everything looks good financially.
                        </p>

                    </div>

                </div>

            </GlassCard>
        );
    }

    // =========================
    // Helpers
    // =========================

    const getAlertColor = (type) => {

        switch (type) {

            case "danger":
                return "#ef4444";

            case "warning":
                return "#f59e0b";

            case "success":
                return "#22c55e";

            default:
                return "#06b6d4";
        }
    };

    // =========================
    // UI
    // =========================

    return (

        <GlassCard
            className="
                p-7
                mb-8
                border
                border-white/10
                bg-white/[0.03]
                backdrop-blur-xl
            "
        >

            {/* Header */}

            <div
                className="
                    flex
                    items-center
                    justify-between
                    mb-5
                "
            >

                <div>

                    <div
                        className="
                            text-[11px]
                            font-bold
                            tracking-[0.12em]
                            text-zinc-500
                        "
                    >
                        SMART ALERTS
                    </div>

                    <h2
                        className="
                            text-lg
                            font-bold
                            text-white
                            mt-1
                        "
                    >
                        Smart Notifications
                    </h2>

                </div>

                <div
                    className="
                        px-3
                        py-1
                        rounded-lg
                        text-xs
                        font-bold
                        border
                        border-red-500/20
                        bg-red-500/10
                        text-red-400
                    "
                >
                    {notifications.length} Alerts
                </div>

            </div>

            {/* Notifications */}

            <div
                className="
                    flex
                    flex-col
                    gap-2
                "
                style={{
                    perspective: "1200px"
                }}
            >

                {notifications.map(
                    (
                        notification,
                        index
                    ) => {

                        return (

                            <NotificationCard
                                key={`${notification.type}-${index}`}
                                className="
                                    relative
                                    flex
                                    items-start
                                    gap-3
                                    p-4
                                    rounded-xl
                                    border
                                    border-white/8
                                    bg-white/[0.02]
                                    transition-all
                                    duration-200
                                    hover:bg-white/[0.05]
                                    hover:border-white/15
                                    will-change-transform
                                "
                                style={{
                                    borderLeft: `3px solid ${getAlertColor(notification.type)}`
                                }}
                            >

                                {/* Close Button */}

                                <button
                                    onClick={() =>
                                        removeNotification(index)
                                    }
                                    className="
                                        absolute
                                        top-4
                                        right-4
                                        p-1
                                        rounded-md
                                        hover:bg-white/10
                                        transition
                                        z-20
                                    "
                                >

                                    <X
                                        size={18}
                                        className="
                                            text-zinc-400
                                        "
                                    />

                                </button>

                                {/* Content */}

                                <div className="
                                    flex
                                    items-start
                                    gap-4
                                    relative
                                    z-10
                                ">

                                    <div
                                        className="
                                            w-8
                                            h-8
                                            rounded-lg
                                            flex
                                            items-center
                                            justify-center
                                            text-sm
                                            flex-shrink-0
                                        "
                                        style={{
                                            background:
                                                `${getAlertColor(notification.type)}15`
                                        }}
                                    >

                                        {notification.type === "danger" && "🚨"}
                                        {notification.type === "warning" && "⚠️"}
                                        {notification.type === "success" && "✓"}
                                        {notification.type === "info" && "💡"}

                                    </div>

                                    <div className="pr-8">

                                        <p
                                            className="
                                                text-sm
                                                font-medium
                                                text-zinc-200
                                                leading-6
                                            "
                                        >

                                            {
                                                notification.message
                                            }

                                        </p>

                                        {/* Timestamp */}

                                        <p className="
                                            text-[11px]
                                            text-zinc-500
                                            mt-1
                                        ">

                                            {
                                                notification.time
                                                || "Just now"
                                            }

                                        </p>

                                    </div>

                                </div>

                            </NotificationCard>
                        );
                    }
                )}

            </div>

        </GlassCard>
    );
}

export default SmartNotifications;