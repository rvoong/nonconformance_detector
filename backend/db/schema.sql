BEGIN;

-- users
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- projects (depends on users via created_by_user_id)
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    created_by_user_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    detector_version VARCHAR,

    CONSTRAINT fk_projects_created_by_user
        FOREIGN KEY (created_by_user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- project_members (join table depends on projects + users)
CREATE TABLE project_members (
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL,

    CONSTRAINT pk_project_members PRIMARY KEY (project_id, user_id),

    CONSTRAINT fk_project_members_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_project_members_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT project_members_role_check
        CHECK (role IN ('owner', 'editor', 'viewer'))
);

-- submissions (depends on projects + users)
CREATE TABLE submissions (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL,
    submitted_by_user_id UUID NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    image_id VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    pass_fail VARCHAR NOT NULL,
    anomaly_count INT,
    error_message TEXT,
    annotated_image TEXT,

    CONSTRAINT fk_submissions_project
        FOREIGN KEY (project_id)
        REFERENCES projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_submissions_submitted_by_user
        FOREIGN KEY (submitted_by_user_id)
        REFERENCES users(id)
        ON DELETE RESTRICT,

    CONSTRAINT submissions_status_check
        CHECK (status IN ('queued', 'running', 'complete', 'failed', 'error', 'timeout')),

    CONSTRAINT submissions_pass_fail_check
        CHECK (pass_fail IN ('pass', 'fail', 'unknown')),

    CONSTRAINT submissions_anomaly_count_check
        CHECK (anomaly_count >= 0)
);

-- anomalies (depends on submissions)
CREATE TABLE anomalies (
    id UUID PRIMARY KEY,
    submission_id UUID NOT NULL,
    label VARCHAR NOT NULL,
    description TEXT,
    severity VARCHAR,
    confidence DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_anomalies_submission
        FOREIGN KEY (submission_id)
        REFERENCES submissions(id)
        ON DELETE CASCADE,

    CONSTRAINT anomalies_severity_check
        CHECK (severity IS NULL OR severity IN ('fod')),

    CONSTRAINT anomalies_confidence_check
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

COMMIT;