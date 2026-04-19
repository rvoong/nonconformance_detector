"use client";

import { History as HistoryIcon, Plus } from "lucide-react";
import { formatDateShort, formatTimeShort } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type HistoryItem = {
    id: string;
    project: string;
    timestamp: string;
    status: "pass" | "fail";
    photo: string;
    defectCount?: number;
};

type Props = {
    items: HistoryItem[];
    onNew: () => void;
    onViewItem: (id: string) => void;
    emptyMessage?: string;
    /** Optional: require a project to be selected before showing list (sidebar shows empty when no project). */
    requireProject?: boolean;
    currentProjectId?: string | null;
};

export function InspectionHistoryList({
    items,
    onNew,
    onViewItem,
    emptyMessage = "No inspections yet",
    requireProject = false,
    currentProjectId = null,
}: Readonly<Props>) {
    const showEmpty = requireProject ? !currentProjectId || items.length === 0 : items.length === 0;

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    History
                </h2>
                <button
                    type="button"
                    onClick={onNew}
                    className="px-3 py-1.5 text-sm border border-slate-300 dark:border-zinc-700 rounded-lg hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors text-slate-700 dark:text-zinc-300 flex items-center gap-1"
                >
                    <Plus className="w-4 h-4" />
                    New
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="space-y-2">
                    {showEmpty ? (
                        <div className="text-center py-12">
                            <HistoryIcon className="w-12 h-12 text-slate-300 dark:text-zinc-700 mx-auto mb-3" />
                            <p className="text-sm text-slate-500 dark:text-zinc-500">
                                {emptyMessage}
                            </p>
                        </div>
                    ) : (
                        items.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onViewItem(item.id)}
                                className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors group"
                            >
                                <div className="flex gap-3 mb-2">
                                    <div className="w-12 h-12 rounded overflow-hidden bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 flex-shrink-0">
                                        <img
                                            src={item.photo}
                                            alt="Product thumbnail"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-1">
                                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                                {formatDateShort(item.timestamp)}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-zinc-500">
                                            {formatTimeShort(item.timestamp)}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge
                                                variant="secondary"
                                                className={
                                                    item.status === "pass"
                                                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                                        : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
                                                }
                                            >
                                                {item.status === "pass"
                                                    ? "Pass"
                                                    : "Fail"}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
