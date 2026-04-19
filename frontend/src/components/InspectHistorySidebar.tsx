"use client";

/**
 * History sidebar for the inspect page.
 * Sources all data from the backend API via useInspectionHistory.
 * Each submission is shown as an individual card with live status badges.
 */

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { History as HistoryIcon, Plus } from "lucide-react";
import { useApp } from "@/app/AppProvider";
import { useInspectionHistory, type StatusChangeEvent } from "@/hooks/useInspectionHistory";
import { useToast } from "@/context/ToastContext";
import { formatDateShort, formatTimeShort } from "@/lib/utils";
import type { ApiSubmission } from "@/lib/api";

const ACTIVE_STATUSES = new Set(["queued", "running"]);

function StatusBadge({ sub }: Readonly<{ sub: ApiSubmission }>) {
    if (sub.status === "running") {
        return (
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                {" ANALYZING"}
            </span>
        );
    }
    if (sub.status === "queued") {
        return <span className="text-xs text-slate-400 dark:text-zinc-500 flex-shrink-0">QUEUED</span>;
    }
    if (sub.status === "error") {
        return <span className="text-xs font-medium text-orange-500 flex-shrink-0">ERROR</span>;
    }
    if (sub.status === "timeout") {
        return <span className="text-xs font-medium text-amber-500 flex-shrink-0">TIMEOUT</span>;
    }
    if (sub.pass_fail === "pass") {
        return <span className="text-xs font-medium text-green-500 flex-shrink-0">PASS</span>;
    }
    return <span className="text-xs font-medium text-red-500 flex-shrink-0">FAILED</span>;
}

export default function InspectHistorySidebar() {
    const router = useRouter();
    const { currentProject } = useApp();
    const { addToast } = useToast();

    const handleStatusChange = useCallback(
        ({ submission, previousStatus, currentStatus }: StatusChangeEvent) => {
            const filename = submission.image_id.split("/").pop() ?? submission.image_id;
            const wasActive = ACTIVE_STATUSES.has(previousStatus);

            // Req 9: Notify user of active jobs (new submission queued/running)
            if (previousStatus === "__new__" && ACTIVE_STATUSES.has(currentStatus)) {
                addToast("Inspection submitted", { description: filename, variant: "info" });
                return;
            }

            if (!wasActive) return;

            // Req 6: Notify user of completed jobs
            if (submission.pass_fail === "pass") {
                addToast("Inspection complete — PASS", { description: filename, variant: "success" });
            // Req 8: Notify user of failed jobs
            } else if (currentStatus === "timeout") {
                addToast("Inspection timed out", { description: filename, variant: "warning" });
            } else if (currentStatus === "error") {
                addToast("Inspection error", { description: filename, variant: "error" });
            }// } else {
            //     addToast("Inspection failed — FAIL", { description: filename, variant: "error" });
            // }
        },
        [addToast],
    );

    const { submissions, imageUrls } = useInspectionHistory(
        currentProject?.id ?? undefined,
        handleStatusChange,
    );

    const handleView = (sub: ApiSubmission) => {
        router.push(`/inspect/result/api-${sub.id}`);
    };

    return (
        <aside className="w-[350px] h-full flex-shrink-0 flex flex-col bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">History</h2>
                <Link
                    href="/inspect"
                    className="px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-700 dark:text-zinc-300 flex items-center gap-1"
                >
                    <Plus className="w-4 h-4" />
                    New
                </Link>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {submissions.length === 0 ? (
                    <div className="min-h-full flex flex-col items-center justify-center text-center py-12">
                        <HistoryIcon className="w-12 h-12 text-slate-300 dark:text-zinc-700 mb-3" />
                        <p className="text-sm text-slate-500 dark:text-zinc-500">No inspections yet</p>
                    </div>
                ) : (
                    submissions.map((sub) => {
                        const isActive = ACTIVE_STATUSES.has(sub.status);
                        const thumbUrl = imageUrls[sub.image_id];
                        const filename = sub.image_id.split("/").pop() ?? sub.image_id;

                        const clickableClass = isActive ? "" : "hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer";
                        const clickProps = isActive ? {} : {
                            onClick: () => handleView(sub),
                            role: "button" as const,
                            tabIndex: 0,
                            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter") handleView(sub); },
                        };

                        return (
                            <div
                                key={sub.id}
                                className={`p-3 rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/50 transition-colors ${clickableClass}`}
                                {...clickProps}
                            >
                                <div className="flex gap-3 items-center">
                                    <div className="w-12 h-12 rounded overflow-hidden bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-shrink-0">
                                        {thumbUrl ? (
                                            <img
                                                src={thumbUrl}
                                                alt={filename}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-slate-200 dark:bg-zinc-700 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-medium text-slate-900 dark:text-white truncate mb-0.5">
                                            {filename}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">
                                            {formatDateShort(sub.submitted_at)}{" "}
                                            {formatTimeShort(sub.submitted_at)}
                                        </p>
                                    </div>
                                    <StatusBadge sub={sub} />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
