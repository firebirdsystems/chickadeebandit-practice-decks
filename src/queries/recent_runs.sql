SELECT
  id,
  member_id,
  deck_key,
  label,
  card_count,
  missed_count,
  duration_ms,
  run_date
FROM app_practice_decks__runs
ORDER BY created_at DESC
LIMIT 100
