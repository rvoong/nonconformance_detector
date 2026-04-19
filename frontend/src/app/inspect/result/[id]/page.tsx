"use client";

/**
 * Page for viewing the result of an inspection.
 * Supports multiple submissions, defect markers on image, severity badges, and stats grid.
 * Based on AI Anomaly Detection Tool ResultsView.
 */

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
    ChevronLeft,
    Download,
    Calendar,
    FileCheck,
    FileText,
    AlertCircle,
} from "lucide-react";
import { useApp } from "@/app/AppProvider";
import { getSubmission, listAnomalies, getImageUrl, type ApiSubmission } from "@/lib/api";
import {
    getInspection,
    toSubmissions,
    deriveStatus,
    isInspectionRunning,
    INSPECTION_UPDATE_EVENT,
    type InspectionResult,
    type InspectionSubmission,
    type Defect,
} from "@/lib/inspection-store";
import DesignSpecPreview from "@/components/DesignSpecPreview";
import { formatDateLong } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DesignSpecLink, type PreviewSpec } from "@/components/DesignSpecLink";

function getSubmissionStatusClass(status: string) {
    switch (status) {
        case "pass":    return "bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400";
        case "error":   return "bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400";
        case "timeout": return "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400";
        default:        return "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400";
    }
}

function getSubmissionStatusLabel(status: string) {
    switch (status) {
        case "pass":    return "PASS";
        case "error":   return "ERROR";
        case "timeout": return "TIMEOUT";
        case "fail":    return "FAILED";
        default:        return status.toUpperCase();
    }
}

const API_SUBMISSION_RUNNING_STATUSES = new Set(["running", "queued"]);

function deriveOverallStatus(submissions: InspectionSubmission[]): string {
    if (submissions.some((s) => s.status === "fail")) return "FAIL";
    if (submissions.some((s) => s.status === "timeout")) return "TIMEOUT";
    if (submissions.some((s) => s.status === "error")) return "ERROR";
    return "PASS";
}

function getOverallStatusClass(status: string): string {
    switch (status) {
        case "FAIL":    return "bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400";
        case "TIMEOUT": return "bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400";
        case "ERROR":   return "bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400";
        default:        return "bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400";
    }
}

function buildResultFromApi(
    sub: ApiSubmission,
    anomalies: Awaited<ReturnType<typeof listAnomalies>>,
    currentProject: { id: string; name: string; designSpecs?: string[] },
    imageUrl: string,
): InspectionResult {
    const photoName = sub.image_id.split("/").pop() ?? "image.png";
    const defects: Defect[] = anomalies.map((a) => ({
        id: a.id,
        description: a.description ?? a.label,
    }));
    const analysis =
        anomalies
            .map((a) => a.description)
            .filter(Boolean)
            .join("\n\n") || "No detailed analysis.";
    const isRunning = API_SUBMISSION_RUNNING_STATUSES.has(sub.status);
    let submissionStatus: InspectionSubmission["status"];
    if (isRunning) {
        submissionStatus = "pending";
    } else if (sub.status === "error") {
        submissionStatus = "error";
    } else if (sub.status === "timeout") {
        submissionStatus = "timeout";
    } else {
        submissionStatus = sub.pass_fail === "unknown" ? "fail" : sub.pass_fail;
    }
    const submissionAnalysis =
        (sub.status === "error" || sub.status === "timeout") && sub.error_message
            ? sub.error_message
            : analysis;
    const submission: InspectionSubmission = {
        id: sub.id,
        timestamp: sub.submitted_at,
        productPhoto: imageUrl,
        photoName,
        designSpec: currentProject.designSpecs ?? [],
        status: submissionStatus,
        defects,
        analysis: submissionAnalysis,
        annotatedImage: sub.annotated_image ?? undefined,
    };
    const inspectionResult: InspectionResult = {
        id: `api-${sub.id}`,
        imageUrl,
        response: analysis,
        timestamp: sub.submitted_at,
        projectId: sub.project_id,
        projectName: currentProject.name,
        submissions: [submission],
    };
    if (isRunning) {
        inspectionResult.status = "running";
        inspectionResult.progress = 0;
    }
    return inspectionResult;
}

