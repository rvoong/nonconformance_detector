"use client";

/**
 * Page for creating new projects and viewing all projects.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    FileText,
    Plus,
    X,
    FolderOpen,
    Trash2,
    ChevronDown,
    ChevronRight,
} from "lucide-react";
import { useApp, Project } from "@/app/AppProvider";
import { Alert } from "@/components/ui/alert";
import { DesignSpecLink, type PreviewSpec } from "@/components/DesignSpecLink";
import {
    listProjects,
    createProject,
    uploadDesignSpec,
    listDesignSpecs,
    deleteProject,
    API_BASE_URL,
    type ApiProject,
} from "@/lib/api";
import { cn, formatDateShort } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import DesignSpecPreview from "@/components/DesignSpecPreview";

function apiProjectToAppProject(
    p: ApiProject,
    designSpecs: string[] = [],
): Project & {
    createdAt: string;
    updatedAt: string;
    designSpecs: string[];
} {
    const created =
        typeof p.created_at === "string" ? p.created_at : new Date(p.created_at).toISOString();
    const updated =
        typeof p.updated_at === "string" ? p.updated_at : new Date(p.updated_at).toISOString();

    return {
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: created,
        updatedAt: updated,
        designSpecs,
    };
}

async function uploadSpecFiles(projectId: string, files: File[]): Promise<string[]> {
    const uploadedFilenames: string[] = [];
    for (const file of files) {
        try {
            await uploadDesignSpec(projectId, file);
            uploadedFilenames.push(file.name);
        } catch (e) {
            console.warn("Design spec upload failed:", file.name, e);
        }
    }
    return uploadedFilenames;
}

export default function ProjectsPage() {
    const router = useRouter();
    const { user, hasRestoredFromStorage, setCurrentProject } = useApp();

    useEffect(() => {
        if (!hasRestoredFromStorage) return;
        if (!user) router.replace("/login");
    }, [hasRestoredFromStorage, user, router]);

    const [existingProjects, setExistingProjects] = useState<
        Array<
            Project & {
                createdAt: string;
                updatedAt: string;
                designSpecs: string[];
            }
        >
    >([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(true);
    const [projectsError, setProjectsError] = useState<string | null>(null);

    const [projectName, setProjectName] = useState<string>("");
    const [designSpecs, setDesignSpecs] = useState<File[]>([]);
    const [showNewProject, setShowNewProject] = useState<boolean>(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const [confirmAction, setConfirmAction] = useState<{
        projectId: string;
        projectName: string;
    } | null>(null);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [previewSpec, setPreviewSpec] = useState<PreviewSpec>(null);
    const [expandedSpecs, setExpandedSpecs] = useState<Set<string>>(new Set());

    const fetchProjects = async () => {
        setIsLoadingProjects(true);
        setProjectsError(null);
        try {
            const projects = await listProjects();
            const withDesigns = await Promise.all(
                projects.map(async (p) => {
                    try {
                        const specs = await listDesignSpecs(p.id);
                        return apiProjectToAppProject(p, specs);
                    } catch {
                        return apiProjectToAppProject(p);
                    }
                }),
            );
            setExistingProjects(withDesigns);
        } catch (err) {
            setProjectsError(err instanceof Error ? err.message : "Failed to load projects");
        } finally {
            setIsLoadingProjects(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        fetchProjects().then(() => {
            if (cancelled) return;
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasProjects = existingProjects.length > 0;

    const handleConfirmAction = async () => {
        if (!confirmAction) return;
        setIsActionLoading(true);
        try {
            await deleteProject(confirmAction.projectId);
            setConfirmAction(null);
            await fetchProjects();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Action failed");
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleDesignSpecUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setDesignSpecs((prev) => {
                const existingNames = new Set(prev.map((f) => f.name));
                const uniqueNewFiles = newFiles.filter((file) => !existingNames.has(file.name));
                return [...prev, ...uniqueNewFiles];
            });
            // Reset the input so the same file can be selected again if needed
            e.target.value = "";
        }
    };

    const removeDesignSpec = (index: number) => {
        setDesignSpecs((prev) => prev.filter((_, i) => i !== index));
    };

    const handleCreateProject = async () => {
        if (!projectName.trim() || designSpecs.length === 0) return;
        setIsCreating(true);
        setCreateError(null);
        try {
            const created = await createProject({ name: projectName.trim() });
            const uploadedFilenames = await uploadSpecFiles(created.id, designSpecs);
            if (uploadedFilenames.length < designSpecs.length) {
                alert(
                    "Project created, but some design specs failed to upload. Ensure MinIO is running (docker compose up -d).",
                );
            }
            const appProject = apiProjectToAppProject(created, uploadedFilenames);
            setCurrentProject(appProject as unknown as Project);
            router.push("/inspect");
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Failed to create project");
        } finally {
            setIsCreating(false);
        }
    };

    const handleSelectProject = (
        project: Project & {
            createdAt: string;
            updatedAt: string;
            designSpecs: string[];
        },
    ) => {
        setCurrentProject(project as unknown as Project);
        router.push("/inspect");
    };

    const showList = !showNewProject && hasProjects;
    const showCreateForm = showNewProject || (!hasProjects && !isLoadingProjects);

    let projectsContent: React.ReactNode = null;
    if (isLoadingProjects) {
        projectsContent = (
            <div className="flex-1 flex items-center justify-center">
                <p className="text-slate-600 dark:text-zinc-400">Loading projects...</p>
            </div>
        );
    } else if (projectsError) {
        projectsContent = (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
                <Alert variant="error" className="max-w-md">
                    {projectsError}
                </Alert>
                <p className="mt-4 text-sm text-slate-500 dark:text-zinc-500">
                    Ensure the backend is running at {API_BASE_URL}.
                </p>
            </div>
        );
    } else if (showList) {
        projectsContent = (
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="max-w-[1200px] w-full mx-auto px-6 pt-6 pb-2 flex-shrink-0">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
                                Project Setup
                            </h1>
                            <p className="text-slate-600 dark:text-zinc-400">
                                Select an existing project or create a new one
                            </p>
                        </div>
                        <div className="max-w-[800px] mx-auto">
                            {/* Header with Your Projects and Create Button */}
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                                    Your Projects
                                </h2>
                                <Button
                                    variant="default"
                                    size="lg"
                                    className="rounded-lg"
                                    onClick={() => setShowNewProject(true)}
                                >
                                    <Plus /> Create New Project
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Scrollable Projects List */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="max-w-[1200px] w-full mx-auto px-6 pb-8">
                            <div className="max-w-[800px] mx-auto">
                                <div className="space-y-3">
                                    {existingProjects.map((project) => {
                                        const specCount = project.designSpecs?.length || 0;
                                        const isExpanded = expandedSpecs.has(project.id);
                                        return (
                                            <div
                                                key={project.id}
                                                className="w-full text-left p-5 rounded-xl border-2 border-slate-200 dark:border-zinc-800 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-white dark:hover:bg-zinc-900 bg-white dark:bg-zinc-900/50 transition-all group"
                                            >
                                                <div className="flex items-start justify-between">
                                                    <button
                                                        onClick={() => handleSelectProject(project)}
                                                        className="flex-1 text-left"
                                                    >
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <FolderOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                                                {project.name}
                                                            </h3>
                                                        </div>
                                                        <p className="text-xs text-slate-400 dark:text-zinc-600">
                                                            Created{" "}
                                                            {formatDateShort(project.createdAt)}
                                                        </p>
                                                    </button>
                                                    <div className="flex items-center gap-1 ml-3">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConfirmAction({
                                                                    projectId: project.id,
                                                                    projectName: project.name,
                                                                });
                                                            }}
                                                            className="p-2 rounded-lg text-slate-400 dark:text-zinc-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                            title="Delete project"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expandable Design Specs */}
                                                {specCount > 0 && (
                                                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setExpandedSpecs((prev) => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(project.id))
                                                                        next.delete(project.id);
                                                                    else next.add(project.id);
                                                                    return next;
                                                                });
                                                            }}
                                                            className="flex items-center gap-2 text-sm text-slate-500 dark:text-zinc-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                                                        >
                                                            {isExpanded ? (
                                                                <ChevronDown className="w-4 h-4" />
                                                            ) : (
                                                                <ChevronRight className="w-4 h-4" />
                                                            )}
                                                            <FileText className="w-3.5 h-3.5" />
                                                            <span>
                                                                {specCount} design specification
                                                                {specCount !== 1 ? "s" : ""}
                                                            </span>
                                                        </button>

                                                        {isExpanded && (
                                                            <div className="mt-2 ml-6 space-y-1">
                                                                {project.designSpecs.map(
                                                                    (spec, idx) => (
                                                                        <DesignSpecLink
                                                                            key={idx}
                                                                            spec={spec}
                                                                            onPreview={() =>
                                                                                setPreviewSpec({
                                                                                    projectId:
                                                                                        project.id,
                                                                                    filename: spec,
                                                                                })
                                                                            }
                                                                            className="text-sm text-slate-600 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors"
                                                                            leading={
                                                                                <FileText className="w-3.5 h-3.5" />
                                                                            }
                                                                        />
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-slate-50 dark:bg-zinc-950 transition-colors overflow-hidden">
            {projectsContent}

            {/* Confirmation Dialog */}
            {confirmAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                Delete Project
                            </h3>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-zinc-400 mb-6">
                            Are you sure you want to delete{" "}
                            <span className="font-medium text-slate-900 dark:text-white">
                                {confirmAction.projectName}
                            </span>
                            {"? "}The project and its data will be removed from your list.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setConfirmAction(null)}
                                disabled={isActionLoading}
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAction}
                                disabled={isActionLoading}
                                className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50 bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700"
                            >
                                {isActionLoading ? "Processing..." : "Delete"}
                            </button>
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

            {showCreateForm ? (
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-[1200px] w-full mx-auto px-6 pt-6 pb-2 flex-shrink-0">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
                                Project Setup
                            </h1>
                            <p className="text-slate-600 dark:text-zinc-400">
                                Create a new project with design specifications
                            </p>
                        </div>
                        <div className="max-w-[700px] mx-auto">
                            {/* New Project Form */}
                            <div className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl p-8">
                                {/* Project Name */}
                                <div className="mb-8">
                                    <label htmlFor="project-name" className="block text-sm font-semibold text-slate-900 dark:text-white mb-3">
                                        Project Name
                                    </label>
                                    <input
                                        id="project-name"
                                        type="text"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="e.g., Circuit Board QA - Model XR-500"
                                        className="w-full px-4 py-3 bg-white dark:bg-zinc-950 border border-slate-300 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 transition-colors"
                                    />
                                </div>

                                {/* Design Specifications */}
                                <div>
                                    <label htmlFor="design-spec" className="block text-sm font-semibold text-slate-900 dark:text-white mb-3">
                                        Design Specification(s)
                                    </label>

                                    <div className="border-2 border-dashed border-slate-300 dark:border-zinc-700 rounded-xl p-8 text-center bg-slate-50 dark:bg-zinc-950 hover:border-blue-400 dark:hover:border-blue-600 transition-colors mb-4">
                                        <input
                                            type="file"
                                            id="design-spec"
                                            onChange={handleDesignSpecUpload}
                                            accept=".pdf,.txt"
                                            multiple
                                            className="hidden"
                                        />
                                        <label
                                            htmlFor="design-spec"
                                            className="cursor-pointer block"
                                        >
                                            <FileText className="w-10 h-10 text-slate-400 dark:text-zinc-600 mx-auto mb-3" />
                                            <p className="text-slate-900 dark:text-white mb-1">
                                                Drop files here or{" "}
                                                <span className="text-blue-600 dark:text-blue-400 font-medium">
                                                    browse
                                                </span>
                                            </p>
                                            <p className="text-sm text-slate-500 dark:text-zinc-500">
                                                PDF or TXT files
                                            </p>
                                        </label>
                                    </div>

                                    {/* Uploaded Specs List */}
                                    {designSpecs.length > 0 && (
                                        <div className="space-y-4 mb-2">
                                            {designSpecs.map((file, index) => (
                                                <div
                                                    key={index}
                                                    className="flex items-center justify-between bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-lg p-3 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded flex items-center justify-center flex-shrink-0">
                                                            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                        <span className="text-sm text-slate-900 dark:text-white truncate font-medium">
                                                            {file.name}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => removeDesignSpec(index)}
                                                        className="text-slate-400 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 transition-colors ml-2 p-1"
                                                        title="Remove file"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {createError && (
                                    <Alert variant="warning" className="mb-4">
                                        {createError}
                                    </Alert>
                                )}
                                {/* Create Project Button */}
                                <button
                                    onClick={handleCreateProject}
                                    disabled={
                                        !projectName.trim() ||
                                        designSpecs.length === 0 ||
                                        isCreating
                                    }
                                    className={cn(
                                        "w-full font-semibold py-4 px-6 rounded-xl transition-all disabled:cursor-not-allowed shadow-sm mt-6",
                                        projectName.trim() && designSpecs.length > 0 && !isCreating
                                            ? "bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 hover:dark:bg-blue-600 text-white"
                                            : "bg-slate-300 dark:bg-zinc-800 text-slate-500 dark:text-zinc-600",
                                    )}
                                >
                                    {isCreating ? "Creating..." : "Create Project"}
                                </button>

                                {/* Back to Projects List */}
                                {hasProjects && (
                                    <button
                                        onClick={() => setShowNewProject(false)}
                                        className="w-full text-sm text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white mt-4 pt-2 transition-colors"
                                    >
                                        ← Back to projects
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </main>
            ) : null}
        </div>
    );
}
