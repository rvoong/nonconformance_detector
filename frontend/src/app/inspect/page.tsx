"use client";

/**
 * Page for creating a new inspection.
 * Uploads each image to the backend, which stores it in MinIO and triggers
 * detection automatically. The history sidebar polls the API for live status.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Image, FileDiff, FileText, X } from "lucide-react";
import { useApp } from "@/app/AppProvider";
import { uploadImage, listDesignSpecs, getInspectionPrompt } from "@/lib/api";
import { SUBMISSION_UPLOADED_EVENT } from "@/hooks/useInspectionHistory";
import DesignSpecPreview from "@/components/DesignSpecPreview";
import { Alert } from "@/components/ui/alert";
import { DesignSpecLink, type PreviewSpec } from "@/components/DesignSpecLink";

export default function InspectPage() {
    const router = useRouter();
    const { user, currentProject, hasRestoredFromStorage, setCurrentProject } = useApp();

    useEffect(() => {
        if (!hasRestoredFromStorage) return;
        if (!user) {
            router.replace("/login");
            return;
        }
        if (!currentProject?.id) {
            router.replace("/projects");
        }
    }, [hasRestoredFromStorage, user, currentProject, router]);

    const isMountedRef = useRef(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Fetch design specs if project has none
    useEffect(() => {
        if (!currentProject?.id || (currentProject.designSpecs?.length ?? 0) > 0) return;
        const projectId = currentProject.id;
        listDesignSpecs(projectId)
            .then((specs) => {
                if (specs.length > 0) {
                    setCurrentProject({ ...currentProject, designSpecs: specs });
                }
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProject?.id]);

    const [previewSpec, setPreviewSpec] = useState<PreviewSpec>(null);
    const [productPhotos, setProductPhotos] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [promptPopupOpen, setPromptPopupOpen] = useState(false);
    const [promptContent, setPromptContent] = useState("");
    const [promptLoading, setPromptLoading] = useState(false);
    const [promptError, setPromptError] = useState<string | null>(null);

    const handleProductPhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        setError(null);
        if (files && files.length > 0) {
            const newFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
            const newUrls = newFiles.map((f) => URL.createObjectURL(f));
            setProductPhotos((prev) => [...prev, ...newFiles]);
            setPreviewUrls((prev) => [...prev, ...newUrls]);
        }
        e.target.value = "";
    }, []);

    const removeProductPhoto = useCallback((index: number) => {
        setProductPhotos((prev) => prev.filter((_, i) => i !== index));
        setPreviewUrls((prev) => {
            const url = prev[index];
            if (url) URL.revokeObjectURL(url);
            return prev.filter((_, i) => i !== index);
        });
        setError(null);
    }, []);

    const clearAllPhotos = useCallback(() => {
        previewUrls.forEach((u) => URL.revokeObjectURL(u));
        setProductPhotos([]);
        setPreviewUrls([]);
        setError(null);
    }, [previewUrls]);

    const uploadFile = useCallback(async (file: File, projectId: string, userId: string) => {
        try {
            await uploadImage(projectId, userId, file);
            globalThis.dispatchEvent(new CustomEvent(SUBMISSION_UPLOADED_EVENT));
        } catch (err) {
            if (isMountedRef.current) {
                setError(`"${file.name}": ${err instanceof Error ? err.message : "Upload failed"}`);
            }
        }
    }, []);

    const handleRunInspection = async () => {
        if (productPhotos.length === 0) return;
        setError(null);

        const files = [...productPhotos];
        const total = files.length;

        // Clear form immediately so user can queue another batch
        previewUrls.forEach((u) => URL.revokeObjectURL(u));
        setProductPhotos([]);
        setPreviewUrls([]);
        setUploadProgress({ current: 0, total });

        const projectId = currentProject?.id ?? "";
        const userId = user?.id ?? "";
        // Run analysis in background
        const runBackground = async () => {
            for (let i = 0; i < files.length; i++) {
                if (!isMountedRef.current) break;
                setUploadProgress({ current: i + 1, total });
                await uploadFile(files[i], projectId, userId);
            }
            if (isMountedRef.current) setUploadProgress(null);
        };

        void runBackground();
    };

    const designSpecs = currentProject?.designSpecs ?? [];
    const isUploading = uploadProgress !== null;

    const handleOpenPromptPopup = useCallback(() => {
        setPromptPopupOpen(true);
        setPromptError(null);
        setPromptContent("");
        setPromptLoading(true);
        getInspectionPrompt(currentProject?.id ?? null)
            .then((r) => {
                setPromptContent(r.prompt);
                setPromptLoading(false);
            })
            .catch((e) => {
                setPromptError(e instanceof Error ? e.message : "Failed to load prompt");
                setPromptLoading(false);
            });
    }, [currentProject?.id]);

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-zinc-950 transition-colors overflow-hidden">
            <div className="max-w-[700px] w-full mx-auto flex-1 flex flex-col py-6">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    New Inspection
                </h1>
                <p className="text-slate-600 dark:text-zinc-400 mb-6">
                    Upload product photos for analysis against project specifications
                </p>

                {/* Design Specifications Info */}
                {currentProject && designSpecs.length > 0 && (
                    <div className="mb-8 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                                    Design Specifications
                                </p>
                                <div className="space-y-1">
                                    {designSpecs.map((spec) => (
                                        <DesignSpecLink
                                            key={spec}
                                            spec={spec}
                                            onPreview={() =>
                                                currentProject &&
                                                setPreviewSpec({
                                                    projectId: currentProject.id,
                                                    filename: spec,
                                                })
                                            }
                                            className="text-sm text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 hover:underline transition-colors gap-1.5"
                                            leading="• "
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* View inspection prompt */}
                <div className="mb-6">
                    <button
                        type="button"
                        onClick={handleOpenPromptPopup}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:underline font-medium flex items-center gap-1.5"
                    >
                        <FileDiff className="w-4 h-4" />
                        View inspection prompt (PDF + generic)
                    </button>
                </div>

                {previewSpec && (
                    <DesignSpecPreview
                        projectId={previewSpec.projectId}
                        filename={previewSpec.filename}
                        onClose={() => setPreviewSpec(null)}
                    />
                )}

                {/* Inspection prompt popup */}
                {promptPopupOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
                        onClick={(e) => { if (e.target === e.currentTarget) setPromptPopupOpen(false); }}
                        onKeyDown={(e) => { if (e.key === "Escape") setPromptPopupOpen(false); }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Inspection prompt"
                    >
                        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 dark:border-zinc-700">
                            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-700">
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    Inspection prompt (PDF + generic)
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setPromptPopupOpen(false)}
                                    className="p-2 rounded-lg text-slate-500 hover:text-slate-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="p-4 overflow-auto flex-1 min-h-0">
                                {promptLoading && (
                                    <p className="text-slate-500 dark:text-zinc-400">Loading prompt…</p>
                                )}
                                {promptError && <Alert variant="error">{promptError}</Alert>}
                                {!promptLoading && !promptError && promptContent && (
                                    <pre className="text-sm text-slate-700 dark:text-zinc-300 whitespace-pre-wrap font-sans break-words">
                                        {promptContent}
                                    </pre>
                                )}
                            </div>
                            <div className="p-4 border-t border-slate-200 dark:border-zinc-700">
                                <button
                                    type="button"
                                    onClick={() => setPromptPopupOpen(false)}
                                    className="w-full py-2 px-4 rounded-lg bg-slate-200 dark:bg-zinc-700 text-slate-900 dark:text-white font-medium hover:bg-slate-300 dark:hover:bg-zinc-600 transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Upload Product Photos */}
                <div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                        Upload Product Photos
                    </h3>

                    {productPhotos.length === 0 ? (
                        <div
                            onDrop={(e) => {
                                e.preventDefault();
                                const files = Array.from(e.dataTransfer.files).filter((f) =>
                                    f.type.startsWith("image/"),
                                );
                                if (files.length > 0) {
                                    setError(null);
                                    setProductPhotos((p) => [...p, ...files]);
                                    setPreviewUrls((p) => [
                                        ...p,
                                        ...files.map((f) => URL.createObjectURL(f)),
                                    ]);
                                }
                            }}
                            onDragOver={(e) => {
                                e.preventDefault();
                                e.dataTransfer.dropEffect = "copy";
                            }}
                            className="border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl p-12 text-center bg-white dark:bg-zinc-900/50 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                        >
                            <input
                                type="file"
                                id="product-photo"
                                onChange={handleProductPhotoUpload}
                                accept="image/*"
                                className="hidden"
                                multiple
                            />
                            <label htmlFor="product-photo" className="cursor-pointer block">
                                <Image className="w-12 h-12 text-slate-400 dark:text-zinc-600 mx-auto mb-4" />
                                <p className="text-slate-900 dark:text-white mb-1">
                                    Drop Product Photos here or{" "}
                                    <span className="text-blue-600 dark:text-blue-400 font-medium">
                                        browse
                                    </span>
                                </p>
                                <p className="text-sm text-slate-500 dark:text-zinc-500">
                                    PNG, JPG, JPEG, WebP • Multiple images supported
                                </p>
                            </label>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-3 p-3 bg-slate-100 dark:bg-zinc-800 rounded-xl border-2 border-slate-200 dark:border-zinc-700">
                                {productPhotos.map((photo, index) => (
                                    <div key={`${photo.name}-${photo.size}-${photo.lastModified}`} className="relative group/photo">
                                        <img
                                            src={previewUrls[index] ?? ""}
                                            alt={photo.name}
                                            className="w-full h-auto rounded-lg object-cover aspect-square"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeProductPhoto(index)}
                                            className="absolute top-1 right-1 bg-red-500 text-white p-1.5 rounded-lg opacity-0 group-hover/photo:opacity-100 transition-opacity hover:bg-red-600"
                                            title="Remove"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 rounded-b-lg truncate">
                                            {photo.name}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <label
                                    htmlFor="product-photo-add"
                                    className="flex-1 bg-slate-200 dark:bg-zinc-700 hover:bg-slate-300 dark:hover:bg-zinc-600 text-slate-900 dark:text-white px-4 py-2 rounded-lg font-medium cursor-pointer transition-colors text-center"
                                >
                                    Add More Photos
                                </label>
                                <button
                                    type="button"
                                    onClick={clearAllPhotos}
                                    className="bg-red-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-600 transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                            <input
                                type="file"
                                id="product-photo-add"
                                onChange={handleProductPhotoUpload}
                                accept="image/*"
                                className="hidden"
                                multiple
                            />
                        </div>
                    )}
                </div>

                {error && (
                    <Alert variant="error" className="mt-4">
                        {error}
                    </Alert>
                )}

                {isUploading && (
                    <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-800 dark:text-blue-200 text-sm">
                        Uploading {uploadProgress.current} of {uploadProgress.total}… check the History panel for live progress.
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleRunInspection}
                    disabled={productPhotos.length === 0 || isUploading}
                    className={`w-full font-semibold py-4 px-6 rounded-xl transition-all disabled:cursor-not-allowed shadow-sm mt-8 ${
                        productPhotos.length > 0 && !isUploading
                            ? "bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 hover:dark:bg-blue-600 text-white"
                            : "bg-slate-300 dark:bg-zinc-800 text-slate-500 dark:text-zinc-600"
                    }`}
                >
                    {isUploading
                        ? `Uploading ${uploadProgress.current}/${uploadProgress.total}…`
                        : "Start Analysis"}
                </button>
            </div>
        </div>
    );
}