export default function InspectResultPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { currentProject } = useApp();
    const id = typeof params.id === "string" ? params.id : "";
    const [result, setResult] = useState<InspectionResult | null>(null);
    const [notFound, setNotFound] = useState(false);
    const [previewSpec, setPreviewSpec] = useState<PreviewSpec>(null);

    const selectedSubIds = useMemo(() => {
        const q = searchParams.get("submissions");
        if (!q) return null;
        return new Set(q.split(",").filter(Boolean));
    }, [searchParams]);

    const submissions = useMemo((): InspectionSubmission[] => {
        if (!result) return [];
        const all = toSubmissions(result);
        if (!selectedSubIds || selectedSubIds.size === 0) return all;
        return all.filter((s) => selectedSubIds.has(s.id));
    }, [result, selectedSubIds]);

    useEffect(() => {
        if (!id) {
            setNotFound(true);
            return;
        }
        function tryLoad(): boolean {
            const data = getInspection(id);
            if (data) {
                setResult(data);
                return true;
            }
            return false;
        }
        if (tryLoad()) return;

        if (id.startsWith("api-") && currentProject?.id) {
            const submissionId = id.slice(4);
            const projectId = currentProject.id;
            Promise.all([getSubmission(projectId, submissionId), listAnomalies(submissionId)])
                .then(async ([sub, anomalies]) => {
                    if (!sub) {
                        setNotFound(true);
                        return;
                    }
                    let imageUrl = "";
                    try {
                        imageUrl = await getImageUrl(sub.image_id);
                    } catch {
                        /* ignore */
                    }
                    setResult(buildResultFromApi(sub, anomalies ?? [], currentProject, imageUrl));
                })
                .catch(() => setNotFound(true));
            return;
        }

        // For local IDs, retry a few times before declaring not found (handles
        // race between navigation and store/memory-cache visibility).
        const t1 = setTimeout(() => { tryLoad(); }, 100);
        const t2 = setTimeout(() => {
            if (!tryLoad()) setNotFound(true);
        }, 400);

        // Also react to store updates (e.g. analysis completes while we wait)
        const onUpdate = () => { tryLoad(); };
        globalThis.addEventListener(INSPECTION_UPDATE_EVENT, onUpdate);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            globalThis.removeEventListener(INSPECTION_UPDATE_EVENT, onUpdate);
        };
    }, [id, currentProject?.id, currentProject?.name, currentProject?.designSpecs]);

    // Poll API when viewing an api- submission that is still running (e.g. seed analysis in background)
    useEffect(() => {
        if (
            !id.startsWith("api-") ||
            !currentProject?.id ||
            !result ||
            result.id !== id ||
            !isInspectionRunning(result)
        ) {
            return;
        }
        const submissionId = id.slice(4);
        const projectId = currentProject.id;
        const poll = async () => {
            try {
                const [sub, anomalies] = await Promise.all([
                    getSubmission(projectId, submissionId),
                    listAnomalies(submissionId),
                ]);
                if (!sub || !API_SUBMISSION_RUNNING_STATUSES.has(sub.status)) {
                    if (sub) {
                        let imageUrl = "";
                        try {
                            imageUrl = await getImageUrl(sub.image_id);
                        } catch {
                            /* ignore */
                        }
                        setResult(
                            buildResultFromApi(sub, anomalies ?? [], currentProject, imageUrl),
                        );
                    }
                    return true;
                }
                let imageUrl = "";
                try {
                    imageUrl = await getImageUrl(sub.image_id);
                } catch {
                    /* ignore */
                }
                setResult(buildResultFromApi(sub, anomalies ?? [], currentProject, imageUrl));
            } catch {
                // ignore
            }
            return false;
        };
        const interval = setInterval(async () => {
            const done = await poll();
            if (done) clearInterval(interval);
        }, 2000);
        return () => clearInterval(interval);
    }, [
        id,
        currentProject?.id,
        currentProject?.name,
        currentProject?.designSpecs,
        result?.id,
        result?.status,
    ]);

    const defaultTitle = "GLaDOS";
    useEffect(() => {
        if (!result) return;
        const d = new Date(result.timestamp);
        const dateStr = d.toISOString().slice(0, 10);
        const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        document.title = `GLaDOS Inspection Report — ${dateStr} ${timeStr}`;
        return () => {
            document.title = defaultTitle;
        };
    }, [result]);

    const handlePrintReport = () => {
        globalThis.print();
    };

    useEffect(() => {
        if (notFound) router.replace("/inspect");
    }, [notFound, router]);

    if (notFound) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
                <LoadingSpinner label="Redirecting..." />
            </div>
        );
    }

    if (!result || submissions.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-zinc-950">
                <LoadingSpinner label="Loading..." />
            </div>
        );
    }

    const running = isInspectionRunning(result);
    const progress = result.progress ?? 0;

    if (running) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-zinc-950 py-12 px-6">
                <div className="max-w-md w-full text-center">
                    <div className="w-12 h-12 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin mx-auto mb-6" />
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
                        Analysis in progress
                    </h2>
                    <p className="text-slate-600 dark:text-zinc-400 mb-6">
                        Analyzing {submissions.length} image{submissions.length !== 1 ? "s" : ""}.
                        Results will appear here when complete.
                    </p>
                    <div className="w-full bg-slate-200 dark:bg-zinc-700 rounded-full h-3 overflow-hidden mb-2">
                        <div
                            className="bg-blue-600 dark:bg-blue-500 h-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <p className="text-sm text-slate-500 dark:text-zinc-500 mb-8">{progress}%</p>
                    <button
                        onClick={() => router.push("/inspect")}
                        className="flex items-center gap-2 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors font-medium"
                    >
                        <ChevronLeft className="w-5 h-5" />
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    const designSpecs =
        (submissions[0]?.designSpec?.length ?? 0) > 0
            ? submissions[0].designSpec
            : (currentProject?.designSpecs ?? []);
    const today = formatDateLong(result.timestamp);
    const overallStatus = deriveOverallStatus(submissions);
    const overallStatusClass = getOverallStatusClass(overallStatus);

    const totalDefects = submissions.reduce((sum, s) => sum + s.defects.length, 0);
    const failWithoutDetails = overallStatus === "FAIL" && totalDefects === 0;

    return (
        <div className="flex-1 flex flex-col min-w-0 bg-slate-50 dark:bg-zinc-950 transition-colors overflow-x-auto overflow-y-auto print:!overflow-visible print:!block print:bg-white">
            <div className="w-full max-w-[1200px] min-w-0 mx-auto flex-1 flex flex-col py-6 print:!block print:!max-w-full print:!w-full print:py-0">
                {/* Back Button */}
                <button
                    onClick={() => router.push("/inspect")}
                    className="print:hidden flex items-center gap-2 text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white mb-6 transition-colors font-medium"
                >
                    <ChevronLeft className="w-5 h-5" />
                    <span>Back to Dashboard</span>
                </button>

                {/* Demo/Mock notice when AI was unavailable */}
                {result.model && /mock|unavailable|offline/i.test(result.model) && (
                    <div className="print:hidden mb-6">
                        <Alert variant="warning">
                            This result uses demo data because the AI service (Ollama / Qwen2.5-VL)
                            was not reachable. For real detection, start Ollama:{" "}
                            <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">
                                ollama serve
                            </code>{" "}
                            and{" "}
                            <code className="bg-amber-100 dark:bg-amber-500/20 px-1 rounded">
                                ollama pull qwen2.5vl:7b
                            </code>
                            .
                        </Alert>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="print:hidden flex gap-4 mb-6">
                    <button
                        onClick={handlePrintReport}
                        className="flex-1 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white font-semibold py-4 px-6 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                    >
                        <Download className="w-5 h-5" />
                        Print / Save as PDF
                    </button>
                    <button
                        onClick={() => router.push("/inspect")}
                        className="flex-1 bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-900 dark:text-white font-semibold py-4 px-6 rounded-xl transition-all"
                    >
                        New Inspection
                    </button>
                </div>

                {/* Submission Counter */}
                {submissions.length > 1 && (
                    <div className="print:hidden bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 mb-6">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                            <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                Viewing {submissions.length} submission
                                {submissions.length > 1 ? "s" : ""} in this report
                            </span>
                        </div>
                    </div>
                )}

                {/* PDF-Style Report Preview */}
                <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-slate-200 dark:border-zinc-800 overflow-hidden print:!overflow-visible print:shadow-none print:border-0 print:rounded-none print:max-w-full min-w-0 max-w-full">
                    {/* Report Header */}
                    <div className="bg-slate-100 dark:bg-zinc-800 px-8 py-6 border-b border-slate-200 dark:border-zinc-700 print:px-4 print:py-4">
                        <div className="flex flex-wrap items-start justify-between gap-4 min-w-0">
                            <div className="min-w-0 flex-1">
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                                    Quality Inspection Report
                                </h1>
                                <p className="text-slate-600 dark:text-zinc-400">
                                    AI-Powered Anomaly Detection Analysis
                                </p>
                            </div>
                            <div className="text-right flex-shrink-0 min-w-0">
                                <div className="flex items-center gap-2 text-slate-600 dark:text-zinc-400 text-sm mb-1">
                                    <Calendar className="w-4 h-4" />
                                    <span>{today}</span>
                                </div>
                                <div
                                    className={`inline-block px-3 py-1 rounded-full font-bold text-sm ${overallStatusClass}`}
                                >
                                    {overallStatus}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Report Content */}
                    <div className="p-8 print:p-4 min-w-0">
                        {/* Inspection Summary */}
                        <section className="mb-8 min-w-0">
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <FileCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                Inspection Summary
                            </h2>

                            {overallStatus === "TIMEOUT" && (
                                <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-200">
                                    <p className="text-sm font-medium mb-1">
                                        Result: TIMEOUT — inspection did not complete in time
                                    </p>
                                    <p className="text-sm text-amber-700 dark:text-amber-300/90">
                                        No defect data is available for this submission.
                                    </p>
                                </div>
                            )}

                            {overallStatus === "ERROR" && (
                                <div className="mb-4 p-4 rounded-lg bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 text-orange-800 dark:text-orange-200">
                                    <p className="text-sm font-medium mb-1">
                                        Result: ERROR — detection system encountered a problem
                                    </p>
                                    <p className="text-sm text-orange-700 dark:text-orange-300/90">
                                        One or more submissions failed due to a system error
                                        unrelated to FOD detection. Check individual submission
                                        details for the specific error message.
                                    </p>
                                </div>
                            )}

                            {failWithoutDetails && (
                                <div className="mb-4 p-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-200">
                                    <p className="text-sm font-medium mb-1">
                                        Result: FAIL — no defect details available
                                    </p>
                                    <p className="text-sm text-amber-700 dark:text-amber-300/90">
                                        This inspection was marked FAIL by the detection system, but
                                        no defect list or analysis text was returned. The result may
                                        come from an external submission or a run where detailed
                                        output was not stored.
                                    </p>
                                </div>
                            )}

                            {/* Design Specifications */}
                            {designSpecs.length > 0 && (
                                <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-4 border border-slate-200 dark:border-zinc-700 mb-4">
                                    <p className="text-sm text-slate-600 dark:text-zinc-400 mb-3 font-semibold">
                                        Design Specifications ({designSpecs.length})
                                    </p>
                                    <div className="max-h-40 overflow-y-auto pr-2 print:!max-h-none print:!overflow-visible">
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                            {designSpecs.map((spec, index) => (
                                                <DesignSpecLink
                                                    key={index}
                                                    spec={spec}
                                                    onPreview={() =>
                                                        currentProject &&
                                                        setPreviewSpec({
                                                            projectId: currentProject.id,
                                                            filename: spec,
                                                        })
                                                    }
                                                    className="text-sm text-slate-900 dark:text-white flex-1 break-words group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline transition-colors"
                                                    leading={
                                                        <span className="text-slate-400 dark:text-zinc-600">
                                                            •
                                                        </span>
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {previewSpec && (
                                <DesignSpecPreview
                                    projectId={previewSpec.projectId}
                                    filename={previewSpec.filename}
                                    onClose={() => setPreviewSpec(null)}
                                />
                            )}

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-4 border border-slate-200 dark:border-zinc-700">
                                    <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">
                                        Total Submissions
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                                        {submissions.length}
                                    </p>
                                </div>
                                <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-4 border border-slate-200 dark:border-zinc-700">
                                    <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">
                                        FOD Detected
                                    </p>
                                    <p className={`text-2xl font-bold ${totalDefects > 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                                        {totalDefects}
                                    </p>
                                </div>
                            </div>

                            {/* Project / Model metadata */}
                            {(result.projectName ||
                                result.model ||
                                result.inferenceTimeMs != null) && (
                                <div className="grid grid-cols-2 gap-4 mt-4 min-w-0">
                                    {result.projectName && (
                                        <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-4 border border-slate-200 dark:border-zinc-700 min-w-0 overflow-hidden">
                                            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">
                                                Project
                                            </p>
                                            <p className="text-lg font-bold text-slate-900 dark:text-white break-words">
                                                {result.projectName}
                                            </p>
                                        </div>
                                    )}
                                    {(result.model || result.inferenceTimeMs != null) && (
                                        <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-4 border border-slate-200 dark:border-zinc-700 min-w-0 overflow-hidden">
                                            <p className="text-sm text-slate-600 dark:text-zinc-400 mb-1">
                                                Model / Inference
                                            </p>
                                            <p className="text-sm font-medium text-slate-900 dark:text-white break-words">
                                                {result.model && <span>{result.model}</span>}
                                                {result.model &&
                                                    result.inferenceTimeMs != null &&
                                                    " · "}
                                                {result.inferenceTimeMs != null && (
                                                    <span>
                                                        {result.inferenceTimeMs.toFixed(0)}
                                                        ms
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* All Submissions */}
                        {submissions.map((submission, submissionIndex) => (
                            <div key={submission.id} className={submissionIndex > 0 ? "mt-12" : ""}>
                                {/* Submission Header */}
                                {submissions.length > 1 && (
                                    <div className="mb-6 pb-4 border-b border-slate-200 dark:border-zinc-700">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                            <span className="text-blue-600 dark:text-blue-400">
                                                Submission {submissionIndex + 1}
                                            </span>
                                            <span className="text-slate-400 dark:text-zinc-600">
                                                /
                                            </span>
                                            <span className="text-sm font-normal text-slate-600 dark:text-zinc-400">
                                                {submission.photoName}
                                            </span>
                                            <span className={`ml-auto text-sm font-medium px-2.5 py-1 rounded-full ${getSubmissionStatusClass(submission.status)}`}>
                                                {getSubmissionStatusLabel(submission.status)}
                                            </span>
                                        </h2>
                                    </div>
                                )}

                                {/* Product Image */}
                                <section className="mb-8 min-w-0">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                                        Product Image
                                    </h3>
                                    {submission.annotatedImage ? (
                                        <div className="space-y-3">
                                            <div className="relative bg-slate-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-blue-300 dark:border-blue-600 min-w-0 print-report-image">
                                                <img
                                                    src={`data:image/png;base64,${submission.annotatedImage}`}
                                                    alt={`Annotated product ${submissionIndex + 1} with bounding boxes`}
                                                    className="w-full max-w-full h-auto object-contain"
                                                />
                                            </div>
                                            <details className="group">
                                                <summary className="cursor-pointer text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-700 dark:hover:text-zinc-200 select-none">
                                                    View original image
                                                </summary>
                                                <div className="mt-2 relative bg-slate-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 min-w-0">
                                                    <img
                                                        src={submission.productPhoto}
                                                        alt={`Original product ${submissionIndex + 1}`}
                                                        className="w-full max-w-full h-auto object-contain"
                                                    />
                                                </div>
                                            </details>
                                        </div>
                                    ) : (
                                        <div className="relative bg-slate-100 dark:bg-zinc-800 rounded-lg overflow-hidden border border-slate-200 dark:border-zinc-700 min-w-0 print-report-image">
                                            <img
                                                src={submission.productPhoto}
                                                alt={`Product ${submissionIndex + 1}`}
                                                className="w-full max-w-full h-auto object-contain"
                                            />
                                        </div>
                                    )}
                                </section>

                                {/* Detected Defects */}
                                <section className="mb-8">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                                        Detected Defects ({submission.defects.length})
                                    </h3>
                                    {submission.defects.length > 0 ? (
                                        <div className="space-y-3">
                                            {submission.defects.map((defect: Defect) => (
                                                <div
                                                    key={defect.id}
                                                    className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-4 border border-slate-200 dark:border-zinc-700"
                                                >
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                                                            {defect.id}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">
                                                            <AlertCircle className="w-4 h-4" />
                                                            FOD
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-700 dark:text-zinc-300">
                                                        {defect.description}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-green-50 dark:bg-green-500/10 rounded-lg p-4 border border-green-200 dark:border-green-500/20 text-center">
                                            <p className="text-green-700 dark:text-green-400">
                                                No defects detected
                                            </p>
                                        </div>
                                    )}
                                </section>

                                {/* Full Analysis: show whenever we have analysis text (so "see full analysis above" has content) */}
                                {submission.analysis?.trim() && (
                                    <section className="mt-8">
                                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                                            Full Analysis
                                        </h3>
                                        <div className="bg-slate-50 dark:bg-zinc-800 rounded-lg p-6 border border-slate-200 dark:border-zinc-700">
                                            <pre className="whitespace-pre-wrap font-mono text-sm text-slate-700 dark:text-zinc-300 leading-relaxed">
                                                {submission.analysis}
                                            </pre>
                                        </div>
                                    </section>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Report Footer */}
                    <div className="print-report-footer bg-slate-100 dark:bg-zinc-800 px-8 py-4 border-t border-slate-200 dark:border-zinc-700 print:px-4">
                        <p className="text-sm text-slate-600 dark:text-zinc-400 text-center">
                            Generated by GLaDOS AI Anomaly Detection System • {today}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
