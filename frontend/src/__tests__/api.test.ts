/**
 * Unit tests for src/lib/api.ts
 * Covers each exported function's fetch logic: success, API errors, and edge cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import {
    login,
    listProjects,
    createProject,
    deleteProject,
    listDesignSpecs,
    uploadDesignSpec,
    uploadImage,
    getDesignSpecUrl,
    listSubmissions,
    listAnomalies,
    getSubmission,
    getImageUrl,
    detectFod,
    getInspectionPrompt,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, ok = true, status = 200): void {
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
            ok,
            status,
            json: () => Promise.resolve(body),
        }),
    );
}

function mockFetchNetworkError(): void {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Failed to fetch")));
}

beforeEach(() => {
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("login", () => {
    it("returns the parsed response on success", async () => {
        const payload = { success: true, user: { id: "u1", email: "a@b.com" } };
        mockFetch(payload);
        await expect(login({ email: "a@b.com", password: "pw" })).resolves.toEqual(payload);
    });

    it("throws with detail message on non-ok response", async () => {
        mockFetch({ detail: "Unauthorized" }, false, 401);
        await expect(login({ email: "a@b.com", password: "bad" })).rejects.toThrow("Unauthorized");
    });

    it("throws with message field when detail is absent", async () => {
        mockFetch({ message: "Invalid credentials" }, false, 401);
        await expect(login({ email: "a@b.com", password: "bad" })).rejects.toThrow(
            "Invalid credentials",
        );
    });

    it("throws fallback message when body has no detail or message", async () => {
        mockFetch({}, false, 500);
        await expect(login({ email: "a@b.com", password: "pw" })).rejects.toThrow(/Login failed/);
    });
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

describe("listProjects", () => {
    it("returns an array of projects", async () => {
        const projects = [{ id: "p1", name: "Test" }];
        mockFetch(projects);
        await expect(listProjects()).resolves.toEqual(projects);
    });

    it("returns empty array when response is not an array", async () => {
        mockFetch({ unexpected: true });
        await expect(listProjects()).resolves.toEqual([]);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Forbidden" }, false, 403);
        await expect(listProjects()).rejects.toThrow("Forbidden");
    });
});

describe("createProject", () => {
    it("returns the created project", async () => {
        const project = { id: "p1", name: "New", created_at: "2026-01-01", updated_at: "2026-01-01" };
        mockFetch(project);
        await expect(createProject({ name: "New" })).resolves.toEqual(project);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Bad request" }, false, 400);
        await expect(createProject({ name: "" })).rejects.toThrow("Bad request");
    });
});

describe("deleteProject", () => {
    it("resolves without error on 204", async () => {
        mockFetch({}, true, 204);
        await expect(deleteProject("proj-1")).resolves.not.toThrow();
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Not found" }, false, 404);
        await expect(deleteProject("missing")).rejects.toThrow("Not found");
    });
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

describe("listDesignSpecs", () => {
    it("returns array of filenames", async () => {
        mockFetch(["spec-a.pdf", "spec-b.pdf"]);
        await expect(listDesignSpecs("proj-1")).resolves.toEqual(["spec-a.pdf", "spec-b.pdf"]);
    });

    it("returns empty array when response is not an array", async () => {
        mockFetch(null);
        await expect(listDesignSpecs("proj-1")).resolves.toEqual([]);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Server error" }, false, 500);
        await expect(listDesignSpecs("proj-1")).rejects.toThrow("Server error");
    });
});

describe("uploadDesignSpec", () => {
    it("returns upload metadata on success", async () => {
        const result = { filename: "spec.pdf", project_id: "p1", object_key: "k/spec.pdf" };
        mockFetch(result);
        const file = new File(["content"], "spec.pdf", { type: "application/pdf" });
        await expect(uploadDesignSpec("p1", file)).resolves.toEqual(result);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Upload failed" }, false, 500);
        const file = new File(["content"], "spec.pdf");
        await expect(uploadDesignSpec("p1", file)).rejects.toThrow("Upload failed");
    });
});

describe("uploadImage", () => {
    it("returns upload metadata on success", async () => {
        const result = {
            filename: "img.jpg",
            project_id: "p1",
            object_key: "k/img.jpg",
            submission_id: "s1",
        };
        mockFetch(result);
        const file = new File(["img"], "img.jpg", { type: "image/jpeg" });
        await expect(uploadImage("p1", "u1", file)).resolves.toEqual(result);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Image upload failed" }, false, 500);
        const file = new File(["img"], "img.jpg");
        await expect(uploadImage("p1", "u1", file)).rejects.toThrow("Image upload failed");
    });
});

describe("getDesignSpecUrl", () => {
    it("returns the presigned URL", async () => {
        mockFetch({ url: "https://minio.example.com/spec.pdf" });
        await expect(getDesignSpecUrl("p1", "spec.pdf")).resolves.toBe(
            "https://minio.example.com/spec.pdf",
        );
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Not found" }, false, 404);
        await expect(getDesignSpecUrl("p1", "missing.pdf")).rejects.toThrow("Not found");
    });
});

describe("getImageUrl", () => {
    it("returns the presigned URL", async () => {
        mockFetch({ url: "https://minio.example.com/img.jpg" });
        await expect(getImageUrl("p1/images/img.jpg")).resolves.toBe(
            "https://minio.example.com/img.jpg",
        );
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Not found" }, false, 404);
        await expect(getImageUrl("p1/images/missing.jpg")).rejects.toThrow("Not found");
    });
});

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

describe("listSubmissions", () => {
    it("returns array of submissions", async () => {
        const submissions = [{ id: "s1", project_id: "p1" }];
        mockFetch(submissions);
        await expect(listSubmissions("p1")).resolves.toEqual(submissions);
    });

    it("returns empty array when response is not an array", async () => {
        mockFetch({});
        await expect(listSubmissions("p1")).resolves.toEqual([]);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Project not found" }, false, 404);
        await expect(listSubmissions("missing")).rejects.toThrow("Project not found");
    });
});

describe("listAnomalies", () => {
    it("returns array of anomalies", async () => {
        const anomalies = [{ id: "a1", submission_id: "s1", label: "scratch" }];
        mockFetch(anomalies);
        await expect(listAnomalies("s1")).resolves.toEqual(anomalies);
    });

    it("returns empty array when response is not an array", async () => {
        mockFetch(null);
        await expect(listAnomalies("s1")).resolves.toEqual([]);
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Server error" }, false, 500);
        await expect(listAnomalies("s1")).rejects.toThrow("Server error");
    });
});

describe("getSubmission", () => {
    it("returns the submission on success", async () => {
        const submission = { id: "s1", project_id: "p1", status: "complete" };
        mockFetch(submission);
        await expect(getSubmission("p1", "s1")).resolves.toEqual(submission);
    });

    it("returns null on 404", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                json: () => Promise.resolve({}),
            }),
        );
        await expect(getSubmission("p1", "missing")).resolves.toBeNull();
    });

    it("throws on other non-ok responses", async () => {
        mockFetch({ detail: "Server error" }, false, 500);
        await expect(getSubmission("p1", "s1")).rejects.toThrow("Server error");
    });
});

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

describe("detectFod", () => {
    it("returns detection result on success", async () => {
        const result = { response: "No FOD detected", model: "detector-v1", pass_fail: "pass" };
        mockFetch(result);
        const file = new File(["img"], "img.jpg");
        await expect(detectFod(file, "p1")).resolves.toEqual(result);
    });

    it("works without a projectId", async () => {
        const result = { response: "FOD detected", pass_fail: "fail" };
        mockFetch(result);
        const file = new File(["img"], "img.jpg");
        await expect(detectFod(file)).resolves.toEqual(result);
    });

    it("throws with detail on non-ok response", async () => {
        mockFetch({ detail: "Model unavailable" }, false, 503);
        const file = new File(["img"], "img.jpg");
        await expect(detectFod(file)).rejects.toThrow("Model unavailable");
    });

    it("propagates network errors", async () => {
        mockFetchNetworkError();
        const file = new File(["img"], "img.jpg");
        await expect(detectFod(file)).rejects.toThrow("Failed to fetch");
    });
});

describe("getInspectionPrompt", () => {
    it("returns the prompt with a projectId", async () => {
        mockFetch({ prompt: "Inspect for FOD..." });
        await expect(getInspectionPrompt("p1")).resolves.toEqual({ prompt: "Inspect for FOD..." });
    });

    it("returns the prompt without a projectId", async () => {
        mockFetch({ prompt: "Generic prompt" });
        await expect(getInspectionPrompt()).resolves.toEqual({ prompt: "Generic prompt" });
    });

    it("throws on non-ok response", async () => {
        mockFetch({ detail: "Not found" }, false, 404);
        await expect(getInspectionPrompt("p1")).rejects.toThrow("Not found");
    });
});
