"use client";

import * as React from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = {
    error:
        "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300",
    warning:
        "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300",
};

export type AlertVariant = keyof typeof alertVariants;

export function Alert({
    variant = "error",
    className,
    children,
    ...props
}: React.ComponentProps<"div"> & { variant?: AlertVariant }) {
    const Icon = variant === "warning" ? AlertTriangle : AlertCircle;
    return (
        <div
            role="alert"
            className={cn(
                "flex items-center gap-2 rounded-lg p-3 text-sm",
                alertVariants[variant],
                className,
            )}
            {...props}
        >
            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
            <span>{children}</span>
        </div>
    );
}
