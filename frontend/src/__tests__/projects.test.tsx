/**
 * Tests for requirements:
 * - Req 3: Upload feature shall allow uploading of multiple design specifications per project
 * - Req 12: Front End system shall group uploaded artifacts by project
 * - Req 13: Front End system shall allow users to create projects with design specifications
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

const mockSetCurrentProject = vi.fn();
let mockUser: { id: string; email: string } | null = { id: "user-1", email: "test@example.com" };
let mockHasRestoredFromStorage = true;
vi.mock("@/app/AppProvider", () => ({
    useApp: () => ({
        user: mockUser,
        hasRestoredFromStorage: mockHasRestoredFromStorage,
        setCurrentProject: mockSetCurrentProject,
    }),
}));

const mockListProjects = vi.fn();
const mockListDesignSpecs = vi.fn();
const mockCreateProject = vi.fn();
const mockUploadDesignSpec = vi.fn();
const mockArchiveProject = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return {
        ...actual,
        listProjects: (...args: unknown[]) => mockListProjects(...args),
        listDesignSpecs: (...args: unknown[]) => mockListDesignSpecs(...args),
        createProject: (...args: unknown[]) => mockCreateProject(...args),
        uploadDesignSpec: (...args: unknown[]) => mockUploadDesignSpec(...args),
        archiveProject: (...args: unknown[]) => mockArchiveProject(...args),
        deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
        API_BASE_URL: "http://localhost:8000",
    };
});

vi.mock("@/components/DesignSpecPreview", () => ({
    default: () => <div data-testid="design-spec-preview" />,
}));
vi.mock("@/components/DesignSpecLink", () => ({
    DesignSpecLink: ({ spec }: { spec: string }) => <span>{spec}</span>,
}));

import ProjectsPage from "@/app/projects/page";

type ApiProject = {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
};

function makeApiProject(overrides: Partial<ApiProject> = {}): ApiProject {
    return {
        id: "proj-1",
        name: "My Project",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeSpecFile(name = "spec.pdf"): File {
    return new File(["pdf content"], name, { type: "application/pdf" });
}

describe("ProjectsPage — Req 13: create projects", () => {
    beforeEach(() => {
        mockUser = { id: "user-1", email: "test@example.com" };
        mockHasRestoredFromStorage = true;
        mockListProjects.mockReset();
        mockListDesignSpecs.mockReset();
        mockCreateProject.mockReset();
        mockUploadDesignSpec.mockReset();
        mockPush.mockReset();
        mockSetCurrentProject.mockReset();

        // Default: no existing projects → show create form directly
        mockListProjects.mockResolvedValue([]);
        mockListDesignSpecs.mockResolvedValue([]);
    });

    it("shows the create project form when no projects exist", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText(/create a new project/i)).toBeInTheDocument());
        expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument();
    });

    it("Create Project button is disabled when name is empty", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByRole("button", { name: /create project/i })).toBeInTheDocument());
        expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
    });

    it("Create Project button is disabled when name is filled but no spec is uploaded", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());
        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "My Project");
        expect(screen.getByRole("button", { name: /create project/i })).toBeDisabled();
    });

    it("Create Project button is enabled when name and at least one spec are provided", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());
        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "My Project");

        const specInput = screen.getByLabelText(/drop files here/i);
        await userEvent.upload(specInput, makeSpecFile("spec.pdf"));

        expect(screen.getByRole("button", { name: /create project/i })).not.toBeDisabled();
    });

    it("calls createProject then uploadDesignSpec for each file on submit", async () => {
        mockCreateProject.mockResolvedValue(makeApiProject({ id: "new-proj" }));
        mockUploadDesignSpec.mockResolvedValue({ filename: "spec.pdf", project_id: "new-proj", object_key: "k" });

        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());

        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "My Project");
        const specInput = screen.getByLabelText(/drop files here/i);
        await userEvent.upload(specInput, [makeSpecFile("a.pdf"), makeSpecFile("b.pdf")]);
        await userEvent.click(screen.getByRole("button", { name: /create project/i }));

        await waitFor(() => expect(mockCreateProject).toHaveBeenCalledWith({ name: "My Project" }));
        await waitFor(() => expect(mockUploadDesignSpec).toHaveBeenCalledTimes(2));
    });

    it("navigates to /inspect after successful project creation", async () => {
        mockCreateProject.mockResolvedValue(makeApiProject({ id: "new-proj" }));
        mockUploadDesignSpec.mockResolvedValue({ filename: "spec.pdf", project_id: "new-proj", object_key: "k" });

        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());

        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "My Project");
        const specInput = screen.getByLabelText(/drop files here/i);
        await userEvent.upload(specInput, makeSpecFile("spec.pdf"));
        await userEvent.click(screen.getByRole("button", { name: /create project/i }));

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/inspect"));
    });
});

describe("ProjectsPage — Req 3: multiple design specs upload", () => {
    beforeEach(() => {
        mockListProjects.mockResolvedValue([]);
        mockListDesignSpecs.mockResolvedValue([]);
        mockCreateProject.mockReset();
        mockUploadDesignSpec.mockReset();
    });

    it("design spec file input has multiple attribute", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByLabelText(/drop files here/i)).toBeInTheDocument());
        const specInput = screen.getByLabelText(/drop files here/i);
        expect(specInput).toHaveAttribute("multiple");
    });

    it("selecting multiple spec files shows each filename", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByLabelText(/drop files here/i)).toBeInTheDocument());

        const specInput = screen.getByLabelText(/drop files here/i);
        await userEvent.upload(specInput, [makeSpecFile("spec-a.pdf"), makeSpecFile("spec-b.pdf")]);

        expect(screen.getByText("spec-a.pdf")).toBeInTheDocument();
        expect(screen.getByText("spec-b.pdf")).toBeInTheDocument();
    });

    it("uploadDesignSpec is called once per spec file submitted", async () => {
        mockCreateProject.mockResolvedValue(makeApiProject({ id: "proj-x" }));
        mockUploadDesignSpec.mockResolvedValue({ filename: "s.pdf", project_id: "proj-x", object_key: "k" });

        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());
        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "P");

        const specInput = screen.getByLabelText(/drop files here/i);
        await userEvent.upload(specInput, [makeSpecFile("a.pdf"), makeSpecFile("b.pdf"), makeSpecFile("c.pdf")]);
        await userEvent.click(screen.getByRole("button", { name: /create project/i }));

        await waitFor(() => expect(mockUploadDesignSpec).toHaveBeenCalledTimes(3));
    });
});

describe("ProjectsPage — Req 12: group artifacts by project", () => {
    beforeEach(() => {
        mockUser = { id: "user-1", email: "test@example.com" };
        mockHasRestoredFromStorage = true;
        mockListDesignSpecs.mockReset();
        mockListProjects.mockReset();
        mockPush.mockReset();
    });

    it("renders each project as its own separate card", async () => {
        mockListProjects.mockResolvedValue([
            makeApiProject({ id: "p1", name: "Alpha Project" }),
            makeApiProject({ id: "p2", name: "Beta Project" }),
        ]);
        mockListDesignSpecs.mockImplementation((id: string) => {
            if (id === "p1") return Promise.resolve(["alpha-spec.pdf"]);
            if (id === "p2") return Promise.resolve(["beta-spec.pdf"]);
            return Promise.resolve([]);
        });

        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText("Alpha Project")).toBeInTheDocument());
        expect(screen.getByText("Beta Project")).toBeInTheDocument();
    });
});

describe("ProjectsPage — auth redirect", () => {
    beforeEach(() => {
        mockHasRestoredFromStorage = true;
        mockListProjects.mockResolvedValue([]);
        mockListDesignSpecs.mockResolvedValue([]);
        mockPush.mockReset();
        mockReplace.mockReset();
    });

    it("redirects to /login when user is null after storage is restored", async () => {
        mockUser = null;
        render(<ProjectsPage />);
        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
    });

    it("does not redirect when user is present", async () => {
        mockUser = { id: "user-1", email: "test@example.com" };
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText(/create a new project/i)).toBeInTheDocument());
        expect(mockReplace).not.toHaveBeenCalled();
    });
});

describe("ProjectsPage — loading and error states", () => {
    beforeEach(() => {
        mockUser = { id: "user-1", email: "test@example.com" };
        mockHasRestoredFromStorage = true;
        mockListProjects.mockReset();
        mockListDesignSpecs.mockReset();
    });

    it("shows loading indicator while projects are being fetched", () => {
        mockListProjects.mockReturnValue(new Promise(() => {})); // never resolves
        mockListDesignSpecs.mockResolvedValue([]);
        render(<ProjectsPage />);
        expect(screen.getByText(/loading projects/i)).toBeInTheDocument();
    });

    it("shows error alert when listProjects rejects", async () => {
        mockListProjects.mockRejectedValue(new Error("Network error"));
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
    });
});

describe("ProjectsPage — project list interactions", () => {
    beforeEach(() => {
        mockUser = { id: "user-1", email: "test@example.com" };
        mockHasRestoredFromStorage = true;
        mockListProjects.mockReset();
        mockListDesignSpecs.mockReset();
        mockListProjects.mockResolvedValue([
            makeApiProject({ id: "p1", name: "Alpha Project" }),
        ]);
        mockListDesignSpecs.mockResolvedValue([]);
        mockDeleteProject.mockReset();
        mockPush.mockReset();
        mockSetCurrentProject.mockReset();
    });

    it("selecting a project calls setCurrentProject and navigates to /inspect", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText("Alpha Project")).toBeInTheDocument());
        await userEvent.click(screen.getByText("Alpha Project"));
        expect(mockSetCurrentProject).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/inspect");
    });

    it("clicking trash icon shows the delete confirmation dialog", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByTitle("Delete project")).toBeInTheDocument());
        await userEvent.click(screen.getByTitle("Delete project"));
        expect(screen.getByText(/delete project/i)).toBeInTheDocument();
        expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    });

    it("clicking Cancel in the confirmation dialog dismisses it", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByTitle("Delete project")).toBeInTheDocument());
        await userEvent.click(screen.getByTitle("Delete project"));
        await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
        expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
    });

    it("confirming delete calls deleteProject and refreshes the list", async () => {
        mockDeleteProject.mockResolvedValue(undefined);
        mockListProjects
            .mockResolvedValueOnce([makeApiProject({ id: "p1", name: "Alpha Project" })])
            .mockResolvedValueOnce([]);

        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByTitle("Delete project")).toBeInTheDocument());
        await userEvent.click(screen.getByTitle("Delete project"));
        await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

        await waitFor(() => expect(mockDeleteProject).toHaveBeenCalledWith("p1"));
        await waitFor(() => expect(mockListProjects).toHaveBeenCalledTimes(2));
    });

    it("clicking Create New Project button switches to the create form", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByRole("button", { name: /create new project/i })).toBeInTheDocument());
        await userEvent.click(screen.getByRole("button", { name: /create new project/i }));
        expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument();
    });

    it("Back to projects button returns to the project list", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByRole("button", { name: /create new project/i })).toBeInTheDocument());
        await userEvent.click(screen.getByRole("button", { name: /create new project/i }));
        await userEvent.click(screen.getByText(/back to projects/i));
        await waitFor(() => expect(screen.getByText("Alpha Project")).toBeInTheDocument());
    });
});

describe("ProjectsPage — design spec expand/collapse and preview", () => {
    beforeEach(() => {
        mockUser = { id: "user-1", email: "test@example.com" };
        mockHasRestoredFromStorage = true;
        mockListProjects.mockResolvedValue([
            makeApiProject({ id: "p1", name: "Alpha Project" }),
        ]);
        mockListDesignSpecs.mockResolvedValue(["spec-a.pdf", "spec-b.pdf"]);
    });

    it("design spec count toggle expands to show spec filenames", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText(/2 design specifications/i)).toBeInTheDocument());
        await userEvent.click(screen.getByText(/2 design specifications/i));
        expect(screen.getByText("spec-a.pdf")).toBeInTheDocument();
        expect(screen.getByText("spec-b.pdf")).toBeInTheDocument();
    });

    it("clicking the toggle a second time collapses the spec list", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByText(/2 design specifications/i)).toBeInTheDocument());
        await userEvent.click(screen.getByText(/2 design specifications/i));
        await userEvent.click(screen.getByText(/2 design specifications/i));
        expect(screen.queryByText("spec-a.pdf")).not.toBeInTheDocument();
    });
});

describe("ProjectsPage — create form file management", () => {
    beforeEach(() => {
        mockUser = { id: "user-1", email: "test@example.com" };
        mockHasRestoredFromStorage = true;
        mockListProjects.mockResolvedValue([]);
        mockListDesignSpecs.mockResolvedValue([]);
        mockCreateProject.mockReset();
        mockUploadDesignSpec.mockReset();
    });

    it("removing a spec file with the X button removes it from the list", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByLabelText(/drop files here/i)).toBeInTheDocument());
        await userEvent.upload(screen.getByLabelText(/drop files here/i), makeSpecFile("remove-me.pdf"));
        expect(screen.getByText("remove-me.pdf")).toBeInTheDocument();
        await userEvent.click(screen.getByTitle("Remove file"));
        expect(screen.queryByText("remove-me.pdf")).not.toBeInTheDocument();
    });

    it("uploading a duplicate filename does not add a second entry", async () => {
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByLabelText(/drop files here/i)).toBeInTheDocument());
        await userEvent.upload(screen.getByLabelText(/drop files here/i), makeSpecFile("dup.pdf"));
        await userEvent.upload(screen.getByLabelText(/drop files here/i), makeSpecFile("dup.pdf"));
        expect(screen.getAllByText("dup.pdf")).toHaveLength(1);
    });

    it("shows an error alert when createProject fails", async () => {
        mockCreateProject.mockRejectedValue(new Error("Server error"));
        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());
        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "My Project");
        await userEvent.upload(screen.getByLabelText(/drop files here/i), makeSpecFile("spec.pdf"));
        await userEvent.click(screen.getByRole("button", { name: /create project/i }));
        await waitFor(() => expect(screen.getByText(/server error/i)).toBeInTheDocument());
    });

    it("calls setCurrentProject with the newly created project", async () => {
        mockCreateProject.mockResolvedValue(makeApiProject({ id: "new-proj" }));
        mockUploadDesignSpec.mockResolvedValue({ filename: "spec.pdf", project_id: "new-proj", object_key: "k" });

        render(<ProjectsPage />);
        await waitFor(() => expect(screen.getByPlaceholderText(/circuit board/i)).toBeInTheDocument());
        await userEvent.type(screen.getByPlaceholderText(/circuit board/i), "My Project");
        await userEvent.upload(screen.getByLabelText(/drop files here/i), makeSpecFile("spec.pdf"));
        await userEvent.click(screen.getByRole("button", { name: /create project/i }));

        await waitFor(() => expect(mockSetCurrentProject).toHaveBeenCalledWith(
            expect.objectContaining({ id: "new-proj", name: "My Project" }),
        ));
    });
});
