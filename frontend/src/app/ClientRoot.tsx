"use client";

import { AppLayout } from "@/components";
import AppProvider from "./AppProvider";
import { ToastProvider } from "@/context/ToastContext";

/**
 * Client wrapper that mounts the context, providers, and app layout
 */

export default function ClientRoot({ children }: { children: React.ReactNode }) {
    return (
        <AppProvider>
            <ToastProvider>
                <AppLayout>{children}</AppLayout>
            </ToastProvider>
        </AppProvider>
    );
}
