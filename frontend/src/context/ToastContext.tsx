"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ToastContainer, type Toast, type ToastVariant } from "@/components/ui/toast";

const AUTO_DISMISS_MS = 5000;

type AddToastOptions = {
    description?: string;
    variant?: ToastVariant;
    duration?: number;
};

type ToastContextType = {
    addToast: (title: string, options?: AddToastOptions) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const dismiss = useCallback((id: string) => {
        const timer = timers.current.get(id);
        if (timer !== undefined) clearTimeout(timer);
        timers.current.delete(id);
        // Mark as removing so the exit animation plays, then remove from DOM
        setToasts((prev) => prev.map((t) => t.id === id ? { ...t, removing: true } : t));
        const removeById = (prev: Toast[]) => prev.filter((t) => t.id !== id);
        const exitTimer = setTimeout(() => setToasts(removeById), 220);
        timers.current.set(`${id}-exit`, exitTimer);
    }, []);

    const addToast = useCallback(
        (title: string, { description, variant = "info", duration = AUTO_DISMISS_MS }: AddToastOptions = {}) => {
            const id = crypto.randomUUID();
            setToasts((prev) => [...prev, { id, title, description, variant }]);
            const timer = setTimeout(() => dismiss(id), duration);
            timers.current.set(id, timer);
        },
        [dismiss],
    );

    // Clean up all timers on unmount
    useEffect(() => {
        const t = timers.current;
        return () => {
            t.forEach((timer) => clearTimeout(timer));
        };
    }, []);

    const contextValue = useMemo(() => ({ addToast }), [addToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextType {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used inside ToastProvider");
    return ctx;
}
