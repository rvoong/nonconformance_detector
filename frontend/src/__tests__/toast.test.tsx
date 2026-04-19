import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastContainer, ToastItem, type Toast } from "@/components/ui/toast";

const baseToast = (overrides: Partial<Toast> = {}): Toast => ({
    id: "test-id",
    title: "Test notification",
    variant: "info",
    ...overrides,
});

describe("ToastItem", () => {
    it("renders the title", () => {
        render(<ToastItem toast={baseToast()} onDismiss={() => {}} />);
        expect(screen.getByText("Test notification")).toBeInTheDocument();
    });

    it("renders description when provided", () => {
        render(<ToastItem toast={baseToast({ description: "Some detail" })} onDismiss={() => {}} />);
        expect(screen.getByText("Some detail")).toBeInTheDocument();
    });

    it("does not render description when omitted", () => {
        render(<ToastItem toast={baseToast()} onDismiss={() => {}} />);
        expect(screen.queryByText("Some detail")).not.toBeInTheDocument();
    });

    it("calls onDismiss with the correct id when X button is clicked", async () => {
        const onDismiss = vi.fn();
        render(<ToastItem toast={baseToast({ id: "abc-123" })} onDismiss={onDismiss} />);
        await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
        expect(onDismiss).toHaveBeenCalledWith("abc-123");
    });

    it("has role=alert for screen readers", () => {
        render(<ToastItem toast={baseToast()} onDismiss={() => {}} />);
        expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it.each([
        ["success" as const],
        ["error" as const],
        ["warning" as const],
        ["info" as const],
    ])("renders without crashing for variant=%s", (variant) => {
        const { container } = render(<ToastItem toast={baseToast({ variant })} onDismiss={() => {}} />);
        expect(container.firstChild).toBeTruthy();
    });
});

describe("ToastContainer", () => {
    it("renders nothing when toasts array is empty", () => {
        const { container } = render(<ToastContainer toasts={[]} onDismiss={() => {}} />);
        expect(container.firstChild).toBeNull();
    });

    it("renders one ToastItem per toast", () => {
        const toasts: Toast[] = [
            baseToast({ id: "1", title: "First" }),
            baseToast({ id: "2", title: "Second" }),
            baseToast({ id: "3", title: "Third" }),
        ];
        render(<ToastContainer toasts={toasts} onDismiss={() => {}} />);
        expect(screen.getAllByRole("alert")).toHaveLength(3);
        expect(screen.getByText("First")).toBeInTheDocument();
        expect(screen.getByText("Second")).toBeInTheDocument();
        expect(screen.getByText("Third")).toBeInTheDocument();
    });

    it("passes onDismiss through to each item", async () => {
        const onDismiss = vi.fn();
        const toasts: Toast[] = [
            baseToast({ id: "x1", title: "A" }),
            baseToast({ id: "x2", title: "B" }),
        ];
        render(<ToastContainer toasts={toasts} onDismiss={onDismiss} />);
        const buttons = screen.getAllByRole("button", { name: /dismiss/i });
        await userEvent.click(buttons[0]);
        expect(onDismiss).toHaveBeenCalledWith("x1");
    });
});
