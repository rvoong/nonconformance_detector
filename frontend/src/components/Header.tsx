"use client";

/**
 * Header component for the application.
 */

import { usePathname, useRouter } from "next/navigation";
import { Activity, FolderOpen, Sun, Moon, LogOut } from "lucide-react";
import { useApp } from "@/app/AppProvider";
import { Button } from "@/components/ui/button";

export const headerHeight = "60px";

export default function Header() {
    const router = useRouter();
    const pathname = usePathname();

    // App context
    const { theme, currentProject, toggleTheme, setCurrentProject, clearProjectOnLogout } =
        useApp();

    const handleLogout = () => {
        clearProjectOnLogout();
        setCurrentProject(null);
        router.push("/login");
    };

    const handleSwitchProject = () => {
        // clear current project and go to projects list
        setCurrentProject(null);
        router.push("/projects");
    };

    const isProjectsPage = pathname === "/projects";
    const showProjectArea = !isProjectsPage;

    return (
        <header
            className="print:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800"
            style={{ height: headerHeight }}
        >
            <div className="flex w-full h-full items-center px-6">
                <div className="w-[400px] flex-shrink-0 flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => router.push("/projects")}
                        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                    >
                        <div className="w-8 h-8 bg-blue-600 dark:bg-blue-500 rounded flex items-center justify-center">
                            <Activity className="text-white" strokeWidth={2.5} size={18} />
                        </div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-white">GLaDOS</h1>
                    </button>

                    {/* Project display or Select Project - hidden on /projects page */}
                    {showProjectArea && (
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-zinc-800 rounded-md border border-slate-200 dark:border-zinc-700 whitespace-nowrap">
                            <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            {currentProject ? (
                                <>
                                    <span className="text-xs font-medium text-slate-900 dark:text-white">
                                        {currentProject.name}
                                    </span>
                                    <Button
                                        onClick={handleSwitchProject}
                                        variant="ghost"
                                        size="sm"
                                        className="text-xs h-6 py-0 px-1.5 flex-shrink-0 text-muted-foreground hover:text-primary"
                                    >
                                        Switch
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    onClick={handleSwitchProject}
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs h-6 py-0 px-1.5 flex-shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium"
                                >
                                    Select Project
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* CENTER (flex filler) - keeps layout stable and allows left to be left-aligned */}
                <div className="flex-1" />

                {/* RIGHT: actions (separate sibling, not inside left container) */}
                <div className="w-[400px] flex-shrink-0 flex items-center justify-end gap-0">
                    <Button onClick={toggleTheme} variant="ghost" size="icon" title="Toggle theme">
                        {theme === "dark" ? <Sun /> : <Moon />}
                    </Button>
                    {pathname !== "/login" && (
                        <Button onClick={handleLogout} variant="ghost" size="icon" title="Logout">
                            <LogOut />
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}
