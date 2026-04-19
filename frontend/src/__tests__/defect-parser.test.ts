/**
 * Unit tests for src/lib/defect-parser.ts
 * Exercises parseDefectsFromResponse: structured parsing, metadata filtering, and fallback.
 */
import { describe, it, expect } from "vitest";
import { parseDefectsFromResponse } from "@/lib/defect-parser";

// ---------------------------------------------------------------------------
// Structured FOD DETECTED section
// ---------------------------------------------------------------------------

describe("parseDefectsFromResponse — structured FOD DETECTED section", () => {
    it("parses a single bullet under FOD DETECTED", () => {
        const text = "FOD DETECTED:\n• Loose bolt near engine mount";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
        expect(defects[0].id).toBe("DEF-001");
        expect(defects[0].description).toMatch(/bolt/i);
    });

    it("parses multiple bullets and assigns sequential ids", () => {
        const text = "FOD DETECTED:\n• Metal fragment on taxiway\n• Rubber strip near gate";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(2);
        expect(defects[0].id).toBe("DEF-001");
        expect(defects[1].id).toBe("DEF-002");
    });

    it("accepts dash and asterisk bullet characters", () => {
        const text = "FOD DETECTED:\n- Wire near engine\n* Plastic cap found";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(2);
    });

    it("ignores bullets that appear before the FOD DETECTED header", () => {
        const text = "• Preliminary note\nFOD DETECTED:\n• Actual defect";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
        expect(defects[0].description).toMatch(/actual defect/i);
    });

    it("handles CRLF line endings", () => {
        const text = "FOD DETECTED:\r\n• Debris on runway\r\n• Bolt fragment";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(2);
    });

    it("skips bullets whose description is too short (≤5 chars)", () => {
        const text = "FOD DETECTED:\n• ok\n• Real defect on runway";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
        expect(defects[0].description).toMatch(/real defect/i);
    });
});

// ---------------------------------------------------------------------------
// Metadata filtering
// ---------------------------------------------------------------------------

describe("parseDefectsFromResponse — metadata line filtering", () => {
    it("skips 'Confidence score' bullet after a real defect", () => {
        const text = "FOD DETECTED:\n• Bolt on runway\n• Confidence score: 0.95";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
        expect(defects[0].description).toMatch(/bolt/i);
    });

    it("skips 'Location' metadata bullet", () => {
        const text = "FOD DETECTED:\n• Wire near gate\n• Location: 30%, 50%";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
    });

    it("skips 'Severity' metadata bullet", () => {
        const text = "FOD DETECTED:\n• Metal fragment\n• Severity: HIGH";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
    });

    it("skips 'Recommended action' metadata bullet", () => {
        const text =
            "FOD DETECTED:\n• Plastic debris\n• Recommended action: remove immediately";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
    });

    it("skips 'Object classification' content bullet", () => {
        const text = "FOD DETECTED:\n• Object classification: Bolt";
        const defects = parseDefectsFromResponse(text);
        // Either zero entries or a fallback — none should start with the metadata label
        for (const d of defects) {
            expect(d.description.toLowerCase()).not.toMatch(/^object classification/);
        }
    });

    it("strips metadata prefix from a bullet that starts with a known label", () => {
        const text = "FOD DETECTED:\n• Approximate location: upper-left quadrant anomaly";
        const defects = parseDefectsFromResponse(text);
        for (const d of defects) {
            expect(d.description.toLowerCase()).not.toMatch(/^approximate location/);
        }
    });

    it("handles 'the confidence score…' sentence-form metadata bullet after a defect", () => {
        const text =
            "FOD DETECTED:\n• Bolt is a critical hazard\n• The confidence score for this detection is 1.0";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
        expect(defects[0].description).toMatch(/bolt/i);
    });
});

// ---------------------------------------------------------------------------
// Fallback behaviour
// ---------------------------------------------------------------------------

describe("parseDefectsFromResponse — fallback", () => {
    it("returns a fallback defect when FOD is mentioned but no structured list", () => {
        const text = "FOD detected in the image. No structured list.";
        const defects = parseDefectsFromResponse(text);
        expect(defects).toHaveLength(1);
        expect(defects[0].id).toBe("DEF-001");
    });

    it("fallback description is capped at 200 chars", () => {
        const long = "FOD detected. " + "x".repeat(300);
        const defects = parseDefectsFromResponse(long);
        expect(defects[0].description.length).toBeLessThanOrEqual(200);
    });

    it("returns empty array when no FOD-related keywords are present", () => {
        const text = "Image looks clear. No anomalies.";
        expect(parseDefectsFromResponse(text)).toHaveLength(0);
    });

    it("returns empty array for an empty string", () => {
        expect(parseDefectsFromResponse("")).toHaveLength(0);
    });

    it("triggers fallback on 'foreign object' keyword", () => {
        expect(parseDefectsFromResponse("Foreign object found on runway.")).toHaveLength(1);
    });

    it("triggers fallback on 'debris' keyword", () => {
        expect(parseDefectsFromResponse("Debris visible in frame.")).toHaveLength(1);
    });
});
