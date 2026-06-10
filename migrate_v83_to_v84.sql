-- Upgrade v8.3.x -> v8.4: store the exact prompt used and the "show jewelry on" choice per image.
-- Run once in each instance's D1 console.
ALTER TABLE activity ADD COLUMN prompt TEXT;
ALTER TABLE activity ADD COLUMN display_on TEXT;
