export const BACKUP_FORMAT_VERSION = 1 as const

export const CUSTOM_BACKUP_TABLES = [
  'scene_character_additions',
  'scene_character_addition_prompts',
  'scene_character_addition_charrefs',
  'scene_character_addition_vibes',
  'scene_plus_presets',
  'scene_plus_scenes',
  'scene_plus_slots',
  'scene_plus_casts',
  'scene_plus_cast_charrefs',
  'scene_plus_cast_vibes',
  'scene_plus_cast_groups',
  'scene_plus_cast_group_members',
  'scene_plus_cast_settings',
  'scene_plus_cast_slots'
] as const

export const BACKUP_TABLES = [
  'character_folders',
  'character_prompts',
  'fragment_folders',
  'fragments',
  'vibe_folders',
  'vibe_images',
  'charref_folders',
  'charref_images',
  'scene_presets',
  'gen_scenes',
  ...CUSTOM_BACKUP_TABLES,
  'prompt_presets',
  'library_stacks',
  'library_images'
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]
export type BackupRow = Record<string, string | number | null | Buffer>

export const BACKUP_SETTING_KEYS = [
  'scene_casts',
  'scene_cast_groups_personal_v1',
  'scene_additions_enabled'
] as const
export type BackupSettings = Partial<Record<(typeof BACKUP_SETTING_KEYS)[number], string>>

/** Only portable scene settings belong in workspace backups. */
export function parseBackupSettings(value: unknown): BackupSettings {
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Backup contains invalid workspace settings')
  const source = value as Record<string, unknown>
  const settings: BackupSettings = {}
  for (const key of BACKUP_SETTING_KEYS) {
    if (source[key] === undefined) continue
    if (typeof source[key] !== 'string')
      throw new Error(`Backup contains an invalid ${key} setting`)
    settings[key] = source[key]
  }
  return settings
}

const CUSTOM_PRIMARY_KEYS: Partial<Record<BackupTableName, readonly string[]>> = {
  scene_character_additions: ['scene_id'],
  scene_character_addition_prompts: ['scene_id', 'character_prompt_id'],
  scene_character_addition_charrefs: ['scene_id', 'charref_id'],
  scene_character_addition_vibes: ['scene_id', 'vibe_id'],
  scene_plus_slots: ['scene_id', 'slot_index'],
  scene_plus_cast_charrefs: ['cast_id', 'charref_id'],
  scene_plus_cast_vibes: ['cast_id', 'vibe_id'],
  scene_plus_cast_group_members: ['group_id', 'cast_id'],
  scene_plus_cast_slots: ['slot_index']
}

/** Join tables use composite keys instead of a synthetic id. */
export function backupRowKey(table: BackupTableName, row: BackupRow): string {
  return (CUSTOM_PRIMARY_KEYS[table] ?? ['id'])
    .map((column) => {
      const value = row[column]
      if (typeof value !== 'number' || !Number.isSafeInteger(value))
        throw new Error(`${table} row is missing a numeric ${column}`)
      return value
    })
    .join('-')
}

export interface BackupFile {
  table: BackupTableName
  rowId: number
  column: 'file_path'
  extension: string
  data: Buffer
}

/**
 * Normalized in-memory backup model. Both .nais archives and legacy NAIS3 JSON
 * are converted to this type before restore.
 */
export interface BackupDatabaseV1 {
  version: typeof BACKUP_FORMAT_VERSION
  includedTables: BackupTableName[]
  tables: Partial<Record<BackupTableName, BackupRow[]>>
  mainParams: string | null
  workspaceSettings?: BackupSettings
  files: BackupFile[]
}

/** Missing source assets must not produce a backup with broken scene references. */
export function assertSceneAssetReferences(tables: BackupDatabaseV1['tables']): void {
  const links = [
    ['scene_character_addition_charrefs', 'charref_id', 'charref_images'],
    ['scene_character_addition_vibes', 'vibe_id', 'vibe_images'],
    ['scene_plus_cast_charrefs', 'charref_id', 'charref_images'],
    ['scene_plus_cast_vibes', 'vibe_id', 'vibe_images']
  ] as const
  for (const [table, column, target] of links) {
    if (!tables[target]) continue
    const assetIds = new Set(tables[target].map((row) => row.id))
    for (const row of tables[table] ?? []) {
      if (!assetIds.has(row[column]))
        throw new Error(
          `Cannot back up ${table}: ${target} ${row[column]} has no source image. Restore the missing image file before retrying.`
        )
    }
  }
}

export interface NaisArchiveManifestV1 {
  format: 'NAIS'
  formatVersion: typeof BACKUP_FORMAT_VERSION
  app: 'NAIS3'
  appVersion: string
  createdAt: string
  scope: 'workspace'
  tables: BackupTableName[]
  tableCounts: Partial<Record<BackupTableName, number>>
}

export function isBackupTableName(value: unknown): value is BackupTableName {
  return typeof value === 'string' && (BACKUP_TABLES as readonly string[]).includes(value)
}
