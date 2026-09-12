/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DATABASE LAYER (db/database.js)
 * ==============================================================================
 * Synchronous, robust SQLite storage powered by better-sqlite3:
 * - Persistent per-user database file located in app.getPath('userData')
 * - WAL mode enabled for high-throughput concurrent reads and atomic writes
 * - Strict foreign key enforcement
 * - Transactional versioned migration runner
 * - Defensive error handling (never crashes the desktop shell)
 * ==============================================================================
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { migrations } = require('./migrations');

let dbInstance = null;

/**
 * Resolves the database file location inside the user's isolated application data folder.
 * Windows: %APPDATA%\aidepartment\aidepartment.db
 * macOS: ~/Library/Application Support/aidepartment/aidepartment.db
 * Linux: ~/.config/aidepartment/aidepartment.db
 *
 * @returns {string} Absolute path to the sqlite file
 */
function getDatabasePath() {
  try {
    const userDataPath = app ? app.getPath('userData') : path.join(process.cwd(), '.data');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    return path.join(userDataPath, 'aidepartment.db');
  } catch (err) {
    console.error('[Database] Failed to resolve userData path, falling back to cwd:', err.message);
    return path.join(process.cwd(), 'aidepartment.db');
  }
}

/**
 * Initializes or returns the active database connection.
 * @returns {import('better-sqlite3').Database | null}
 */
function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = getDatabasePath();
  console.log(`[Database] Connecting to SQLite at: ${dbPath}`);

  try {
    // Dynamically load better-sqlite3 with graceful error interception
    let Database;
    try {
      Database = require('better-sqlite3');
    } catch (loadErr) {
      console.error('[Database] Native better-sqlite3 module could not be loaded:', loadErr.message);
      console.warn('[Database] Ensure "npm run postinstall" has executed to compile native bindings for Electron.');
      return null;
    }

    dbInstance = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? (sql) => console.log(`[SQL] ${sql}`) : null,
      fileMustExist: false,
      timeout: 5000,
    });

    // Enforce WAL journal mode and foreign key constraints
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('synchronous = NORMAL');

    console.log('[Database] Connected successfully with WAL mode and foreign keys active.');
    return dbInstance;
  } catch (error) {
    console.error('[Database] Critical error establishing SQLite connection:', error.message);
    dbInstance = null;
    return null;
  }
}

/**
 * Executes pending database migrations sequentially inside isolated transactions.
 * Tracks executed versions in the `schema_migrations` table.
 *
 * @returns {boolean} True if migrations succeeded or were already current
 */
function runMigrations() {
  const db = getDb();
  if (!db) {
    console.warn('[Database] Skipping migrations because database connection is unavailable.');
    return false;
  }

  try {
    // 1. Ensure migrations audit table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    // 2. Fetch already applied migration versions
    const appliedRows = db.prepare('SELECT version FROM schema_migrations ORDER BY version ASC').all();
    const appliedVersions = new Set(appliedRows.map((r) => r.version));

    // 3. Filter pending migrations
    const pendingMigrations = migrations
      .filter((m) => !appliedVersions.has(m.version))
      .sort((a, b) => a.version - b.version);

    if (pendingMigrations.length === 0) {
      console.log('[Database] Schema is fully up to date. No migrations to apply.');
      return true;
    }

    console.log(`[Database] Found ${pendingMigrations.length} pending migration(s)...`);

    // 4. Run each migration inside a dedicated atomic transaction
    for (const migration of pendingMigrations) {
      const applyMigrationTx = db.transaction(() => {
        console.log(`[Database] Applying migration v${migration.version}: ${migration.name}...`);
        migration.up(db);
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
      });

      applyMigrationTx();
      console.log(`[Database] Successfully applied migration v${migration.version}: ${migration.name}`);
    }

    console.log('[Database] All migrations completed successfully.');
    return true;
  } catch (error) {
    console.error('[Database] Migration failure:', error.message);
    return false;
  }
}

/**
 * Closes the active database connection safely if opened.
 */
function closeDb() {
  if (dbInstance && dbInstance.open) {
    try {
      dbInstance.close();
      console.log('[Database] Connection closed cleanly.');
    } catch (err) {
      console.error('[Database] Error closing connection:', err.message);
    } finally {
      dbInstance = null;
    }
  }
}

module.exports = {
  getDb,
  runMigrations,
  closeDb,
  getDatabasePath,
};
