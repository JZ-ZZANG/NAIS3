import type Database from 'better-sqlite3'

/**
 * 커스텀 기능 전용 스키마. upstream DB user_version을 올리지 않아 순정 v16과 왕복 호환된다.
 * 여러 번 호출하거나 과거 커스텀 DB에 테이블이 이미 있어도 안전하다.
 */
export function ensureSceneAdditionSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scene_character_additions (
      scene_id INTEGER PRIMARY KEY REFERENCES gen_scenes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scene_character_addition_prompts (
      scene_id INTEGER NOT NULL REFERENCES scene_character_additions(scene_id) ON DELETE CASCADE,
      character_prompt_id INTEGER NOT NULL REFERENCES character_prompts(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scene_id, character_prompt_id)
    );

    CREATE TABLE IF NOT EXISTS scene_character_addition_charrefs (
      scene_id INTEGER NOT NULL REFERENCES scene_character_additions(scene_id) ON DELETE CASCADE,
      charref_id INTEGER NOT NULL REFERENCES charref_images(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scene_id, charref_id)
    );

    CREATE TABLE IF NOT EXISTS scene_character_addition_vibes (
      scene_id INTEGER NOT NULL REFERENCES scene_character_additions(scene_id) ON DELETE CASCADE,
      vibe_id INTEGER NOT NULL REFERENCES vibe_images(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scene_id, vibe_id)
    );
  `)
}

/** 과거 커스텀 v17(DB v16 시퀀스/추가 + v17 출연 예약)만 식별한다. */
export function isLegacyCustomV17(db: Database.Database): boolean {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
    name: string
  }[]
  const names = new Set(tables.map((row) => row.name))
  const hasReserveJson = (
    db.prepare('PRAGMA table_info(gen_scenes)').all() as { name: string }[]
  ).some((column) => column.name === 'reserve_json')
  return (
    hasReserveJson && names.has('scene_character_additions') && names.has('scene_sequence_entries')
  )
}
