-- Upgrade v8.6 -> v8.7: store the background reference image used (if any) per row.
-- Run once in each instance's D1 console.
ALTER TABLE activity ADD COLUMN ref_file TEXT;
