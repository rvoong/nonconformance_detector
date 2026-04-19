"""
OWLv2 zero-shot object detection for bounding box annotation.

Requires: pip install transformers torch
Model: google/owlv2-base-patch16-ensemble (~600 MB, downloaded on first use)
"""

import base64
import io
import logging
import re
import threading
from typing import Optional

from PIL import Image, ImageDraw

logger = logging.getLogger(__name__)

# Set by default so callers proceed immediately when no pre-load was scheduled.
# preload_owlv2() clears it before loading and sets it again when done.
_load_ready = threading.Event()
_load_ready.set()

_SEVERITY_COLORS: dict[str, tuple[int, int, int]] = {
    "fod": (220, 38, 38),   # red — all FOD is a failure
}
_DEFAULT_COLOR: tuple[int, int, int] = (59, 130, 246)  # blue


class OWLv2Detector:
    """Lazy-loaded OWLv2 zero-shot object detector."""

    def __init__(self, model_id: str = "google/owlv2-base-patch16-ensemble"):
        self.model_id = model_id
        self._processor = None
        self._model = None
        self._device = None

    def _load(self) -> None:
        if self._model is not None:
            return
        try:
            import torch  # noqa: F401
            from transformers import Owlv2ForObjectDetection, Owlv2ImageProcessor, Owlv2Processor  # noqa: F401
        except ImportError as e:
            raise RuntimeError(
                "OWLv2 requires 'transformers' and 'torch'. "
                "Install with: pip install transformers torch"
            ) from e

        import torch
        from transformers import Owlv2ForObjectDetection, Owlv2ImageProcessor, Owlv2Processor

        if torch.cuda.is_available():
            self._device = torch.device("cuda")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            self._device = torch.device("mps")
        else:
            self._device = torch.device("cpu")
        logger.info("Loading OWLv2 model: %s on %s (first-run download may take a moment)", self.model_id, self._device)
        # Load image processor directly to bypass AutoImageProcessor auto-detection,
        # which fails on newer transformers when preprocessor_config.json lacks image_processor_type.
        image_processor = Owlv2ImageProcessor.from_pretrained(self.model_id)
        self._processor = Owlv2Processor.from_pretrained(self.model_id, image_processor=image_processor)
        self._model = Owlv2ForObjectDetection.from_pretrained(self.model_id)
        self._model.to(self._device)
        self._model.eval()
        logger.info("OWLv2 model loaded on %s.", self._device)

    def annotate(
        self,
        image: Image.Image,
        queries: list[str],
        severity_map: dict[int, str] | None = None,
        threshold: float = 0.1,
    ) -> Image.Image:
        """
        Run OWLv2 on the image with text queries and draw bounding boxes.

        For each query, only the highest-confidence detection above threshold
        is kept to avoid cluttering the image with false positives.

        Args:
            image: PIL Image to annotate.
            queries: Text queries from defect descriptions.
            severity_map: Maps query index -> severity string for color coding.
            threshold: Minimum confidence to draw a box.

        Returns:
            Annotated PIL Image. Returns original image unchanged if no detections.
        """
        import torch

        self._load()
        if not queries:
            return image

        severity_map = severity_map or {}

        inputs = self._processor(text=[queries], images=image, return_tensors="pt", truncation=True)
        inputs = {k: v.to(self._device) for k, v in inputs.items()}
        with torch.no_grad():
            outputs = self._model(**inputs)

        target_sizes = torch.tensor([image.size[::-1]], device=self._device)  # (H, W)
        results = self._processor.image_processor.post_process_object_detection(
            outputs=outputs,
            threshold=threshold,
            target_sizes=target_sizes,
        )[0]

        boxes = results["boxes"].tolist()
        scores = results["scores"].tolist()
        labels = results["labels"].tolist()

        if not boxes:
            return image

        # Keep only the top-scoring box per query to reduce noise
        best: dict[int, tuple[float, list]] = {}
        for box, score, label_idx in zip(boxes, scores, labels):
            if label_idx not in best or score > best[label_idx][0]:
                best[label_idx] = (score, box)

        annotated = image.copy().convert("RGB")
        draw = ImageDraw.Draw(annotated)

        for label_idx, (score, box) in best.items():
            x1, y1, x2, y2 = box
            sev = severity_map.get(label_idx, "")
            color = _SEVERITY_COLORS.get(sev, _DEFAULT_COLOR)

            draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

        return annotated


