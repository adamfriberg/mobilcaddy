-- Adds miss-direction tracking per hole (putts, fairway_hit, green_in_regulation already existed from Fas 1)

ALTER TABLE hole_scores ADD COLUMN IF NOT EXISTS miss_direction TEXT;
