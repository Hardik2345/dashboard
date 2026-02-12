import React, { useState } from 'react';
import {
    TrendingUp,
    Users,
    DollarSign,
    Activity,
    ArrowUpRight,
    ArrowDownRight,
    LayoutDashboard,
    BarChart3,
    Settings,
    Bell,
    Search,
    ChevronDown,
    Menu,
    X,
    LogOut
} from 'lucide-react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

const chartData = [
    { name: 'Mon', active: 4000, new: 2400 },
    { name: 'Tue', active: 3000, new: 1398 },
    { name: 'Wed', active: 2000, new: 9800 },
    { name: 'Thu', active: 2780, new: 3908 },
    { name: 'Fri', active: 1890, new: 4800 },
    { name: 'Sat', active: 2390, new: 3800 },
    { name: 'Sun', active: 3490, new: 4300 },
];

export function ModernDashboardDemo({ onClose }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    return (
        <div className="fixed inset-0 z-[9999] bg-background flex overflow-hidden animate-in fade-in zoom-in-95 duration-500">
            {/* Sidebar Overlay for Mobile */}
            {!isSidebarOpen && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden absolute top-4 left-4 z-50 bg-background border shadow-md"
                    onClick={() => setIsSidebarOpen(true)}
                >
                    <Menu className="h-5 w-5" />
                </Button>
            )}

            {/* Modern Sidebar */}
            <aside className={`
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        fixed lg:relative z-40 w-64 h-full border-r bg-card transition-transform duration-300 ease-in-out lg:translate-x-0
      `}>
                <div className="flex flex-col h-full">
                    <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                                <LayoutDashboard className="h-5 w-5 text-primary-foreground" />
                            </div>
                            <span className="font-bold text-xl tracking-tight">Tech It</span>
                        </div>
                        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="px-4 py-2 space-y-1">
                        <NavItem icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" active />
                        <NavItem icon={<BarChart3 className="h-4 w-4" />} label="Analytics" />
                        <NavItem icon={<Users className="h-4 w-4" />} label="Customers" />
                        <NavItem icon={<Bell className="h-4 w-4" />} label="Notifications" />
                    </div>

                    <div className="mt-auto p-4 space-y-4">
                        <Separator />
                        <NavItem icon={<Settings className="h-4 w-4" />} label="Settings" />
                        <div
                            onClick={onClose}
                            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer"
                        >
                            <LogOut className="h-4 w-4" />
                            Exit Demo
                        </div>
                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                            <p className="text-sm font-medium mb-1">Pro Plan</p>
                            <p className="text-xs text-muted-foreground mb-3">Refreshed UI is here.</p>
                            <Button size="sm" className="w-full text-xs">Explore</Button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/30 dark:bg-slate-950/20">
                {/* Top Header */}
                <header className="h-16 border-b bg-card/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-8">
                    <div className="flex items-center flex-1 max-w-md">
                        <div className="relative w-full">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search analytics..."
                                className="pl-9 h-9 bg-muted/50 border-none focus-visible:ring-1"
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="relative h-9 w-9">
                            <Bell className="h-4 w-4" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-card"></span>
                        </Button>
                        <Separator orientation="vertical" className="h-6" />
                        <div className="flex items-center gap-2 cursor-pointer group pl-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-bold text-[10px] ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                                JD
                            </div>
                            <div className="hidden sm:block text-left">
                                <p className="text-[11px] font-bold leading-none">John Doe</p>
                                <p className="text-[9px] text-muted-foreground leading-none mt-0.5">Admin</p>
                            </div>
                            <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-colors ml-1" />
                        </div>
                    </div>
                </header>

                {/* Dashboard Content */}
                <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight">Modern Analytics</h2>
                            <p className="text-muted-foreground mt-1">
                                Real-time insights for your connected brands.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" onClick={onClose} className="h-10 text-rose-500 border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-rose-900/50 dark:hover:bg-rose-950/30">
                                Close Demo
                            </Button>
                            <Button className="h-10 shadow-lg shadow-primary/20 px-6">
                                Download Data
                            </Button>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                        <ModernStatCard
                            title="Total Sales"
                            value="$128,430.00"
                            delta="+12.5%"
                            trend="up"
                            icon={<DollarSign className="h-4 w-4" />}
                        />
                        <ModernStatCard
                            title="New Users"
                            value="2,840"
                            delta="+18.2%"
                            trend="up"
                            icon={<Users className="h-4 w-4" />}
                        />
                        <ModernStatCard
                            title="Page Views"
                            value="1.2M"
                            delta="-2.4%"
                            trend="down"
                            icon={<BarChart3 className="h-4 w-4" />}
                        />
                        <ModernStatCard
                            title="Active Sessions"
                            value="573"
                            delta="+42"
                            trend="up"
                            icon={<Activity className="h-4 w-4" />}
                        />
                    </div>

                    {/* Chart Section */}
                    <Card className="shadow-none border border-border/50 bg-card overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-border/10 pb-6">
                            <div>
                                <CardTitle className="text-xl">Traffic Over Time</CardTitle>
                                <CardDescription>Comparison between active and new visitor sessions.</CardDescription>
                            </div>
                            <div className="flex rounded-lg border p-1 bg-muted/50">
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] px-3 font-bold">1H</Button>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] px-3 font-bold">1D</Button>
                                <Button variant="secondary" size="sm" className="h-7 text-[10px] px-3 font-bold shadow-sm">1W</Button>
                                <Button variant="ghost" size="sm" className="h-7 text-[10px] px-3 font-bold">1M</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-8">
                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={chartData}>
                                        <defs>
                                            <linearGradient id="colorActive" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                            </linearGradient>
                                            <linearGradient id="colorNew" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.1} />
                                                <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted/50" />
                                        <XAxis
                                            dataKey="name"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 13 }}
                                            dy={15}
                                        />
                                        <YAxis
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 13 }}
                                            dx={-10}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'hsl(var(--card))',
                                                borderColor: 'hsl(var(--border))',
                                                borderRadius: '12px',
                                                boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                                                padding: '12px',
                                                fontSize: '12px'
                                            }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="active"
                                            stroke="hsl(var(--primary))"
                                            fillOpacity={1}
                                            fill="url(#colorActive)"
                                            strokeWidth={3}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="new"
                                            stroke="hsl(var(--secondary))"
                                            fillOpacity={1}
                                            fill="url(#colorNew)"
                                            strokeWidth={2}
                                            strokeDasharray="4 4"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}

function NavItem({ icon, label, active = false }) {
    return (
        <div className={`
      flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer
      ${active
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'}
    `}>
            {icon}
            {label}
        </div>
    );
}

function ModernStatCard({ title, value, delta, trend, icon }) {
    return (
        <Card className="shadow-none border border-border/50 hover:border-primary/30 transition-all group overflow-hidden bg-card">
            <CardContent className="p-6 relative">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -mr-12 -mt-12 group-hover:scale-110 transition-transform duration-700"></div>
                <div className="flex items-center justify-between mb-4">
                    <div className="p-2 rounded-lg bg-muted/80 group-hover:bg-primary/10 transition-colors">
                        {icon}
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ring-inset ${trend === 'up'
                            ? 'bg-emerald-500/5 text-emerald-600 ring-emerald-600/20'
                            : 'bg-rose-500/5 text-rose-600 ring-rose-600/20'
                        }`}>
                        {delta}
                    </span>
                </div>
                <div className="space-y-1">
                    <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">{title}</p>
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                </div>
            </CardContent>
        </Card>
    );
}
