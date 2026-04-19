"""
Pydantic Schemas for FOD Detection API
"""

from pydantic import BaseModel


class DefectSchema(BaseModel):
    id: str
    severity: str  # "fod" — any detected item is a FOD failure
    description: str


class DetectionResponse(BaseModel):
    response: str
    model: str
    inference_time_ms: float
    pass_fail: str  # "pass" | "fail"
    defects: list[DefectSchema] | None = None  # parsed from response when possible
    prompt_used: str | None = None  # full prompt (generic + spec) sent to the VLM, for display
    annotated_image: str | None = None  # base64 PNG with bounding boxes drawn (when boxes were detected)
