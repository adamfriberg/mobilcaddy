-- Adds image-position calibration points per hole (Fas 5 / Steg B — kalibrerad avståndscirkel)
-- Paired with tee_lat/lng and green_mid_lat/lng, these let the app translate any point
-- dragged on the hole photo into a real-world distance.

ALTER TABLE holes ADD COLUMN IF NOT EXISTS tee_image_x NUMERIC;
ALTER TABLE holes ADD COLUMN IF NOT EXISTS tee_image_y NUMERIC;
ALTER TABLE holes ADD COLUMN IF NOT EXISTS green_mid_image_x NUMERIC;
ALTER TABLE holes ADD COLUMN IF NOT EXISTS green_mid_image_y NUMERIC;
