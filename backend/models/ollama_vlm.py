"""
Ollama-based VLM for FOD Detection
Uses Gemma 4 E4B by default (ollama pull gemma4:e4b).
"""

import base64
import io
import re
import time
from typing import Optional
import requests
from PIL import Image

from schemas.detection import DetectionResponse, DefectSchema
from core.config import settings

# Supported VLM models (Ollama model tags).
SUPPORTED_MODELS: list[str] = ["qwen2.5vl:7b", "gemma4:e4b"]

# Default model — reads OLLAMA_VLM_MODEL from .env via pydantic-settings.
DEFAULT_MODEL = settings.OLLAMA_VLM_MODEL

def _parse_pass_fail(response: str) -> str:
    """Extract pass/fail from response. Expects 'RESULT: PASS' or 'RESULT: FAIL'."""
    lower = response.lower().strip()
    if "result: pass" in lower or "result:pass" in lower:
        return "pass"
    if "result: fail" in lower or "result:fail" in lower:
        return "fail"
    # Out-of-scope / wrong context → fail
    if any(p in lower for p in ("out of scope", "does not show", "not show a runway", "not an inspection area", "unrelated to", "wrong context")):
        return "fail"
    # Fallback: infer from content
    if any(p in lower for p in ("no fod", "no foreign object", "no debris", "clear", "no visible defect")):
        return "pass"
    if any(p in lower for p in ("fod", "foreign object", "debris", "defect", "anomaly")):
        return "fail"
    return "fail"


def _severity_from_line(line: str) -> Optional[str]:
    """Return 'fod' if line is the FOD DETECTED section header."""
    lower = line.lower()
    if "fod detected" in lower and ":" in lower:
        return "fod"
    return None


_METADATA_LABEL_RE = re.compile(
    r"^(object\s+classification|approximate\s+location|location|severity(\s+rating)?|"
    r"confidence(\s+score)?|recommended\s+action)\s*[:\s]",
    re.I,
)


def _is_metadata_content(text: str) -> bool:
    """Return True if text starts with a known metadata label (e.g. 'Confidence Score:').
    Strips leading articles/demonstratives so sentences like 'The confidence score for...'
    are also caught."""
    cleaned = re.sub(r"^(the|a|an|this)\s+", "", text.strip(), flags=re.I)
    return bool(_METADATA_LABEL_RE.match(cleaned))


def _clean_description(desc: str) -> str:
    """Strip a leading metadata label prefix from a defect description."""
    return _METADATA_LABEL_RE.sub("", desc).strip()


def _parse_one_bullet(rest: str, current_severity: str, defect_index: int) -> Optional[dict]:
    """Parse a bullet line into one defect entry dict, or None if metadata/too short."""
    if _is_metadata_content(rest):
        return None
    desc = _clean_description(rest)
    if len(desc) < 5:
        return None
    return {
        "id": f"DEF-{str(defect_index + 1).zfill(3)}",
        "severity": "fod",  # All FOD is a failure — no severity tiers
        "description": desc,
    }


def _fallback_defect(response: str) -> Optional[DefectSchema]:
    """If response mentions FOD/defect but no structured defects, return a single fallback defect."""
    if not re.search(r"\b(fod|foreign object|debris|defect|anomal)\b", response, re.I):
        return None
    snippet = response[:200].replace("\n", " ").strip()
    return DefectSchema(
        id="DEF-001",
        severity="fod",
        description=snippet or "Anomaly detected (see full analysis below)",
    )


def _is_continuation_line(stripped: str) -> bool:
    # Strip leading bullet chars so both "- Location: x" and "• Location: x" are caught
    inner = re.sub(r"^[•\-*\s]+", "", stripped)
    return _is_metadata_content(inner)


def _append_continuation(entries: list[dict], line: str) -> None:
    extra = re.sub(r"^[\s\S]*?:\s*", "", line, flags=re.I).strip()
    if extra:
        entries[-1]["description"] += f" — {extra}"


