from enum import Enum


class ProjectRole(str, Enum):
    owner = "owner"
    editor = "editor"
    viewer = "viewer"


class SubmissionStatus(str, Enum):
    queued = "queued"
    running = "running"
    complete = "complete"
    failed = "failed"
    error = "error"
    timeout = "timeout"


class SubmissionPassFail(str, Enum):
    pass_ = "pass"
    fail = "fail"
    unknown = "unknown"

    @property
    def db_value(self) -> str:
        return "pass" if self is SubmissionPassFail.pass_ else self.value


class AnomalySeverity(str, Enum):
    fod = "fod"