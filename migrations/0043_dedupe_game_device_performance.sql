-- Deduplicate active records in game_device_performance, keeping the highest revision / newest record
UPDATE game_device_performance
SET active = 0, superseded_at = datetime('now'), updated_at = datetime('now')
WHERE active = 1 AND id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY game_id, hardware_id
      ORDER BY revision DESC, updated_at DESC, id DESC
    ) as rn
    FROM game_device_performance
    WHERE active = 1
  ) WHERE rn = 1
);

-- Clean up orphaned game_device_performance_modes
DELETE FROM game_device_performance_modes
WHERE performance_id NOT IN (SELECT id FROM game_device_performance);
