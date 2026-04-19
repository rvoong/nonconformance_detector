# Known Limitations

This document describes known limitations of the GLaDOS FOD detection system as of the current release.

---

## 1. Bounding Box Accuracy (OWLv2)

OWLv2 (`google/owlv2-base-patch16-ensemble`) is used for zero-shot object localization. Its bounding box accuracy has several constraints:

- **Partial coverage on close-up subjects.** When a defect object fills a large portion of the frame (e.g. a bolt photographed at close range), OWLv2 tends to localize only the most visually distinctive sub-region (e.g. the bolt head) rather than the full object.
- **16-pixel patch grid.** The base model divides images into 16×16 px patches. Small objects or objects near patch boundaries may produce imprecise or shifted boxes.
- **Query quality dependency.** Box accuracy is directly tied to the text query generated from the VLM's defect description. Generic queries like `"bolt"` produce broader, less precise matches than specific ones like `"loose hex bolt on tarmac"`. The current query builder (`_defect_to_query`) attempts to extract a concise visual noun but is limited by how descriptive the VLM's output is.
- **Scene-level vs. macro photography.** OWLv2 was trained predominantly on scene-level detection datasets. Macro or close-up product inspection images fall outside its primary training distribution, reducing detection reliability.
- **No fine-tuning.** The model is used zero-shot with no domain-specific training on runway or aircraft maintenance imagery.

---

## 2. VLM Response Variability (Qwen2.5-VL via Ollama)

The Vision Language Model produces free-form text that is parsed into structured defects. This parsing is inherently fragile:

- **Inconsistent output format.** The VLM does not always follow the expected `CRITICAL FAILURES / MAJOR ISSUES / MINOR OBSERVATIONS` structure, especially on images that are out of scope (non-runway scenes, blurry images, etc.).
- **Metadata bleeding into defect descriptions.** The VLM sometimes outputs metadata (confidence scores, object classifications, severity ratings, recommended actions) as bullet points alongside defect descriptions. Filtering logic exists to strip these, but novel phrasing or sentence-form metadata may still pass through.
- **Hallucination.** Like all LLMs, Qwen2.5-VL can fabricate defects that are not present in the image, particularly on ambiguous or low-quality images.
- **Out-of-scope images always return FAIL.** Images that do not show a runway, apron, or relevant inspection surface return a `fail` result by default rather than a meaningful rejection message.
- **Inference speed.** On CPU-only hardware, Qwen2.5-VL:7b inference takes 30–90 seconds per image. OWLv2 adds an additional 5–15 seconds on first load (model download ~600 MB on first run).

---

## 3. Design Specification Context

Project design spec PDFs are extracted as plain text and prepended to the VLM prompt:

- **No semantic understanding of specs.** The VLM receives raw extracted text; it cannot interpret diagrams, tables, or structured formatting from PDFs.
- **Token limit.** Very long specifications are truncated by the model's context window. Only the first portion of a spec may influence the inspection result.
- **PDF extraction quality.** Scanned or image-based PDFs will produce empty or garbled text, silently contributing no context to the prompt.

---

## 4. Image Input Constraints

- **Maximum upload size:** 10 MB.
- **Supported formats:** PNG and JPEG only (validated by magic bytes).
- **Automatic downscaling:** Images larger than 1024px in either dimension are downscaled before being sent to the VLM and OWLv2. This can reduce the visibility of small defects.
- **No video or multi-frame support.** Each inspection processes a single still image.

---

## 5. Ollama Availability

- Detection requires a locally running Ollama instance (`http://localhost:11434`). If Ollama is unavailable or the model is not loaded, the system returns a **mock detection response** (hardcoded `fail` result) rather than an error, which may be misleading in production use.
- There is no retry logic or queue for failed Ollama requests beyond the mock fallback.

---

## 6. Authentication and Multi-Tenancy

- **No role-based access enforcement on detection.** Any authenticated user with access to a project can submit inspections regardless of their role (owner/editor/viewer).
- **Project isolation is by convention.** MinIO buckets are named after project IDs; there is no cryptographic isolation between projects.

---

## 7. Asynchronous Detection (Background Jobs)

- Background detection via the submission queue (`/submissions`) uses a simple in-process worker. It does not survive server restarts — in-progress submissions become permanently stuck in `running` status if the server is restarted mid-job.
- No dead-letter queue or retry mechanism exists for failed background jobs.
