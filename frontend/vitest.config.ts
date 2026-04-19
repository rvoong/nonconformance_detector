import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "jsdom",
        setupFiles: ["./vitest.setup.ts"],
        globals: true,
        coverage: {
            provider: "v8",
            reporter: ["lcov", "text"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.{ts,tsx}"],
            exclude: ["src/**/*.test.{ts,tsx}", "src/__tests__/**"],
        },
    },
    resolve: {
        alias: { "@": path.resolve(__dirname, "./src") },
    },
});
