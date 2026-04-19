"use client";

import { Eye } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreviewSpec = { projectId: string; filename: string } | null;

type Props = {
    spec: string;
    onPreview: () => void;
    className?: string;
    /** Optional leading icon or bullet (e.g. FileText or "• ") */
    leading?: React.ReactNode;
};

export function DesignSpecLink({ spec, onPreview, className, leading }: Readonly<Props>) {
    return (
        <button
            type="button"
            onClick={onPreview}
            className={cn(
                "flex items-center gap-2 group text-left w-full",
                className ?? "text-sm text-slate-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors",
            )}
        >
            {leading != null && (
                <span className="flex-shrink-0 mt-0.5">{leading}</span>
            )}
            <span className="truncate flex-1 min-w-0">{spec}</span>
            <Eye
                className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                aria-hidden
            />
        </button>
    );
}
