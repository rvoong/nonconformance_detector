"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/app/AppProvider";
import { useInspectionHistory } from "@/hooks/useInspectionHistory";
import type { ApiSubmission } from "@/lib/api";
import { InspectionHistoryList, type HistoryItem } from "@/components/InspectionHistoryList";

function submissionToHistoryItem(sub: ApiSubmission, imageUrls: Record<string, string>): HistoryItem {
    return {
        id: `api-${sub.id}`,
        project: sub.project_id,
        timestamp: sub.submitted_at,
        status: sub.pass_fail === "pass" ? "pass" : "fail",
        photo: imageUrls[sub.image_id] ?? "",
    };
}

export default function Sidebar() {
    const router = useRouter();
    const { currentProject } = useApp();
    const { submissions, imageUrls } = useInspectionHistory(currentProject?.id ?? undefined);
    const completedSubs = submissions.filter(s => s.status !== "queued" && s.status !== "running");
    const items = completedSubs.map(s => submissionToHistoryItem(s, imageUrls));

    return (
        <aside className="h-full w-full flex flex-col bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-zinc-800 p-6">
            <InspectionHistoryList
                items={items}
                onNew={() => router.push("/inspect")}
                onViewItem={(id) => router.push(`/inspect/result/${id}`)}
                requireProject
                currentProjectId={currentProject?.id}
            />
        </aside>
    );
}