def image_to_base64(image: Image.Image) -> str:
    """Encode a PIL image as a base64 PNG string."""
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _defect_to_query(description: str) -> str:
    """Shorten a verbose defect description into a concise OWLv2 search query."""
    # Strip position hints: parenthesised "(25%, 30%)" and bare "19% 24.8%"
    # Bounded [^)]{0,100} prevents polynomial backtracking in partial-match (re.sub).
    # Leading \s* removed — .strip() cleans any leftover space — to avoid O(n²)
    # retry of \s* at every position when no '(' follows (ReDoS mitigation).
    description = re.sub(r"\([^)]{0,100}\)", "", description).strip()
    # Strip bare percentage coordinates (e.g. "19% 24.8%").
    # Two-pass: remove each NN[.NN]% token, then normalise whitespace.
    # Avoids \s* before a failing pattern (O(n²) in partial-match) and avoids
    # (?:\s+...)*  outer repetition matching the same chars as leading \s*.
    description = re.sub(r"\b\d+(?:\.\d+)?%", "", description)
    description = " ".join(description.split()).strip()
    # Strip known metadata label prefixes before any further processing
    description = re.sub(
        r"^(object\s+classification|approximate\s+location|location|severity(\s+rating)?|"
        r"confidence(\s+score)?|recommended\s+action|severity\s+rating)[:\s]*",
        "",
        description,
        flags=re.I,
    ).strip()
    # Strip any leading bare number left over (e.g. "1.0" from "Confidence score: 1.0")
    description = re.sub(r"^\d+\.?\d*\s*", "", description).strip()
    # If a colon is present (e.g. "Surface Integrity: Foreign object detected"),
    # prefer the more descriptive part after it
    colon = description.find(":")
    if 0 < colon < 60:
        after = description[colon + 1:].strip()
        # Strip leading numeric values left over from labels like "Confidence score: 0.9 bolt"
        after = re.sub(r"^\d+\.?\d*\s*", "", after).strip()
        if len(after) >= 4:
            description = after
    # Strip leading article so the object noun is exposed for clause-splitting below
    # (e.g. "The bolt is classified…" → "bolt is classified…")
    description = re.sub(r"^(the|a|an)\s+", "", description, flags=re.I).strip()
    # Take only the first clause of what remains.
    # Verb phrases are added so sentences like "bolt is classified as CRITICAL FAILURE"
    # are cut to just "bolt" — a concrete visual noun OWLv2 can match against.
    for sep in (" — ", " - ", " is ", " are ", " was ", " were ", " has ", ",", ".", "("):
        idx = description.find(sep)
        if 3 < idx < 60:
            description = description[:idx]
            break
    result = description[:50].strip()
    # Reject queries that are clearly metadata values, not visual descriptions:
    # single severity words, bare numbers, single characters, or empty strings
    _METADATA_WORDS = {"high", "med", "medium", "low", "critical", "major", "minor",
                       "pass", "fail", "true", "false", "n/a", "none", "null"}
    if result.lower() in _METADATA_WORDS or re.fullmatch(r"[\d\s.,%]+", result) or len(result) < 4:
        return ""
    # Must contain at least one alphabetic word of 3+ characters to be a valid visual query
    if not re.search(r"[a-zA-Z]{3,}", result):
        return ""
    return result


def build_queries_and_severity_map(
    defects: list,
) -> tuple[list[str], dict[int, str]]:
    """
    Convert DefectSchema objects into OWLv2 text queries + severity color map.

    Returns:
        (queries, severity_map) where severity_map[i] is the severity for query i.
    """
    queries: list[str] = []
    severity_map: dict[int, str] = {}
    seen: set[str] = set()

    for defect in defects:
        q = _defect_to_query(defect.description)
        if not q or q in seen:
            continue
        seen.add(q)
        severity_map[len(queries)] = defect.severity
        queries.append(q)

    return queries, severity_map


_detector: Optional[OWLv2Detector] = None


def get_owlv2_detector() -> OWLv2Detector:
    global _detector
    if _detector is None:
        _detector = OWLv2Detector()
    return _detector


def preload_owlv2() -> None:
    """Load OWLv2 at startup in a background thread.

    Clears _load_ready so that detection workers block until the model is
    ready (or until loading fails), then sets it so they can proceed.
    """
    _load_ready.clear()
    try:
        get_owlv2_detector()._load()
        logger.info("OWLv2 pre-load complete.")
    except Exception:
        logger.exception("OWLv2 pre-load failed — bounding-box annotation will be skipped.")
    finally:
        _load_ready.set()


def wait_for_owlv2(timeout: float = 300) -> None:
    """Block until OWLv2 has finished loading (or timeout expires).

    If preload_owlv2() was never called the event is already set, so this
    returns immediately without waiting.
    """
    _load_ready.wait(timeout=timeout)
