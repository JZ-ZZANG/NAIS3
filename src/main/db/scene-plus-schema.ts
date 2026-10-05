import type Database from 'better-sqlite3'

/**
 * 씬+ 전용 스키마. 기존 씬 모드 테이블과 user_version을 공유하지 않는다.
 * 캐릭터/레퍼런스/바이브 원본만 기존 라이브러리를 참조한다.
 */
export function ensureScenePlusSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scene_plus_presets (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      default_width INTEGER NOT NULL DEFAULT 832,
      default_height INTEGER NOT NULL DEFAULT 1216,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scene_plus_scenes (
      id INTEGER PRIMARY KEY,
      preset_id INTEGER NOT NULL REFERENCES scene_plus_presets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL DEFAULT 832,
      height INTEGER NOT NULL DEFAULT 1216,
      use_coords INTEGER NOT NULL DEFAULT 0,
      reserve_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scene_plus_scenes_preset
      ON scene_plus_scenes(preset_id, sort_order);

    CREATE TABLE IF NOT EXISTS scene_plus_slots (
      scene_id INTEGER NOT NULL REFERENCES scene_plus_scenes(id) ON DELETE CASCADE,
      slot_index INTEGER NOT NULL CHECK(slot_index >= 1),
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      center_x REAL,
      center_y REAL,
      PRIMARY KEY (scene_id, slot_index)
    );

    CREATE TABLE IF NOT EXISTS scene_plus_casts (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      character_prompt_id INTEGER REFERENCES character_prompts(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scene_plus_cast_charrefs (
      cast_id INTEGER NOT NULL REFERENCES scene_plus_casts(id) ON DELETE CASCADE,
      charref_id INTEGER NOT NULL REFERENCES charref_images(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (cast_id, charref_id)
    );

    CREATE TABLE IF NOT EXISTS scene_plus_cast_vibes (
      cast_id INTEGER NOT NULL REFERENCES scene_plus_casts(id) ON DELETE CASCADE,
      vibe_id INTEGER NOT NULL REFERENCES vibe_images(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (cast_id, vibe_id)
    );

    CREATE TABLE IF NOT EXISTS scene_plus_cast_groups (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS scene_plus_cast_group_members (
      group_id INTEGER NOT NULL REFERENCES scene_plus_cast_groups(id) ON DELETE CASCADE,
      cast_id INTEGER NOT NULL REFERENCES scene_plus_casts(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (group_id, cast_id)
    );

    CREATE TABLE IF NOT EXISTS scene_plus_cast_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      slot_count INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO scene_plus_cast_settings (id, slot_count) VALUES (1, 0);

    CREATE TABLE IF NOT EXISTS scene_plus_cast_slots (
      slot_index INTEGER PRIMARY KEY CHECK(slot_index >= 1),
      cast_id INTEGER REFERENCES scene_plus_casts(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES scene_plus_cast_groups(id) ON DELETE CASCADE,
      CHECK (
        (cast_id IS NOT NULL AND group_id IS NULL) OR
        (cast_id IS NULL AND group_id IS NOT NULL)
      )
    );

    CREATE TABLE IF NOT EXISTS scene_plus_images (
      image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
      scene_id INTEGER NOT NULL REFERENCES scene_plus_scenes(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_scene_plus_images_scene
      ON scene_plus_images(scene_id, image_id DESC);
  `)

  db.exec(`
    DROP TABLE IF EXISTS scene_plus_preset_casts;
    DROP TABLE IF EXISTS scene_plus_preset_cast_groups;
  `)
  const presetColumns = db.prepare('PRAGMA table_info(scene_plus_presets)').all() as {
    name: string
  }[]
  if (presetColumns.some((column) => column.name === 'cast_slot_count'))
    db.exec('ALTER TABLE scene_plus_presets DROP COLUMN cast_slot_count')

  const count = db.prepare('SELECT COUNT(*) AS count FROM scene_plus_presets').get() as {
    count: number
  }
  if (count.count === 0) {
    db.prepare("INSERT INTO scene_plus_presets (name, sort_order) VALUES ('기본', 0)").run()
  }
}
