-- Seeds a single user row for Adam (Fas 3 — scorekort)
-- The app has no login flow; rounds.user_id needs a valid row to reference.

INSERT INTO users (name, email, password_hash)
SELECT 'Adam', 'adam@mobilcaddy.local', 'not-used'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'adam@mobilcaddy.local');
