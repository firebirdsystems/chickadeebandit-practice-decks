SELECT
  id,
  title,
  mode,
  visibility,
  created_by,
  created_at
FROM app_practice_decks__decks
ORDER BY created_at DESC, id DESC
LIMIT 100
