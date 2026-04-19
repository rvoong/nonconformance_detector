/**
 * Parses unstructured API response text into structured defects.
 * Used when the API returns free-form text instead of structured JSON.
 */

export type Defect = {
    id: string;
    description: string;
};

const METADATA_LABEL_RE =
    /^(object\s+classification|approximate\s+location|location|severity|confidence|recommended\s+action)\s*[:\s]/i;

function isMetadataContent(text: string): boolean {
    const cleaned = text.trim().replace(/^(the|a|an|this)\s+/i, "");
    return METADATA_LABEL_RE.test(cleaned);
}

function cleanDescription(desc: string): string {
    return desc.replace(METADATA_LABEL_RE, "").trim();
}

function isMetadataLine(line: string): boolean {
    // Strip leading bullet chars so both "- Location:" and "• Location:" are caught
    const inner = line.toLowerCase().replace(/^[•\-*\s]+/, "");
    return isMetadataContent(inner);
}

export function parseDefectsFromResponse(response: string): Defect[] {
    const defects: Defect[] = [];
    const lines = response.split(/\r?\n/);
    let inFodSection = false;
    let defectIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();

        // Detect the FOD DETECTED section header
        if (lower.includes("fod detected") && lower.includes(":")) {
            inFodSection = true;
            continue;
        }

        // Skip metadata lines entirely
        if (defects.length > 0 && isMetadataLine(line)) {
            continue;
        }

        // Extract bullet points as defect descriptions
        const bulletMatch = line.match(/^[\s]*[•\-*]\s*(.+)/);
        if (bulletMatch && inFodSection) {
            const content = bulletMatch[1].trim();
            if (isMetadataContent(content)) continue;
            const desc = cleanDescription(content);
            if (desc.length > 5) {
                defects.push({
                    id: `DEF-${String(defectIndex + 1).padStart(3, "0")}`,
                    description: desc,
                });
                defectIndex++;
            }
        }
    }

    // Fallback: if we found nothing structured, create one defect from key phrases
    if (defects.length === 0) {
        const hasFod = /\b(fod|foreign object|debris|defect|anomal)\b/i.test(response);
        if (hasFod) {
            const snippet = response.slice(0, 200).replace(/\s+/g, " ").trim();
            defects.push({
                id: "DEF-001",
                description: snippet || "Anomaly detected (see full analysis below)",
            });
        }
    }

    return defects;
}
