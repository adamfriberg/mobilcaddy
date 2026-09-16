-- Mobilcaddy initial schema (Fas 1)

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    location   TEXT,
    par_total  INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS holes (
    id               SERIAL PRIMARY KEY,
    course_id        INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    hole_number      INTEGER NOT NULL,
    par              INTEGER NOT NULL,
    length_meters    INTEGER,
    handicap_index   INTEGER,
    tee_lat          DOUBLE PRECISION,
    tee_lng          DOUBLE PRECISION,
    green_front_lat  DOUBLE PRECISION,
    green_front_lng  DOUBLE PRECISION,
    green_mid_lat    DOUBLE PRECISION,
    green_mid_lng    DOUBLE PRECISION,
    green_back_lat   DOUBLE PRECISION,
    green_back_lng   DOUBLE PRECISION,
    layout_geojson   JSONB,
    UNIQUE (course_id, hole_number)
);

CREATE TABLE IF NOT EXISTS clubs (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    average_distance_m INTEGER,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goals (
    id                SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_handicap   NUMERIC(4,1) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rounds (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    INTEGER NOT NULL REFERENCES courses(id),
    played_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished     BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS hole_scores (
    id            SERIAL PRIMARY KEY,
    round_id      INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    hole_id       INTEGER NOT NULL REFERENCES holes(id),
    strokes       INTEGER,
    putts         INTEGER,
    fairway_hit   BOOLEAN,
    green_in_regulation BOOLEAN,
    UNIQUE (round_id, hole_id)
);

CREATE TABLE IF NOT EXISTS shots (
    id            SERIAL PRIMARY KEY,
    hole_score_id INTEGER NOT NULL REFERENCES hole_scores(id) ON DELETE CASCADE,
    club_id       INTEGER REFERENCES clubs(id),
    distance_m    INTEGER,
    shot_number   INTEGER
);