def _parse_defects_from_response(response: str) -> list[DefectSchema]:
    """Parse VLM response into defects."""
    entries: list[dict] = []
    current_severity: Optional[str] = None
    defect_index = 0

    for line in response.splitlines():
        if severity := _severity_from_line(line):
            current_severity = severity

        stripped = line.lower().strip()
        if entries and _is_continuation_line(stripped):
            continue

        bullet_match = re.match(r"^[\s]*[•\-*]\s*(.+)", line)
        if bullet_match and current_severity:
            entry = _parse_one_bullet(bullet_match[1].strip(), current_severity, defect_index)
            if entry:
                entries.append(entry)
                defect_index += 1

    defects = [
        DefectSchema(id=e["id"], severity=e["severity"], description=e["description"])
        for e in entries
    ]
    fallback = _fallback_defect(response)
    if not defects and fallback:
        defects.append(fallback)
    return defects



def get_mock_detection_response() -> DetectionResponse:
    """Return a mock detection result when Ollama is unavailable (e.g. not running or timeout)."""
    mock_text = """INSPECTION SUMMARY (Demo - AI service unavailable)

Ollama was not reachable. For real detection run `ollama serve` and `ollama pull gemma4:e4b`.

Specification: Design specs
Images Analyzed: 1
Defects Detected: 2 anomalies found
Status: FAIL - FOD present

FOD DETECTED:
• Foreign object at (25%, 30%) — unidentified metallic fragment poses an ingestion and impact risk to adjacent machinery
• Debris at (50%, 50%) — loose particulate material that could migrate into sensitive components and cause mechanical damage

RESULT: FAIL"""
    defects = _parse_defects_from_response(mock_text)
    model = OllamaVLM(model_name="mock")
    mock_prompt = model._default_generic_prompt()
    return DetectionResponse(
        response=mock_text,
        model="mock (Ollama/Qwen2.5-VL unavailable)",
        inference_time_ms=0,
        pass_fail="fail",
        defects=defects,
        prompt_used=mock_prompt,
    )


