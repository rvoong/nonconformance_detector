/**
 * Tests for requirements:
 * - Req 2: Front End system shall have an upload feature
 * - Req 4: Upload feature shall allow uploading of multiple images per project
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

const mockProject = {
    id: "proj-1",
    name: "Test Project",
    designSpecs: ["spec.pdf"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
};

vi.mock("@/app/AppProvider", () => ({
    useApp: () => ({
        user: { id: "user-1", email: "test@example.com" },
        currentProject: mockProject,
        hasRestoredFromStorage: true,
        setCurrentProject: vi.fn(),
    }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return {
        ...actual,
        uploadImage: vi.fn().mockResolvedValue({ submission_id: "sub-1" }),
        listDesignSpecs: vi.fn().mockResolvedValue(["spec.pdf"]),
        getInspectionPrompt: vi.fn().mockResolvedValue({ prompt: "Inspect for FOD." }),
    };
});

vi.mock("@/components/DesignSpecPreview", () => ({
    default: () => <div data-testid="design-spec-preview" />,
}));

vi.mock("@/components/DesignSpecLink", () => ({
    DesignSpecLink: ({ spec }: { spec: string }) => <span>{spec}</span>,
}));

// jsdom doesn't implement URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => "blob:mock-url");
global.URL.revokeObjectURL = vi.fn();

import { uploadImage } from "@/lib/api";
const mockUploadImage = vi.mocked(uploadImage);

import InspectPage from "@/app/inspect/page";

function makeImageFile(name = "photo.jpg"): File {
    return new File(["img-content"], name, { type: "image/jpeg" });
}

describe("InspectPage — Req 2: upload feature", () => {
    beforeEach(() => {
        mockUploadImage.mockReset();
        mockUploadImage.mockResolvedValue({
            filename: "photo.jpg",
            project_id: "proj-1",
            object_key: "proj-1/images/photo.jpg",
            submission_id: "sub-1",
        });
    });

    it("renders the Upload Product Photos section", () => {
        render(<InspectPage />);
        expect(screen.getByRole("heading", { name: /upload product photos/i })).toBeInTheDocument();
    });

    it("shows a file input for product photos", () => {
        render(<InspectPage />);
        expect(screen.getByLabelText(/drop product photos/i)).toBeInTheDocument();
    });

    it("shows a Start Analysis button", () => {
        render(<InspectPage />);
        expect(screen.getByRole("button", { name: /start analysis/i })).toBeInTheDocument();
    });

    it("shows upload error alert when uploadImage fails", async () => {
        mockUploadImage.mockRejectedValue(new Error("Upload failed"));
        render(<InspectPage />);

        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, makeImageFile("bad.jpg"));
        await userEvent.click(screen.getByRole("button", { name: /start analysis/i }));

        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
        expect(screen.getByRole("alert")).toHaveTextContent(/upload failed/i);
    });

    it("dispatches SUBMISSION_UPLOADED_EVENT after each successful upload", async () => {
        const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");
        render(<InspectPage />);

        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, makeImageFile("ok.jpg"));
        await userEvent.click(screen.getByRole("button", { name: /start analysis/i }));

        await waitFor(() =>
            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({ type: "glados:submission-uploaded" }),
            ),
        );
        dispatchSpy.mockRestore();
    });
});

describe("InspectPage — Req 4: multiple images upload", () => {
    beforeEach(() => {
        mockUploadImage.mockReset();
        mockUploadImage.mockResolvedValue({
            filename: "photo.jpg",
            project_id: "proj-1",
            object_key: "proj-1/images/photo.jpg",
            submission_id: "sub-1",
        });
    });

    it("file input has multiple attribute", () => {
        render(<InspectPage />);
        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        expect(input).toHaveAttribute("multiple");
    });

    it("text indicates multiple images are supported", () => {
        render(<InspectPage />);
        expect(screen.getByText(/multiple images supported/i)).toBeInTheDocument();
    });

    it("selecting multiple images shows them in a preview grid", async () => {
        render(<InspectPage />);
        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, [makeImageFile("a.jpg"), makeImageFile("b.jpg"), makeImageFile("c.jpg")]);

        // 3 img elements should be rendered (one per photo)
        expect(screen.getAllByRole("img")).toHaveLength(3);
    });

    it("each selected image has a remove button", async () => {
        render(<InspectPage />);
        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, [makeImageFile("a.jpg"), makeImageFile("b.jpg")]);

        const removeButtons = screen.getAllByRole("button", { name: /remove/i });
        expect(removeButtons).toHaveLength(2);
    });

    it("clicking remove decreases the preview count by one", async () => {
        render(<InspectPage />);
        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, [makeImageFile("a.jpg"), makeImageFile("b.jpg")]);

        expect(screen.getAllByRole("img")).toHaveLength(2);
        const [firstRemove] = screen.getAllByRole("button", { name: /remove/i });
        await userEvent.click(firstRemove);
        expect(screen.getAllByRole("img")).toHaveLength(1);
    });

    it("calls uploadImage once per selected file on Start Analysis", async () => {
        render(<InspectPage />);
        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, [makeImageFile("a.jpg"), makeImageFile("b.jpg")]);
        await userEvent.click(screen.getByRole("button", { name: /start analysis/i }));

        await waitFor(() => expect(mockUploadImage).toHaveBeenCalledTimes(2));
    });

    it("dispatches SUBMISSION_UPLOADED_EVENT once per uploaded file", async () => {
        const dispatchSpy = vi.spyOn(globalThis, "dispatchEvent");
        render(<InspectPage />);
        const input = screen.getByLabelText(/drop product photos/i) as HTMLInputElement;
        await userEvent.upload(input, [makeImageFile("a.jpg"), makeImageFile("b.jpg")]);
        await userEvent.click(screen.getByRole("button", { name: /start analysis/i }));

        await waitFor(() => {
            const uploadEvents = dispatchSpy.mock.calls.filter(
                ([e]) => (e as Event).type === "glados:submission-uploaded",
            );
            expect(uploadEvents).toHaveLength(2);
        });
        dispatchSpy.mockRestore();
    });
});
