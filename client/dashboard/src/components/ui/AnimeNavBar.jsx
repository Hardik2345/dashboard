"use client"

import React, { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

export function AnimeNavBar({ items, className, activeTab, onTabChange }) {
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
                    className="flex items-center gap-1 bg-black/80 border border-white/10 backdrop-blur-xl py-2 px-2 rounded-full shadow-2xl relative"
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
                                    "relative cursor-pointer text-xs font-bold px-4 py-3 rounded-full transition-all duration-300 flex items-center gap-2",
                                    "text-white/60 hover:text-white",
                                    isActive && "text-white"
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
                                            <div className="absolute inset-0 bg-primary/30 rounded-full blur-md" />
                                            <div className="absolute inset-[-4px] bg-primary/20 rounded-full blur-xl" />

                                            <div
                                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                                                style={{
                                                    animation: "shine 2s ease-in-out"
                                                }}
                                            />
                                        </motion.div>
                                    </motion.div>
                                )}

                                <div className="relative z-10 flex items-center justify-center">
                                    <Icon size={18} strokeWidth={2.5} className={cn("transition-transform duration-300", isActive && "scale-110")} />
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
                                            className="absolute inset-0 bg-white/10 rounded-full -z-10"
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