class OllamaVLM:
    def __init__(
        self,
        model_name: Optional[str] = None,
        ollama_host: str = "http://localhost:11434"
    ):
        self.model_name = model_name if model_name is not None else DEFAULT_MODEL
        self.ollama_host = ollama_host
        self.is_loaded = False

    def load_model(self) -> bool:
        try:
            response = requests.get(f"{self.ollama_host}/api/tags", timeout=10)
            if response.status_code == 200:
                self.is_loaded = True
                return True
            return False
        except requests.exceptions.ConnectionError:
            return False

    def detect_fod(self, image: Image.Image, prompt: Optional[str] = None, spec_text: Optional[str] = None) -> DetectionResponse:
        """
        Analyze an image for quality / defect detection using the configured VLM.

        Args:
            image: PIL Image to analyze (converted to base64 PNG).
            prompt: Custom full prompt for the VLM. If None, a generic prompt is built from spec_text or default.
            spec_text: Optional specification text (e.g. from design PDFs). When provided, the model is asked
                       to inspect the image according to this specification. Ignored if prompt is set.

        Returns:
            DetectionResponse containing the model's response, model name, and inference time.
        """
        if not self.is_loaded:
            self.load_model()

        if prompt is None:
            if spec_text and spec_text.strip():
                prompt = self._build_spec_prompt(spec_text.strip())
            else:
                prompt = self._default_generic_prompt()

        image_base64 = self._image_to_base64(image)

        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "images": [image_base64],
            "stream": False
        }

        start_time = time.time()

        response = requests.post(
            f"{self.ollama_host}/api/generate",
            json=payload,
            timeout=300
        )

        inference_time = (time.time() - start_time) * 1000

        if response.status_code == 200:
            raw_response = response.json().get("response", "")
            print(raw_response)
            pass_fail = _parse_pass_fail(raw_response)
            defects = _parse_defects_from_response(raw_response)
            if pass_fail == "fail" and not defects:
                defects = [
                    DefectSchema(
                        id="DEF-001",
                        severity="fod",
                        description="Inspection failed. See full analysis above for details.",
                    )
                ]

            return DetectionResponse(
                response=raw_response,
                model=self.model_name,
                inference_time_ms=inference_time,
                pass_fail=pass_fail,
                defects=defects if defects else None,
                prompt_used=prompt,
            )
        else:
            error = f"Error: {response.status_code}"
            return DetectionResponse(
                response=error,
                model=self.model_name,
                inference_time_ms=inference_time,
                pass_fail="fail",
                defects=[
                    DefectSchema(
                        id="DEF-001",
                        severity="fod",
                        description=error + ". Detection request failed.",
                    )
                ],
                prompt_used=prompt,
            )

    @staticmethod
    def _format_rules() -> str:
        return (
            "STRICT OUTPUT FORMAT — when any FOD is found, use exactly this section:\n\n"
            "FOD DETECTED:\n"
            "• <object name> at (X%, Y%) — <why it is FOD>\n\n"
            "Rules:\n"
            "- Use ONLY bullet points (•) under the 'FOD DETECTED:' header. Do NOT use numbered lists or prose.\n"
            "- Each bullet must name the specific object (e.g. 'bolt', 'screw', 'cutter', 'metal fragment'), "
            "its approximate position as (X%, Y%) where 0%,0% is top-left and 100%,100% is bottom-right, "
            "and a brief explanation of why it is FOD "
            "(e.g. 'loose metallic fastener poses ingestion risk', 'debris that could damage moving parts').\n"
            "- Any FOD present is an automatic failure — do NOT rate severity.\n"
            "- End your response with exactly one line: RESULT: PASS or RESULT: FAIL\n"
        )

    def _default_generic_prompt(self) -> str:
        """Generic inspection prompt when no spec is provided (versatile, not domain-specific)."""
        return (
            "You are a quality inspector. Analyze this image and determine whether it passes or fails inspection.\n\n"
            "1) Briefly describe what you see.\n\n"
            "2) Check for any defects, foreign objects, or anomalies:\n"
            "   - If you find NO issues: briefly explain why it passes. End with: RESULT: PASS\n"
            "   - If you find issues: use the strict format below to list each one, then end with: RESULT: FAIL\n\n"
            + self._format_rules()
        )

    def _build_spec_prompt(self, spec_text: str) -> str:
        """Build a generic prompt that injects the provided specification (e.g. from PDF)."""
        return (
            "You are a quality inspector. Inspect this image according to the following specification.\n\n"
            "--- Specification ---\n"
            f"{spec_text}\n"
            "--- End specification ---\n\n"
            "1) Briefly describe what you see and confirm it is relevant to the specification.\n"
            "   If the image is clearly out of scope, briefly explain and end with: RESULT: FAIL\n\n"
            "2) Evaluate the image against the specification:\n"
            "   - If it meets all criteria: briefly explain why it passes. End with: RESULT: PASS\n"
            "   - If defects or non-conformities are found: use the strict format below to list each one, "
            "then end with: RESULT: FAIL\n\n"
            + self._format_rules()
        )

    def _image_to_base64(self, image: Image.Image) -> str:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def get_prompt_for_spec(self, spec_text: str | None) -> str:
        """Return the full prompt (generic + spec) that would be sent to the VLM for the given spec text."""
        if spec_text and spec_text.strip():
            return self._build_spec_prompt(spec_text.strip())
        return self._default_generic_prompt()


# Singleton ensures that there's only one instance of OllmaVLM. Used by get_model()
_instances: dict[str, OllamaVLM] = {}

def get_model(model_name: Optional[str] = None) -> OllamaVLM:
    name = model_name if model_name is not None else DEFAULT_MODEL
    if name not in _instances:
        _instances[name] = OllamaVLM(model_name=name)
    return _instances[name]
