/**
 * Tests for requirements:
 * - Req 5: Front End system shall have a view reports feature
 * - Req 6: Reports feature shall show past FOD classifications
 * - Req 7: Reports feature shall show classification reports grouped by project
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
    useParams: () => ({ id: "api-sub-1" }),
    useSearchParams: () => ({ get: () => null }),
}));

const mockCurrentProject = {
    id: "proj-1",
    name: "Runway Inspection",
    designSpecs: ["runway-spec.pdf"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
};

vi.mock("@/app/AppProvider", () => ({
    useApp: () => ({ currentProject: mockCurrentProject }),
}));

// inspection-store: force API path by returning null from getInspection
vi.mock("@/lib/inspection-store", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/inspection-store")>();
    return {
        ...actual,
        getInspection: vi.fn().mockReturnValue(null),
        toSubmissions: (r: import("@/lib/inspection-store").InspectionResult) => r.submissions ?? [],
        isInspectionRunning: (r: import("@/lib/inspection-store").InspectionResult) => r.status === "running",
        INSPECTION_UPDATE_EVENT: "glados:inspections-updated",
    };
});

vi.mock("@/lib/defect-parser", () => ({
    parseDefectsFromResponse: () => [],
}));

vi.mock("@/components/DesignSpecPreview", () => ({
    default: () => <div data-testid="design-spec-preview" />,
}));
vi.mock("@/components/DesignSpecLink", () => ({
    DesignSpecLink: ({ spec }: { spec: string }) => <span>{spec}</span>,
}));

const mockGetSubmission = vi.fn();
const mockListAnomalies = vi.fn();
const mockGetImageUrl = vi.fn();

vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return {
        ...actual,
        getSubmission: (...args: unknown[]) => mockGetSubmission(...args),
        listAnomalies: (...args: unknown[]) => mockListAnomalies(...args),
        getImageUrl: (...args: unknown[]) => mockGetImageUrl(...args),
    };
});

import type { ApiSubmission, ApiAnomaly } from "@/lib/api";
import InspectResultPage from "@/app/inspect/result/[id]/page";

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

function makeAnomaly(overrides: Partial<ApiAnomaly> = {}): ApiAnomaly {
    return {
        id: "anom-1",
        submission_id: "sub-1",
        label: "Loose Bolt",
        description: "A loose bolt was detected near the engine mount.",
        severity: "fod",
        confidence: 0.9,
        created_at: "2026-03-01T10:01:00Z",
        ...overrides,
    };
}

describe("InspectResultPage — Req 5: view reports feature", () => {
    beforeEach(() => {
        mockGetSubmission.mockReset();
        mockListAnomalies.mockReset();
        mockGetImageUrl.mockReset();
        mockGetImageUrl.mockResolvedValue("http://example.com/bolt.png");
        mockListAnomalies.mockResolvedValue([]);
    });

    it("renders the Quality Inspection Report heading", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText(/quality inspection report/i)).toBeInTheDocument());
    });

    it("calls getSubmission with correct projectId and submissionId", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(mockGetSubmission).toHaveBeenCalledWith("proj-1", "sub-1"));
    });

    it("shows Total Submissions count", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("Total Submissions")).toBeInTheDocument());
    });

    it("shows FOD Detected count", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("FOD Detected")).toBeInTheDocument());
    });

    it("shows 'Analysis in progress' when submission is still running", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "running" }));
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText(/analysis in progress/i)).toBeInTheDocument());
    });
});

describe("InspectResultPage — Req 6: shows past FOD classifications", () => {
    beforeEach(() => {
        mockGetImageUrl.mockResolvedValue("http://example.com/bolt.png");
    });

    it("shows PASS status badge for a passing submission", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "complete", pass_fail: "pass" }));
        mockListAnomalies.mockResolvedValue([]);
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("PASS")).toBeInTheDocument());
    });

    it("shows FAIL status badge for a failed submission", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "failed", pass_fail: "fail" }));
        mockListAnomalies.mockResolvedValue([]);
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("FAIL")).toBeInTheDocument());
    });

    it("shows ERROR status and message for an errored submission", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "error", pass_fail: "unknown" }));
        mockListAnomalies.mockResolvedValue([]);
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("ERROR")).toBeInTheDocument());
        expect(screen.getByText(/result: error/i)).toBeInTheDocument();
    });

    it("shows TIMEOUT status and message for a timed-out submission", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "timeout", pass_fail: "unknown" }));
        mockListAnomalies.mockResolvedValue([]);
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("TIMEOUT")).toBeInTheDocument());
        expect(screen.getByText(/result: timeout/i)).toBeInTheDocument();
    });

    it("shows defect description from anomalies", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "failed", pass_fail: "fail", anomaly_count: 1 }));
        mockListAnomalies.mockResolvedValue([
            makeAnomaly({ label: "Loose Bolt", description: "A loose bolt was detected." }),
        ]);
        render(<InspectResultPage />);
        // description appears in both the defect card and the Full Analysis section — use getAllByText
        await waitFor(() => expect(screen.getAllByText(/a loose bolt was detected/i).length).toBeGreaterThan(0));
    });

    it("shows multiple defect descriptions when multiple anomalies are returned", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission({ status: "failed", pass_fail: "fail", anomaly_count: 2 }));
        mockListAnomalies.mockResolvedValue([
            makeAnomaly({ id: "a1", label: "Bolt", description: "Bolt found near engine." }),
            makeAnomaly({ id: "a2", label: "Wire", description: "Wire found in cabin." }),
        ]);
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getAllByText(/bolt found near engine/i).length).toBeGreaterThan(0));
        expect(screen.getAllByText(/wire found in cabin/i).length).toBeGreaterThan(0);
    });
});

describe("InspectResultPage — Req 7: reports grouped by project", () => {
    beforeEach(() => {
        mockGetImageUrl.mockResolvedValue("http://example.com/bolt.png");
        mockListAnomalies.mockResolvedValue([]);
    });

    it("shows the project name in the report metadata", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("Runway Inspection")).toBeInTheDocument());
    });

    it("shows the 'Project' metadata label", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("Project")).toBeInTheDocument());
    });

    it("shows design spec filenames from the current project", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() => expect(screen.getByText("runway-spec.pdf")).toBeInTheDocument());
    });

    it("shows Design Specifications section header with count", async () => {
        mockGetSubmission.mockResolvedValue(makeSubmission());
        render(<InspectResultPage />);
        await waitFor(() =>
            expect(screen.getByText(/design specifications \(1\)/i)).toBeInTheDocument(),
        );
    });
});
