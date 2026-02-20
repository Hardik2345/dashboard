import {
    LayoutGrid,
    ShieldCheck,
    Store,
    Table2,
    Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

const MOBILE_NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'product-conversion', label: 'Conversion', icon: Table2 },
    { id: 'alerts', label: 'Alerts', icon: Bell },
    { id: 'access', label: 'Access', icon: ShieldCheck },
    { id: 'brands', label: 'Setup', icon: Store },
];

export default function MobileNav({ activeTab, onTabChange, darkMode }) {
    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-[92%] max-w-[400px]">
            <div className={cn(
                "flex items-center justify-around p-2 rounded-[24px] shadow-2xl border transition-all duration-300",
                "bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50"
            )}>
                {MOBILE_NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className={cn(
                                "flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all duration-200 min-w-[64px]",
                                isActive ? "text-[#009688]" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                            )}
                        >
                            <div className={cn(
                                "p-1 rounded-lg transition-transform duration-200",
                                isActive && "scale-110"
                            )}>
                                <Icon size={20} className={isActive ? "text-[#009688]" : "text-zinc-400"} />
                            </div>
                            <span className={cn(
                                "text-[10px] font-semibold transition-all duration-200",
                                isActive ? "opacity-100 translate-y-0" : "opacity-70"
                            )}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
