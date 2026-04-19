/**
 * API configuration for backend requests.
 * Set NEXT_PUBLIC_API_URL in .env.local to override (e.g. for production).
 */
export const API_BASE_URL =
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) || "http://localhost:8000";

/**
 * Extract error message from API error body (detail or message) or use fallback.
 */
function getErrorDetail(data: unknown, fallback: string): string {
    const o = data as { detail?: string; message?: string };
    return o?.detail ?? o?.message ?? fallback;
}

/**
 * Parse JSON response and throw a consistent Error with detail when !res.ok.
 */
async function parseJsonResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(getErrorDetail(data, fallbackMessage));
    }
    return data as T;
}

/* ---------- Auth ---------- */
export type LoginRequest = { email: string; password: string };
export type LoginResponse = {
    success: boolean;
    user?: { id: string; email: string };
    message?: string;
};

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
    });
    return parseJsonResponse<LoginResponse>(res, `Login failed: ${res.status}`);
}

/* ---------- Projects ---------- */
export type ApiProject = {
    id: string;
    name: string;
    description?: string;
    created_at: string;
    updated_at: string;
};

export async function listProjects(): Promise<ApiProject[]> {
    const res = await fetch(`${API_BASE_URL}/projects`);
    const data = await parseJsonResponse<unknown>(res, `Failed to list projects: ${res.status}`);
    return Array.isArray(data) ? data : [];
}

export async function createProject(payload: {
    name: string;
    description?: string;
}): Promise<ApiProject> {
    const res = await fetch(`${API_BASE_URL}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return parseJsonResponse<ApiProject>(res, `Failed to create project: ${res.status}`);
}

export async function deleteProject(projectId: string): Promise<void> {
    const res = await fetch(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
    });
    await parseJsonResponse<unknown>(res, `Failed to delete project: ${res.status}`);
}

/* ---------- Storage ---------- */
export async function listDesignSpecs(projectId: string): Promise<string[]> {
    const res = await fetch(
        `${API_BASE_URL}/storage/designs?project_id=${encodeURIComponent(projectId)}`,
    );
    const data = await parseJsonResponse<unknown>(res, `Failed to list design specs: ${res.status}`);
    return Array.isArray(data) ? data : [];
}

export async function uploadDesignSpec(
    projectId: string,
    file: File,
): Promise<{ filename: string; project_id: string; object_key: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(
        `${API_BASE_URL}/storage/design?project_id=${encodeURIComponent(projectId)}`,
        { method: "POST", body: formData },
    );
    return parseJsonResponse(res, `Failed to upload design spec: ${res.status}`);
}

export async function uploadImage(
    projectId: string,
    userId: string,
    file: File,
): Promise<{ filename: string; project_id: string; object_key: string; submission_id: string }> {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(
        `${API_BASE_URL}/storage/image?project_id=${encodeURIComponent(projectId)}&user_id=${encodeURIComponent(userId)}`,
        { method: "POST", body: formData },
    );
    return parseJsonResponse(res, `Failed to upload image: ${res.status}`);
}

export async function getDesignSpecUrl(projectId: string, filename: string): Promise<string> {
    const objectKey = `${projectId}/designs/${filename}`;
    const res = await fetch(
        `${API_BASE_URL}/storage/design/${encodeURIComponent(objectKey)}?expires=900&download=false`,
    );
    const data = await parseJsonResponse<{ url: string }>(res, `Failed to get design spec URL: ${res.status}`);
    return data.url;
}

/* ---------- Submissions ---------- */
export type ApiSubmission = {
    id: string;
    project_id: string;
    submitted_by_user_id: string;
    submitted_at: string;
    image_id: string;
    status: string;
    pass_fail: "pass" | "fail" | "unknown";
    anomaly_count: number | null;
    error_message: string | null;
    annotated_image: string | null;
};

export type ApiAnomaly = {
    id: string;
    submission_id: string;
    label: string;
    description: string | null;
    severity: "fod" | null;
    confidence: number | null;
    created_at: string;
};

export async function listSubmissions(projectId: string): Promise<ApiSubmission[]> {
    const res = await fetch(
        `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/submissions`,
    );
    const data = await parseJsonResponse<unknown>(res, `Failed to list submissions: ${res.status}`);
    return Array.isArray(data) ? data : [];
}

export async function listAnomalies(submissionId: string): Promise<ApiAnomaly[]> {
    const res = await fetch(
        `${API_BASE_URL}/anomalies?submission_id=${encodeURIComponent(submissionId)}`,
    );
    const data = await parseJsonResponse<unknown>(res, `Failed to list anomalies: ${res.status}`);
    return Array.isArray(data) ? data : [];
}

export async function getSubmission(
    projectId: string,
    submissionId: string,
): Promise<ApiSubmission | null> {
    const res = await fetch(
        `${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/submissions/${encodeURIComponent(submissionId)}`,
    );
    if (res.status === 404) return null;
    return parseJsonResponse<ApiSubmission>(res, `Failed to get submission: ${res.status}`);
}

export async function getImageUrl(objectKey: string): Promise<string> {
    const encodedKey = objectKey.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(
        `${API_BASE_URL}/storage/image/${encodedKey}?expires=900&download=false`,
    );
    const data = await parseJsonResponse<{ url: string }>(res, `Failed to get image URL: ${res.status}`);
    return data.url;
}

/* ---------- Detection (sync, for immediate results) ---------- */
export type DetectionResponse = {
    response: string;
    model?: string;
    inference_time_ms?: number;
    pass_fail?: "pass" | "fail";
    /** Full prompt (generic + spec) sent to the VLM, when returned by backend */
    prompt_used?: string | null;
    defects?: Array<{
        id: string;
        severity: string;
        description: string;
    }>;
    /** Base64 PNG with bounding boxes drawn by Qwen2.5-VL grounding (when boxes were detected) */
    annotated_image?: string | null;
};

export async function detectFod(file: File, projectId?: string | null): Promise<DetectionResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (projectId) {
        formData.append("project_id", projectId);
    }

    const res = await fetch(`${API_BASE_URL}/detect`, {
        method: "POST",
        body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(getErrorDetail(data, `Detection failed: ${res.status}`));
    }
    return data as DetectionResponse;
}

/** Fetch the full inspection prompt (generic + project PDF spec) that would be used for analysis. */
export async function getInspectionPrompt(projectId?: string | null): Promise<{ prompt: string }> {
    const url = projectId
        ? `${API_BASE_URL}/detect/prompt?project_id=${encodeURIComponent(projectId)}`
        : `${API_BASE_URL}/detect/prompt`;
    const res = await fetch(url);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(getErrorDetail(data, `Failed to load prompt: ${res.status}`));
    }
    return data as { prompt: string };
}
