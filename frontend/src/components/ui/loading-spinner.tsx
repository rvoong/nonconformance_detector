"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingSpinner({
    label,
    className,
}: Readonly<{ label?: string; className?: string }>) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center gap-2 text-muted-foreground",
                className,
            )}
        >
            <Loader2 className="w-8 h-8 animate-spin" aria-hidden />
            {label && <span className="text-sm">{label}</span>}
        </div>
    );
}
