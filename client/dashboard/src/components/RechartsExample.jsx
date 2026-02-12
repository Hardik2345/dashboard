import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

const data = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 300 },
    { name: 'Mar', value: 600 },
    { name: 'Apr', value: 800 },
    { name: 'May', value: 500 },
];

export function RechartsExample() {
    return (
        <div className="h-[300px] w-full p-4 bg-card rounded-lg border">
            <h3 className="text-lg font-semibold mb-4">Recharts Verified</h3>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                        dataKey="name"
                        className="text-xs"
                        stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                        className="text-xs"
                        stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'hsl(var(--popover))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--popover-foreground))'
                        }}
                    />
                    <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
