BEGIN;

--==============================================
-- insert sample data for all tables

-- users (passwords stored in plain text; test@example.com password: test, others: password123)
INSERT INTO users (
    id, email, password_hash, created_at, updated_at
) VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'test@example.com',
    'test',
    NOW(),
    NOW()
),
(
    '11111111-1111-1111-1111-111111111111',
    'alice@example.com',
    'password123',
    NOW(),
    NOW()
),
(
    '22222222-2222-2222-2222-222222222222',
    'bob@example.com',
    'password123',
    NOW(),
    NOW()
),
(
    '33333333-3333-3333-3333-333333333333',
    'carol@example.com',
    'password123',
    NOW(),
    NOW()
);

-- projects
INSERT INTO projects (
    id, name, description, created_by_user_id,
    created_at, updated_at, detector_version
) VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Demo — FOD Inspection',
    'Demo project with pre-loaded design spec and sample FOD image. Use for trying the app without creating your own project.',
    '11111111-1111-1111-1111-111111111111',
    NOW(),
    NOW(),
    'detector-v1.2.0'
);

-- project_members
INSERT INTO project_members (
    project_id, user_id, role, joined_at
) VALUES
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    'owner',
    NOW()
),
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '22222222-2222-2222-2222-222222222222',
    'editor',
    NOW()
),
(
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '33333333-3333-3333-3333-333333333333',
    'viewer',
    NOW()
);

-- submissions and anomalies are seeded at runtime by seed_data.py
-- (uploads real files to MinIO and runs FOD detection)

COMMIT;