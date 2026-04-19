/**
 * Tests for InspectHistorySidebar:
 * - StatusBadge renders correct label for each status
 * - Empty state renders when no submissions
 * - Submission cards render filename, date/time, and status badge
 * - Active submissions are not clickable; completed ones navigate on click/Enter
 * - handleStatusChange fires the correct toast for each status transition
 * - Req 6: Toast on inspection complete (PASS)
 * - Req 8: Toast on inspection failed/error
 * - Req 9: Toast on new active submission
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { StatusChangeEvent } from "@/hooks/useInspectionHistory";
import type { ApiSubmission } from "@/lib/api";

// --- Mocks ---
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("@/app/AppProvider", () => ({
    useApp: () => ({ currentProject: { id: "proj-1", name: "Test Project" } }),
}));

const mockAddToast = vi.fn();
vi.mock("@/context/ToastContext", () => ({
    useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("@/lib/utils", () => ({
    formatDateShort: () => "Mar 1",
    formatTimeShort: () => "10:00 AM",
}));

// Capture onStatusChange so tests can fire transitions
let capturedOnStatusChange: ((e: StatusChangeEvent) => void) | undefined;
let mockSubmissions: ApiSubmission[] = [];
let mockImageUrls: Record<string, string> = {};

vi.mock("@/hooks/useInspectionHistory", () => ({
    useInspectionHistory: (_projectId: string | undefined, onStatusChange?: (e: StatusChangeEvent) => void) => {
        capturedOnStatusChange = onStatusChange;
        return { submissions: mockSubmissions, imageUrls: mockImageUrls };
    },
}));

import InspectHistorySidebar from "@/components/InspectHistorySidebar";

function makeSubmission(overrides: Partial<ApiSubmission> = {}): ApiSubmission {
    return {
        id: "sub-1",
        project_id: "proj-1",
        submitted_by_user_id: "user-1",
        submitted_at: "2026-03-01T10:00:00Z",
        image_id: "proj-1/images/bolt.png",
        status: "complete",
        pass_fail: "pass",
        anomaly_count: 0,
        error_message: null,
        ...overrides,
    };
}

beforeEach(() => {
    mockPush.mockReset();
    mockAddToast.mockReset();
    capturedOnStatusChange = undefined;
    mockSubmissions = [];
    mockImageUrls = {};
});

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------
describe("StatusBadge", () => {
    it("shows ANALYZING for running status", () => {
        mockSubmissions = [makeSubmission({ status: "running" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText(/ANALYZING/)).toBeInTheDocument();
    });

    it("shows QUEUED for queued status", () => {
        mockSubmissions = [makeSubmission({ status: "queued" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("QUEUED")).toBeInTheDocument();
    });

    it("shows ERROR for error status", () => {
        mockSubmissions = [makeSubmission({ status: "error", pass_fail: "unknown" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("ERROR")).toBeInTheDocument();
    });

    it("shows TIMEOUT for timeout status", () => {
        mockSubmissions = [makeSubmission({ status: "timeout", pass_fail: "unknown" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("TIMEOUT")).toBeInTheDocument();
    });

    it("shows PASS for a complete passing submission", () => {
        mockSubmissions = [makeSubmission({ status: "complete", pass_fail: "pass" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("PASS")).toBeInTheDocument();
    });

    it("shows FAILED for a non-passing, non-error, non-timeout submission", () => {
        mockSubmissions = [makeSubmission({ status: "failed", pass_fail: "fail" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("FAILED")).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------
describe("empty state", () => {
    it("shows 'No inspections yet' when there are no submissions", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("No inspections yet")).toBeInTheDocument();
    });

    it("does not show 'No inspections yet' when submissions are present", () => {
        mockSubmissions = [makeSubmission()];
        render(<InspectHistorySidebar />);
        expect(screen.queryByText("No inspections yet")).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Submission card rendering
// ---------------------------------------------------------------------------
describe("submission card", () => {
    it("renders the filename extracted from image_id", () => {
        mockSubmissions = [makeSubmission({ image_id: "proj-1/images/turbine.png" })];
        render(<InspectHistorySidebar />);
        expect(screen.getByText("turbine.png")).toBeInTheDocument();
    });

    it("renders the formatted date and time", () => {
        mockSubmissions = [makeSubmission()];
        render(<InspectHistorySidebar />);
        expect(screen.getByText(/Mar 1/)).toBeInTheDocument();
        expect(screen.getByText(/10:00 AM/)).toBeInTheDocument();
    });

    it("renders a thumbnail img when imageUrl is available", () => {
        mockSubmissions = [makeSubmission({ image_id: "proj-1/images/bolt.png" })];
        mockImageUrls = { "proj-1/images/bolt.png": "http://example.com/bolt.png" };
        render(<InspectHistorySidebar />);
        const img = screen.getByRole("img", { name: "bolt.png" });
        expect(img).toHaveAttribute("src", "http://example.com/bolt.png");
    });

    it("renders a skeleton placeholder when imageUrl is not yet available", () => {
        mockSubmissions = [makeSubmission({ image_id: "proj-1/images/bolt.png" })];
        mockImageUrls = {};
        render(<InspectHistorySidebar />);
        expect(screen.queryByRole("img")).not.toBeInTheDocument();
    });

    it("renders the History heading", () => {
        render(<InspectHistorySidebar />);
        expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    });

    it("renders a New link pointing to /inspect", () => {
        render(<InspectHistorySidebar />);
        expect(screen.getByRole("link", { name: /new/i })).toHaveAttribute("href", "/inspect");
    });
});

// ---------------------------------------------------------------------------
// Click / keyboard navigation
// ---------------------------------------------------------------------------
describe("navigation", () => {
    it("navigates to the result page when a completed card is clicked", () => {
        mockSubmissions = [makeSubmission({ id: "sub-42", status: "complete", pass_fail: "pass" })];
        render(<InspectHistorySidebar />);
        fireEvent.click(screen.getByRole("button"));
        expect(mockPush).toHaveBeenCalledWith("/inspect/result/api-sub-42");
    });

    it("navigates on Enter key for a completed card", () => {
        mockSubmissions = [makeSubmission({ id: "sub-42", status: "complete", pass_fail: "pass" })];
        render(<InspectHistorySidebar />);
        fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
        expect(mockPush).toHaveBeenCalledWith("/inspect/result/api-sub-42");
    });

    it("does not navigate when a running card is clicked", () => {
        mockSubmissions = [makeSubmission({ status: "running" })];
        render(<InspectHistorySidebar />);
        // active cards have no role="button"
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not navigate when a queued card is clicked", () => {
        mockSubmissions = [makeSubmission({ status: "queued" })];
        render(<InspectHistorySidebar />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// handleStatusChange — toast notifications
// ---------------------------------------------------------------------------
describe("handleStatusChange — Req 9: new active submission", () => {
    it("shows 'Inspection submitted' info toast when a new queued submission appears", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ image_id: "proj-1/images/engine.png", status: "queued" }),
            previousStatus: "__new__",
            currentStatus: "queued",
        });
        expect(mockAddToast).toHaveBeenCalledWith("Inspection submitted", {
            description: "engine.png",
            variant: "info",
        });
    });

    it("shows 'Inspection submitted' info toast when a new running submission appears", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ image_id: "proj-1/images/engine.png", status: "running" }),
            previousStatus: "__new__",
            currentStatus: "running",
        });
        expect(mockAddToast).toHaveBeenCalledWith("Inspection submitted", {
            description: "engine.png",
            variant: "info",
        });
    });

    it("does not show a toast for __new__ submissions that are already complete", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ status: "complete", pass_fail: "pass" }),
            previousStatus: "__new__",
            currentStatus: "complete",
        });
        expect(mockAddToast).not.toHaveBeenCalled();
    });
});

describe("handleStatusChange — Req 6: inspection complete", () => {
    it("shows 'Inspection complete — PASS' success toast when running → pass", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ image_id: "proj-1/images/bolt.png", pass_fail: "pass" }),
            previousStatus: "running",
            currentStatus: "complete",
        });
        expect(mockAddToast).toHaveBeenCalledWith("Inspection complete — PASS", {
            description: "bolt.png",
            variant: "success",
        });
    });

    it("shows 'Inspection complete — PASS' success toast when queued → pass", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ image_id: "proj-1/images/bolt.png", pass_fail: "pass" }),
            previousStatus: "queued",
            currentStatus: "complete",
        });
        expect(mockAddToast).toHaveBeenCalledWith("Inspection complete — PASS", {
            description: "bolt.png",
            variant: "success",
        });
    });
});

describe("handleStatusChange — Req 8: inspection failed/errored", () => {
    it("shows 'Inspection timed out' warning toast when running → timeout", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ image_id: "proj-1/images/bolt.png", pass_fail: "unknown", status: "timeout" }),
            previousStatus: "running",
            currentStatus: "timeout",
        });
        expect(mockAddToast).toHaveBeenCalledWith("Inspection timed out", {
            description: "bolt.png",
            variant: "warning",
        });
    });

    it("shows 'Inspection error' error toast when running → error", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ image_id: "proj-1/images/bolt.png", pass_fail: "unknown", status: "error" }),
            previousStatus: "running",
            currentStatus: "error",
        });
        expect(mockAddToast).toHaveBeenCalledWith("Inspection error", {
            description: "bolt.png",
            variant: "error",
        });
    });

    it("does not show a toast when the previous status was not active", () => {
        mockSubmissions = [];
        render(<InspectHistorySidebar />);
        capturedOnStatusChange!({
            submission: makeSubmission({ status: "complete", pass_fail: "pass" }),
            previousStatus: "complete",
            currentStatus: "complete",
        });
        expect(mockAddToast).not.toHaveBeenCalled();
    });
});
