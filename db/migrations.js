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
  {
    version: 3,
    name: '003_models_cache_table',
    up: (db) => {
      // 9. Live Models Cache table (persisting verified provider models)
      db.exec(`
        CREATE TABLE IF NOT EXISTS models_cache (
          provider TEXT NOT NULL,
          model_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          features_json TEXT NOT NULL,
          fetched_at TEXT DEFAULT (datetime('now')),
          PRIMARY KEY (provider, model_id)
        );
      `);

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_models_cache_provider ON models_cache(provider);
      `);
    },
  },
  {
    version: 4,
    name: '004_task_orchestrator_tables',
    up: (db) => {
      // 10. Task Graphs table
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_graphs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          graph_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          result_json TEXT,
          stats_json TEXT
        );
      `);

      // 11. Individual Task Nodes table
      db.exec(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          graph_id TEXT NOT NULL,
          node_id TEXT NOT NULL,
          handler TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER DEFAULT 0,
          started_at TEXT,
          finished_at TEXT,
          error TEXT,
          output_json TEXT,
          UNIQUE (graph_id, node_id)
        );
      `);

      // 12. Task Events stream table
      db.exec(`
        CREATE TABLE IF NOT EXISTS task_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          graph_id TEXT NOT NULL,
          node_id TEXT,
          event_type TEXT NOT NULL,
          data_json TEXT,
          timestamp TEXT DEFAULT (datetime('now'))
        );
      `);

      // Indexes for query performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_task_graphs_graph_id ON task_graphs(graph_id);
        CREATE INDEX IF NOT EXISTS idx_task_graphs_status ON task_graphs(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_graph_id ON tasks(graph_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_node_id ON tasks(graph_id, node_id);
        CREATE INDEX IF NOT EXISTS idx_task_events_graph ON task_events(graph_id);
        CREATE INDEX IF NOT EXISTS idx_task_events_timestamp ON task_events(timestamp DESC);
      `);
    },
  },
  {
    version: 5,
    name: '005_project_knowledge_store',
    up: (db) => {
      const pragmaCols = db.prepare('PRAGMA table_info(projects)').all();
      const colNames = pragmaCols.map((c) => c.name);

      if (!colNames.includes('folder_path')) {
        db.exec('ALTER TABLE projects ADD COLUMN folder_path TEXT;');
      }
      if (!colNames.includes('type')) {
        db.exec("ALTER TABLE projects ADD COLUMN type TEXT DEFAULT 'website';");
      }

      db.exec(`
        UPDATE projects
        SET type = COALESCE(type, project_type, 'website')
        WHERE type IS NULL;
      `);
    },
  },
];

module.exports = {
  migrations,
};
