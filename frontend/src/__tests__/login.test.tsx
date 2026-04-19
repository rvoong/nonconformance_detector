/**
 * Tests for requirements:
 * - Req 1: Login area with username/password fields and a login button
 * - Req 11: Notify user of failed login attempts
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
}));

const mockSetUser = vi.fn();
const mockSetCurrentProject = vi.fn();
vi.mock("@/app/AppProvider", () => ({
    useApp: () => ({
        theme: "light",
        setCurrentProject: mockSetCurrentProject,
        setUser: mockSetUser,
        toggleTheme: vi.fn(),
    }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/api")>();
    return { ...actual, login: vi.fn(), API_BASE_URL: "http://localhost:8000" };
});

import { login } from "@/lib/api";
const mockLogin = vi.mocked(login);

import LoginPage from "@/app/login/page";

// --- Tests ---
describe("LoginPage — Req 1: login UI", () => {
    beforeEach(() => {
        mockLogin.mockReset();
        mockPush.mockReset();
        mockSetUser.mockReset();
    });

    it("renders an email input field", () => {
        render(<LoginPage />);
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    });

    it("renders a password input field", () => {
        render(<LoginPage />);
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
    });

    it("renders a Sign In / login button", () => {
        render(<LoginPage />);
        expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    it("does not show an error alert on initial render", () => {
        render(<LoginPage />);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("successful login calls login() and navigates to /projects", async () => {
        mockLogin.mockResolvedValue({ success: true, user: { id: "u1", email: "test@example.com" } });
        render(<LoginPage />);

        await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "test");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: "test@example.com", password: "test" }));
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/projects"));
        expect(mockSetUser).toHaveBeenCalledWith({ id: "u1", email: "test@example.com" });
    });

    it("shows loading state while login is in flight", async () => {
        // Never resolves so we can check intermediate state
        mockLogin.mockReturnValue(new Promise(() => {}));
        render(<LoginPage />);

        await userEvent.type(screen.getByLabelText(/email/i), "x@x.com");
        await userEvent.type(screen.getByLabelText(/password/i), "pass");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled());
    });
});

describe("LoginPage — Req 11: notify user of failed login attempts", () => {
    beforeEach(() => {
        mockLogin.mockReset();
        mockPush.mockReset();
    });

    it("shows an error alert when credentials are rejected by the server", async () => {
        mockLogin.mockResolvedValue({ success: false, message: "Invalid email or password" });
        render(<LoginPage />);

        await userEvent.type(screen.getByLabelText(/email/i), "bad@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "wrongpass");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
        expect(screen.getByRole("alert")).toHaveTextContent(/invalid email or password/i);
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("shows an error alert when the backend is unreachable (network error)", async () => {
        mockLogin.mockRejectedValue(new Error("Failed to fetch"));
        render(<LoginPage />);

        await userEvent.type(screen.getByLabelText(/email/i), "x@x.com");
        await userEvent.type(screen.getByLabelText(/password/i), "pass");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
        expect(screen.getByRole("alert")).toHaveTextContent(/cannot reach the backend/i);
    });

    it("shows an error alert when login throws a generic error", async () => {
        mockLogin.mockRejectedValue(new Error("Something went wrong"));
        render(<LoginPage />);

        await userEvent.type(screen.getByLabelText(/email/i), "x@x.com");
        await userEvent.type(screen.getByLabelText(/password/i), "pass");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
        expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    });

    it("button is re-enabled and error is shown after a failed attempt", async () => {
        mockLogin.mockResolvedValue({ success: false, message: "Invalid credentials" });
        render(<LoginPage />);

        await userEvent.type(screen.getByLabelText(/email/i), "x@x.com");
        await userEvent.type(screen.getByLabelText(/password/i), "bad");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled());
        expect(screen.getByRole("alert")).toBeInTheDocument();
    });
});
