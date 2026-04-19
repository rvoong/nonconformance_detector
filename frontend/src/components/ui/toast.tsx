"use client";

import { AlertCircle, AlertTriangle, CheckCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type Toast = {
    id: string;
    title: string;
    description?: string;
    variant: ToastVariant;
    removing?: boolean;
};

const ICONS: Record<ToastVariant, React.ReactNode> = {
    success: <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    info: <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
};

const BORDER: Record<ToastVariant, string> = {
    success: "border-green-200 dark:border-green-800",
    error: "border-red-200 dark:border-red-800",
    warning: "border-amber-200 dark:border-amber-800",
    info: "border-blue-200 dark:border-blue-800",
};

export function ToastItem({
    toast,
    onDismiss,
}: Readonly<{ toast: Toast; onDismiss: (id: string) => void }>) {
    return (
        <div
            role="alert"
            className={cn(
                "flex items-start gap-3 p-4 rounded-lg border bg-white dark:bg-zinc-900 shadow-lg w-80",
                BORDER[toast.variant],
                toast.removing ? "toast-exit" : "toast-enter",
            )}
        >
            {ICONS[toast.variant]}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{toast.title}</p>
                {toast.description && (
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                        {toast.description}
                    </p>
                )}
            </div>
            <button
                aria-label="Dismiss notification"
                onClick={() => onDismiss(toast.id)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}

export function ToastContainer({
    toasts,
    onDismiss,
}: Readonly<{ toasts: Toast[]; onDismiss: (id: string) => void }>) {
    if (toasts.length === 0) return null;
    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 items-end">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}
