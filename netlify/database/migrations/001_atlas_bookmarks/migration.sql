CREATE TABLE IF NOT EXISTS atlas_bookmarks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  item_kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, item_kind, item_id)
);

CREATE INDEX IF NOT EXISTS atlas_bookmarks_session_idx ON atlas_bookmarks (session_id);
CREATE INDEX IF NOT EXISTS atlas_bookmarks_item_idx ON atlas_bookmarks (item_kind, item_id);
