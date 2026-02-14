"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export function AnimeNavBar({ items, className, activeTab, onTabChange, isDark = true }) {
    const [mounted, setMounted] = useState(false)
    const [hoveredTab, setHoveredTab] = useState(null)
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768)
        }

        handleResize()
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    if (!mounted) return null

    return (
        <div className={cn("fixed bottom-6 left-0 right-0 z-[9999] px-4", className)}>
            <div className="flex justify-center">
                <motion.div
                    className={cn(
                        "flex items-center gap-2 py-2 px-2 rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative border backdrop-blur-[40px] transition-all duration-500",
                        isDark
                            ? "bg-black/90 border-white/20"
                            : "bg-white/95 border-black/10"
                    )}
                    initial={false}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{
                        type: "spring",
                        stiffness: 260,
                        damping: 20,
                    }}
                >
                    {items.map((item) => {
                        const Icon = item.icon
                        const isActive = activeTab === item.id
                        const isHovered = hoveredTab === item.id

                        return (
                            <div
                                key={item.id}
                                onClick={() => onTabChange(item.id)}
                                onMouseEnter={() => setHoveredTab(item.id)}
                                onMouseLeave={() => setHoveredTab(null)}
                                className={cn(
                                    "relative cursor-pointer text-sm font-bold px-6 py-4 rounded-full transition-all duration-300 flex items-center gap-3",
                                    isDark
                                        ? "text-white/50 hover:text-white"
                                        : "text-black/40 hover:text-black",
                                    isActive && (isDark ? "text-white" : "text-black")
                                )}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="active-nav-indicator"
                                        className="absolute inset-0 rounded-full -z-10"
                                        transition={{
                                            type: "spring",
                                            stiffness: 260,
                                            damping: 28
                                        }}
                                    >
                                        <motion.div
                                            className="absolute inset-0 rounded-full overflow-hidden"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ duration: 0.3 }}
                                        >
                                            <div className={cn(
                                                "absolute inset-0 rounded-full blur-md opacity-60",
                                                isDark ? "bg-primary/40" : "bg-primary/20"
                                            )} />
                                            <div className={cn(
                                                "absolute inset-[-4px] rounded-full blur-xl opacity-40",
                                                isDark ? "bg-primary/30" : "bg-primary/10"
                                            )} />

                                            <div
                                                className={cn(
                                                    "absolute inset-0 bg-gradient-to-r from-transparent to-transparent",
                                                    isDark ? "via-white/10" : "via-black/5"
                                                )}
                                                style={{
                                                    animation: "shine 2s ease-in-out"
                                                }}
                                            />
                                        </motion.div>
                                    </motion.div>
                                )}

                                <div className="relative z-10 flex items-center justify-center">
                                    <Icon size={22} strokeWidth={2.5} className={cn("transition-transform duration-300", isActive && "scale-110")} />
                                </div>

                                <motion.span
                                    className="hidden md:inline relative z-10 whitespace-nowrap"
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={isActive ? { opacity: 1, width: "auto" } : { opacity: 0, width: 0 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    {item.label}
                                </motion.span>

                                <AnimatePresence>
                                    {isHovered && !isActive && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                            className={cn(
                                                "absolute inset-0 rounded-full -z-10",
                                                isDark ? "bg-white/10" : "bg-black/5"
                                            )}
                                        />
                                    )}
                                </AnimatePresence>

                            </div>
                        )
                    })}
                </motion.div>
            </div>
        </div>
    )
}
