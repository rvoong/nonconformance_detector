import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInspectionHistory, SUBMISSION_UPLOADED_EVENT, type StatusChangeEvent } from "@/hooks/useInspectionHistory";
import type { ApiSubmission } from "@/lib/api";

vi.mock("@/lib/api", () => ({
    listSubmissions: vi.fn(),
    getImageUrl: vi.fn().mockResolvedValue("http://example.com/img.png"),
}));

import { listSubmissions } from "@/lib/api";
const mockListSubmissions = vi.mocked(listSubmissions);

function makeSubmission(overrides: Partial<ApiSubmission> = {}): ApiSubmission {
    return {
        id: "sub-1",
        project_id: "proj-1",
        submitted_by_user_id: "user-1",
        submitted_at: "2026-01-01T00:00:00Z",
        image_id: "proj-1/images/photo.png",
        status: "running",
        pass_fail: "unknown",
        anomaly_count: null,
        error_message: null,
        ...overrides,
    };
}

/**
 * Flush the first poll: runs all pending timers and awaits their async callbacks.
 * This resolves the initial `refresh()` call triggered by useEffect.
 */
async function flushFirstPoll() {
    await vi.runAllTimersAsync();
}

/**
 * Flush a subsequent poll (triggered by the 3s setTimeout set after first poll).
 */
async function flushNextPoll() {
    await vi.runAllTimersAsync();
}

describe("useInspectionHistory — status transition detection", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockListSubmissions.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("does NOT fire onStatusChange on the initial load for existing submissions", async () => {
        const onStatusChange = vi.fn();
        mockListSubmissions.mockResolvedValue([makeSubmission({ status: "complete" })]);

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();

        expect(mockListSubmissions).toHaveBeenCalledTimes(1);
        expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("fires onStatusChange when status transitions running → complete", async () => {
        const onStatusChange = vi.fn();
        mockListSubmissions
            .mockResolvedValueOnce([makeSubmission({ status: "running" })])
            .mockResolvedValueOnce([makeSubmission({ status: "complete", pass_fail: "pass" })]);

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();  // first poll: status=running, no callback, schedules 3s timer
        await flushNextPoll();   // second poll: status=complete, fires callback

        expect(onStatusChange).toHaveBeenCalledOnce();
        const event: StatusChangeEvent = onStatusChange.mock.calls[0][0];
        expect(event.previousStatus).toBe("running");
        expect(event.currentStatus).toBe("complete");
        expect(event.submission.pass_fail).toBe("pass");
    });

    it("fires onStatusChange when status transitions running → failed", async () => {
        const onStatusChange = vi.fn();
        mockListSubmissions
            .mockResolvedValueOnce([makeSubmission({ status: "running" })])
            .mockResolvedValueOnce([makeSubmission({ status: "failed", pass_fail: "fail" })]);

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();
        await flushNextPoll();

        const event: StatusChangeEvent = onStatusChange.mock.calls[0][0];
        expect(event.previousStatus).toBe("running");
        expect(event.currentStatus).toBe("failed");
    });

    it("fires onStatusChange when status transitions running → error", async () => {
        const onStatusChange = vi.fn();
        mockListSubmissions
            .mockResolvedValueOnce([makeSubmission({ status: "running" })])
            .mockResolvedValueOnce([makeSubmission({ status: "error" })]);

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();
        await flushNextPoll();

        const event: StatusChangeEvent = onStatusChange.mock.calls[0][0];
        expect(event.previousStatus).toBe("running");
        expect(event.currentStatus).toBe("error");
    });

    it("fires onStatusChange when status transitions running → timeout", async () => {
        const onStatusChange = vi.fn();
        mockListSubmissions
            .mockResolvedValueOnce([makeSubmission({ status: "running" })])
            .mockResolvedValueOnce([makeSubmission({ status: "timeout" })]);

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();
        await flushNextPoll();

        const event: StatusChangeEvent = onStatusChange.mock.calls[0][0];
        expect(event.previousStatus).toBe("running");
        expect(event.currentStatus).toBe("timeout");
    });

    it("fires with previousStatus='__new__' for brand-new active submissions after initialization", async () => {
        const onStatusChange = vi.fn();
        const existingSub = makeSubmission({ id: "sub-1", status: "running" });
        const newSub = makeSubmission({ id: "sub-2", status: "queued" });

        mockListSubmissions
            .mockResolvedValueOnce([existingSub])
            .mockResolvedValueOnce([existingSub, newSub]);

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();  // populates prevStatuses with sub-1=running
        await flushNextPoll();   // sub-2 is new → fires with __new__

        const newSubEvent = onStatusChange.mock.calls.find(
            ([e]: [StatusChangeEvent]) => e.submission.id === "sub-2",
        )?.[0] as StatusChangeEvent | undefined;
        expect(newSubEvent).toBeDefined();
        expect(newSubEvent!.previousStatus).toBe("__new__");
        expect(newSubEvent!.currentStatus).toBe("queued");
    });

    it("does NOT fire onStatusChange when status is unchanged between polls", async () => {
        const onStatusChange = vi.fn();
        const running = makeSubmission({ status: "running" });
        mockListSubmissions
            .mockResolvedValueOnce([running])
            .mockResolvedValueOnce([running]); // same status

        renderHook(() => useInspectionHistory("proj-1", onStatusChange));
        await flushFirstPoll();
        await flushNextPoll();

        expect(onStatusChange).not.toHaveBeenCalled();
    });

    it("stops polling when no active submissions remain", async () => {
        mockListSubmissions.mockResolvedValue([makeSubmission({ status: "complete" })]);

        renderHook(() => useInspectionHistory("proj-1"));
        await flushFirstPoll(); // returns complete, no timer scheduled

        // Run timers again — should NOT trigger another poll
        await act(async () => {
            vi.advanceTimersByTime(10_000);
        });
        expect(mockListSubmissions).toHaveBeenCalledTimes(1);
    });

    it("resumes polling when SUBMISSION_UPLOADED_EVENT is dispatched", async () => {
        mockListSubmissions.mockResolvedValue([makeSubmission({ status: "complete" })]);

        renderHook(() => useInspectionHistory("proj-1"));
        await flushFirstPoll(); // first poll
        expect(mockListSubmissions).toHaveBeenCalledTimes(1);

        await act(async () => {
            globalThis.dispatchEvent(new Event(SUBMISSION_UPLOADED_EVENT));
        });
        await vi.runAllTimersAsync();

        expect(mockListSubmissions).toHaveBeenCalledTimes(2);
    });
});
