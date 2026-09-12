/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DATABASE MIGRATIONS (db/migrations.js)
 * ==============================================================================
 * Versioned schema migrations designed for future Variety Engine, page-by-page
 * review workflows, design tokens, and multi-agent synthesis.
 * ==============================================================================
 */

const migrations = [
  {
    version: 1,
    name: '001_core_tables',
    up: (db) => {
      // 1. Settings key-value store
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);

      // 2. Projects table
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          project_type TEXT NOT NULL DEFAULT 'website',
          description TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'active',
          current_seed_id INTEGER,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // 3. Pages table
      db.exec(`
        CREATE TABLE IF NOT EXISTS pages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          page_order INTEGER DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // 4. Design seeds (Variety Engine storage)
      db.exec(`
        CREATE TABLE IF NOT EXISTS design_seeds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          seed_data TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // 5. Design tokens (theme / colors per project)
      db.exec(`
        CREATE TABLE IF NOT EXISTS design_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          token_data TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // 6. Reviews (page-by-page review history)
      db.exec(`
        CREATE TABLE IF NOT EXISTS reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
          action TEXT NOT NULL,
          notes TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // 7. Activity Log (audit trail and dashboard stream)
      db.exec(`
        CREATE TABLE IF NOT EXISTS activity_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER,
          message TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      // Performance & Referential Indexes
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id);
        CREATE INDEX IF NOT EXISTS idx_design_seeds_project_id ON design_seeds(project_id);
        CREATE INDEX IF NOT EXISTS idx_design_tokens_project_id ON design_tokens(project_id);
        CREATE INDEX IF NOT EXISTS idx_reviews_page_id ON reviews(page_id);
        CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
      `);
    },
  },
  {
    version: 2,
    name: '002_ai_usage_table',
    up: (db) => {
      // 8. AI Usage tracking (Phase 3 Model Adapter & Rate Limiting logs)
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT DEFAULT (datetime('now')),
          model TEXT NOT NULL,
          task_profile TEXT NOT NULL,
          prompt_tokens INTEGER DEFAULT 0,
          output_tokens INTEGER DEFAULT 0,
          latency_ms INTEGER DEFAULT 0,
          status TEXT NOT NULL,
          error_message TEXT
        );
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_ai_usage_timestamp ON ai_usage(timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_usage_profile ON ai_usage(task_profile);
      `);
    },
  },
];

module.exports = {
  migrations,
};
