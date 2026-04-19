import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { ToastProvider, useToast } from "@/context/ToastContext";

function ToastTrigger({ title, description, variant }: { title: string; description?: string; variant?: "success" | "error" | "warning" | "info" }) {
    const { addToast } = useToast();
    return (
        <button onClick={() => addToast(title, { description, variant })}>
            Add Toast
        </button>
    );
}

function renderWithProvider(ui: React.ReactNode) {
    return render(<ToastProvider>{ui}</ToastProvider>);
}

afterEach(() => {
    vi.useRealTimers();
});

describe("ToastProvider / useToast", () => {
    it("addToast renders a toast with the given title", () => {
        vi.useFakeTimers();
        renderWithProvider(<ToastTrigger title="Hello toast" />);
        fireEvent.click(screen.getByRole("button", { name: "Add Toast" }));
        expect(screen.getByText("Hello toast")).toBeInTheDocument();
    });

    it("addToast renders description when provided", () => {
        vi.useFakeTimers();
        renderWithProvider(<ToastTrigger title="Job done" description="image.png" />);
        fireEvent.click(screen.getByRole("button", { name: "Add Toast" }));
        expect(screen.getByText("image.png")).toBeInTheDocument();
    });

    it("multiple addToast calls stack multiple toasts", () => {
        vi.useFakeTimers();
        renderWithProvider(
            <>
                <ToastTrigger title="First" />
                <ToastTrigger title="Second" />
            </>,
        );
        const buttons = screen.getAllByRole("button", { name: "Add Toast" });
        fireEvent.click(buttons[0]);
        fireEvent.click(buttons[1]);
        expect(screen.getByText("First")).toBeInTheDocument();
        expect(screen.getByText("Second")).toBeInTheDocument();
    });

    it("toast auto-dismisses after 5 seconds", () => {
        vi.useFakeTimers();
        renderWithProvider(<ToastTrigger title="Auto gone" />);
        fireEvent.click(screen.getByRole("button", { name: "Add Toast" }));
        expect(screen.getByText("Auto gone")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(5001 + 220); // 5s auto-dismiss + 220ms exit animation
        });
        expect(screen.queryByText("Auto gone")).not.toBeInTheDocument();
    });

    it("toast does not dismiss before 5 seconds", () => {
        vi.useFakeTimers();
        renderWithProvider(<ToastTrigger title="Still here" />);
        fireEvent.click(screen.getByRole("button", { name: "Add Toast" }));
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        expect(screen.getByText("Still here")).toBeInTheDocument();
    });

    it("clicking the dismiss (X) button removes the toast immediately", () => {
        vi.useFakeTimers();
        renderWithProvider(<ToastTrigger title="Manual dismiss" />);
        fireEvent.click(screen.getByRole("button", { name: "Add Toast" }));
        expect(screen.getByText("Manual dismiss")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
        act(() => { vi.advanceTimersByTime(220); }); // wait for exit animation
        expect(screen.queryByText("Manual dismiss")).not.toBeInTheDocument();
    });

    it("useToast throws when used outside ToastProvider", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        function Bad() {
            useToast();
            return null;
        }
        expect(() => render(<Bad />)).toThrow("useToast must be used inside ToastProvider");
        consoleError.mockRestore();
    });
});
