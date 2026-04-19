// lib/contexts/app-context.tsx
"use client";

import {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useState,
} from "react";

/**
 * Minimal AppProvider
 * - persisted across refresh: theme, sidebarOpen, currentProject
 * - logout behaviour: call clearProjectOnLogout() to remove only currentProject
 */

/* ---------- Types ---------- */
export type Theme = "light" | "dark";

export type Project = {
    id: string;
    name: string;
    description?: string;
    createdAt: string; // ISO string
    updatedAt: string; // ISO string
    designSpecs: string[]; // filenames of uploaded design specs
};

export type User = { id: string; email: string } | null;

type AppState = {
    theme: Theme;
    sidebarOpen: boolean;
    currentProject: Project | null;
    user: User;
    /** True after first client mount once we've read user from localStorage; prevents redirect before restore. */
    hasRestoredFromStorage: boolean;

    /* actions */
    setTheme: (t: Theme) => void;
    toggleTheme: () => void;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
    setCurrentProject: (p: Project | null) => void;
    setUser: (u: User) => void;
    clearProjectOnLogout: () => void;
};

const STORAGE_KEY = "gladosApp:state";

/* ---------- Defaults ---------- */
const DEFAULTS = {
    theme: "light" as Theme,
    sidebarOpen: true,
    currentProject: null as Project | null,
    user: null as User,
};

/* ---------- Context ---------- */
const AppContext = createContext<AppState | undefined>(undefined);

/* ---------- Provider ---------- */
export default function AppProvider({ children }: { children: ReactNode }) {
    // lazy inits read storage synchronously on first client render (avoids flicker)
    const [theme, setThemeState] = useState<Theme>(DEFAULTS.theme);
    const [sidebarOpen, setSidebarOpenState] = useState<boolean>(DEFAULTS.sidebarOpen);
    const [currentProject, setCurrentProjectState] = useState<Project | null>(
        DEFAULTS.currentProject,
    );
    const [user, setUserState] = useState<User>(DEFAULTS.user);
    const [hasRestoredFromStorage, setHasRestoredFromStorage] = useState(false);

    // Hydrate from storage synchronously before paint to avoid flicker
    useLayoutEffect(() => {
        const stored = readStorage();
        // Only set if values differ to avoid unnecessary updates
        if (stored.theme !== theme) setThemeState(stored.theme);
        if (stored.sidebarOpen !== sidebarOpen) setSidebarOpenState(stored.sidebarOpen);
        if (stored.currentProject !== currentProject) setCurrentProjectState(stored.currentProject);
        if (stored.user !== user) setUserState(stored.user);
        setHasRestoredFromStorage(true);
        // Note: no dependencies to run only once after mount
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // run once on mount (client only)

    // persist whenever these change
    useEffect(() => {
        writeStorage({ theme, sidebarOpen, currentProject, user });
    }, [theme, sidebarOpen, currentProject, user]);

    // Apply dark mode class to <html> for Tailwind dark: variants and CSS variables
    useEffect(() => {
        if (typeof document === "undefined") return;
        const root = document.documentElement;
        if (theme === "dark") {
            root.classList.add("dark");
        } else {
            root.classList.remove("dark");
        }
    }, [theme]);

    /* ---------- Actions ---------- */
    const setTheme = (t: Theme) => setThemeState(t);

    const toggleTheme = () => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
    };

    const setSidebarOpen = (open: boolean) => setSidebarOpenState(open);

    const toggleSidebar = () => setSidebarOpenState((s) => !s);

    const setCurrentProject = (p: Project | null) => setCurrentProjectState(p ? { ...p } : null);

    const setUser = (u: User) => setUserState(u);

    // Call this when the user logs out. It removes the currentProject and user,
    // but keeps theme and sidebarOpen persisted.
    const clearProjectOnLogout = () => {
        setCurrentProjectState(null);
        setUserState(null);
        try {
            if (
                typeof localStorage === "undefined" ||
                typeof localStorage.getItem !== "function" ||
                typeof localStorage.setItem !== "function"
            )
                return;
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            parsed.currentProject = null;
            parsed.user = null;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        } catch (e) {
            // ignore
        }
    };

    const value = useMemo(
        () => ({
            theme,
            sidebarOpen,
            currentProject,
            user,
            hasRestoredFromStorage,
            setTheme,
            toggleTheme,
            setSidebarOpen,
            toggleSidebar,
            setCurrentProject,
            setUser,
            clearProjectOnLogout,
        }),
        [theme, sidebarOpen, currentProject, user, hasRestoredFromStorage],
    );

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* ---------- Hook ---------- */
export function useApp() {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error("useApp must be used inside AppProvider");
    return ctx;
}

/* ---------- Helpers ---------- */
function readStorage(): { theme: Theme; sidebarOpen: boolean; currentProject: Project | null; user: User } {
    try {
        if (
            typeof window === "undefined" ||
            typeof localStorage === "undefined" ||
            typeof localStorage.getItem !== "function"
        )
            return {
                theme: DEFAULTS.theme,
                sidebarOpen: DEFAULTS.sidebarOpen,
                currentProject: DEFAULTS.currentProject,
                user: DEFAULTS.user,
            };
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {
                theme: DEFAULTS.theme,
                sidebarOpen: DEFAULTS.sidebarOpen,
                currentProject: DEFAULTS.currentProject,
                user: DEFAULTS.user,
            };
        const parsed = JSON.parse(raw);
        const storedUser = parsed?.user;
        const user: User =
            storedUser &&
            typeof storedUser === "object" &&
            typeof storedUser.id === "string" &&
            typeof storedUser.email === "string"
                ? { id: storedUser.id, email: storedUser.email }
                : DEFAULTS.user;
        return {
            theme: (parsed?.theme as Theme) ?? DEFAULTS.theme,
            sidebarOpen:
                typeof parsed?.sidebarOpen === "boolean"
                    ? parsed.sidebarOpen
                    : DEFAULTS.sidebarOpen,
            currentProject: parsed?.currentProject ?? DEFAULTS.currentProject,
            user,
        };
    } catch (e) {
        console.warn("readStorageSafe error", e);
        return {
            theme: DEFAULTS.theme,
            sidebarOpen: DEFAULTS.sidebarOpen,
            currentProject: DEFAULTS.currentProject,
            user: DEFAULTS.user,
        };
    }
}

function writeStorage(payload: {
    theme: Theme;
    sidebarOpen: boolean;
    currentProject: Project | null;
    user: User;
}) {
    try {
        if (
            typeof window === "undefined" ||
            typeof localStorage === "undefined" ||
            typeof localStorage.setItem !== "function"
        )
            return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        // ignore quota errors
    }
}
