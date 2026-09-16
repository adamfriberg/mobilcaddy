-- Seeds Jönköpings GK (white tee) course + 18 holes.
-- Safe to re-run: course insert is guarded, hole insert upserts on (course_id, hole_number).

INSERT INTO courses (name, location, par_total)
SELECT 'Jönköpings GK', 'Kättilstorp, Jönköping', 70
WHERE NOT EXISTS (SELECT 1 FROM courses WHERE name = 'Jönköpings GK');

INSERT INTO holes (course_id, hole_number, par, length_meters, handicap_index)
SELECT c.id, h.hole_number, h.par, h.length_meters, h.handicap_index
FROM (VALUES
    (1,  5, 452, 13),
    (2,  4, 363, 3),
    (3,  4, 375, 9),
    (4,  4, 318, 17),
    (5,  3, 156, 11),
    (6,  4, 391, 1),
    (7,  4, 335, 7),
    (8,  3, 145, 15),
    (9,  4, 372, 5),
    (10, 3, 139, 16),
    (11, 3, 161, 6),
    (12, 5, 507, 2),
    (13, 4, 295, 14),
    (14, 5, 459, 18),
    (15, 4, 267, 10),
    (16, 3, 152, 12),
    (17, 4, 326, 8),
    (18, 4, 381, 4)
) AS h(hole_number, par, length_meters, handicap_index)
JOIN courses c ON c.name = 'Jönköpings GK'
ON CONFLICT (course_id, hole_number) DO UPDATE
SET par = EXCLUDED.par,
    length_meters = EXCLUDED.length_meters,
    handicap_index = EXCLUDED.handicap_index;
