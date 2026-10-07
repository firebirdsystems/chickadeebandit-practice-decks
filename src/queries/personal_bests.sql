SELECT
  id,
  member_id,
  deck_key,
  label,
  card_count,
  best_ms,
  best_date,
  run_count,
  last_date
FROM app_practice_decks__bests
ORDER BY last_date DESC, member_id
LIMIT 300
