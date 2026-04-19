"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, FileText, ExternalLink } from "lucide-react";
import { getDesignSpecUrl } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

type Props = {
    projectId: string;
    filename: string;
    onClose: () => void;
};

export default function DesignSpecPreview({ projectId, filename, onClose }: Readonly<Props>) {
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const isPdf = filename.toLowerCase().endsWith(".pdf");

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        getDesignSpecUrl(projectId, filename)
            .then((presignedUrl) => {
                if (!cancelled) setUrl(presignedUrl);
            })
            .catch((err) => {
                if (!cancelled)
                    setError(err instanceof Error ? err.message : "Failed to load file");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [projectId, filename]);

    const handleBackdropClick = useCallback(
        (e: React.MouseEvent) => {
            if (e.target === e.currentTarget) onClose();
        },
        [onClose],
    );

    const handleBackdropKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
            }
        },
        [onClose],
    );

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        globalThis.addEventListener("keydown", handleEsc);
        return () => globalThis.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    return (
        <div
            role="button"
            tabIndex={0}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
            onClick={handleBackdropClick}
            onKeyDown={handleBackdropKeyDown}
            aria-label="Close preview"
        >
            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl w-[90vw] max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden cursor-default">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900 flex-shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {filename}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {url && (
                            <>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                                    title="Open in new tab"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                                <a
                                    href={url}
                                    download={filename}
                                    className="p-2 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                                    title="Download"
                                >
                                    <Download className="w-4 h-4" />
                                </a>
                            </>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                            title="Close (Esc)"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden bg-slate-100 dark:bg-zinc-950">
                    {loading && (
                        <LoadingSpinner label="Loading document..." className="h-full" />
                    )}

                    {error && (
                        <div className="flex flex-col items-center justify-center h-full gap-3 px-6">
                            <FileText className="w-12 h-12 text-slate-400 dark:text-zinc-600" />
                            <p className="text-sm text-red-600 dark:text-red-400 text-center">
                                {error}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-zinc-500 text-center">
                                Make sure MinIO is running and the file exists.
                            </p>
                        </div>
                    )}

                    {!loading && !error && url && isPdf && (
                        <iframe
                            src={url}
                            className="w-full h-full border-0"
                            title={`Preview: ${filename}`}
                        />
                    )}

                    {!loading && !error && url && !isPdf && <TextPreview url={url} />}
                </div>
            </div>
        </div>
    );
}

function TextPreview({ url }: Readonly<{ url: string }>) {
    const [content, setContent] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error("fetch failed");
                return res.text();
            })
            .then(setContent)
            .catch(() => setError(true));
    }, [url]);

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm text-red-600 dark:text-red-400">
                    Failed to load text content.
                </p>
            </div>
        );
    }

    if (content === null) {
        return (
            <div className="flex items-center justify-center h-full">
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <pre className="p-6 h-full overflow-auto whitespace-pre-wrap font-mono text-sm text-slate-800 dark:text-zinc-200 leading-relaxed">
            {content}
        </pre>
    );
}
