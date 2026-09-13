/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROJECT KNOWLEDGE STORE ENGINE (core/knowledge-store.js)
 * ==============================================================================
 * The shared, persistent single source of truth for all projects and future agents.
 * Keeps per-project JSON documents (brief, design-seed, design-tokens, pages,
 * review-log, decisions, assets) in sync with SQLite indexing.
 *
 * Guarantees:
 * - Atomic JSON writes (temp file + atomic rename) to avoid corruption on crash.
 * - Strict schema validation on every mutation.
 * - Complete version tracking for design tokens.
 * - Scope-enforced architectural decisions (global, page, component).
 * - Full export/import via ZIP bundles.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
let electronApp = null;

if (process.versions && process.versions.electron) {
  try {
    const electron = require('electron');
    electronApp = electron?.app || null;
  } catch (_) {
    // Non-electron test runner environment
  }
}

const {
  validateBrief,
  validateDesignSeed,
  validateDesignTokens,
  validatePages,
  validateReviewLog,
  validateDecisions,
  validateAssets,
  validateDocument,
  normalizeProjectType,
  createDefaultBrief,
  createDefaultSeed,
  createDefaultTokens,
  createDefaultPages,
  createDefaultReviewLog,
  createDefaultDecisions,
  createDefaultAssets,
} = require('./store-schema');

class KnowledgeStore {
  /**
   * @param {object} [options]
   * @param {import('better-sqlite3').Database} [options.db]
   * @param {string} [options.baseDir]
   */
  constructor(options = {}) {
    this.db = options.db || null;
    this.customBaseDir = options.baseDir || null;
    console.log('[KnowledgeStore] Project Knowledge Store Engine initialized.');
  }

  /**
   * Resolves the active SQLite database instance.
   * @returns {import('better-sqlite3').Database}
   */
  getDb() {
    if (this.db) return this.db;
    try {
      const { getDb } = require('../db/database');
      this.db = getDb();
      return this.db;
    } catch (err) {
      console.warn('[KnowledgeStore] Database layer unavailable:', err.message);
      return null;
    }
  }

  /**
   * Resolves the base root directory for stored projects.
   * userData/projects/
   * @returns {string} Absolute path
   */
  getProjectsDir() {
    if (this.customBaseDir) {
      if (!fs.existsSync(this.customBaseDir)) {
        fs.mkdirSync(this.customBaseDir, { recursive: true });
      }
      return this.customBaseDir;
    }

    const userData = electronApp
      ? electronApp.getPath('userData')
      : path.join(process.cwd(), '.data');
    const projectsDir = path.join(userData, 'projects');

    if (!fs.existsSync(projectsDir)) {
      fs.mkdirSync(projectsDir, { recursive: true });
    }
    return projectsDir;
  }

  /**
   * Resolves the directory for a specific project.
   * @param {string|number} projectId
   * @returns {string}
   */
  getProjectFolder(projectId) {
    const pDir = this.getProjectsDir();
    return path.join(pDir, String(projectId));
  }

  /**
   * Atomically writes JSON data to disk via temp file + rename.
   * @param {string} filePath
   * @param {any} data
   */
  writeJsonAtomic(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const content = JSON.stringify(data, null, 2);

    fs.writeFileSync(tempPath, content, 'utf8');

    try {
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      // Cross-device link or windows lock fallback
      try {
        fs.copyFileSync(tempPath, filePath);
        fs.unlinkSync(tempPath);
      } catch (innerErr) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
        throw new Error(`Failed to write file atomically at ${filePath}: ${innerErr.message}`);
      }
    }
  }

  /**
   * Safely reads and parses a JSON document.
   * @param {string} filePath
   * @returns {any|null}
   */
  readJsonSafe(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[KnowledgeStore] Error reading JSON from ${filePath}:`, err.message);
      return null;
    }
  }

  /**
   * Touches project updated_at in SQLite.
   * @param {string|number} projectId
   */
  touchProject(projectId) {
    const db = this.getDb();
    if (!db) return;
    try {
      db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(projectId);
    } catch (err) {
      console.warn(`[KnowledgeStore] Failed to update updated_at for project ${projectId}:`, err.message);
    }
  }

  // ==============================================================================
  // PROJECT LIFECYCLE (create, list, get, delete, export, import)
  // ==============================================================================

  /**
   * Creates a new project, initializes its folder and 7 canonical documents.
   * @param {{ name: string, type?: string, description?: string, pages?: string[] }} data
   * @returns {Promise<object>} Complete project state
   */
  async createProject(data = {}) {
    const db = this.getDb();
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error('Project name is required and cannot be empty.');
    }

    const name = data.name.trim();
    const type = normalizeProjectType(data.type);
    const description = typeof data.description === 'string' ? data.description.trim() : '';
    const pageList = Array.isArray(data.pages) && data.pages.length > 0
      ? data.pages.map((p) => String(p).trim()).filter(Boolean)
      : ['Home'];

    let projectId;
    let folderPath;

    if (db) {
      // Create project entry in SQLite
      const stmt = db.prepare(`
        INSERT INTO projects (name, type, project_type, description, status, folder_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'draft', '', datetime('now'), datetime('now'))
      `);
      const info = stmt.run(name, type, type, description);
      projectId = String(info.lastInsertRowid);
      folderPath = this.getProjectFolder(projectId);

      db.prepare('UPDATE projects SET folder_path = ? WHERE id = ?').run(folderPath, projectId);

      // Populate SQLite pages table for backward compatibility & statistics
      const pageStmt = db.prepare(`
        INSERT INTO pages (project_id, name, page_order, status, created_at, updated_at)
        VALUES (?, ?, ?, 'pending', datetime('now'), datetime('now'))
      `);
      pageList.forEach((pName, idx) => {
        pageStmt.run(projectId, pName, idx);
      });

      // Activity log
      try {
        db.prepare("INSERT INTO activity_log (project_id, message, created_at) VALUES (?, ?, datetime('now'))")
          .run(projectId, `Project created: ${name} with Knowledge Store`);
      } catch (_) {}
    } else {
      projectId = `proj-${Date.now()}`;
      folderPath = this.getProjectFolder(projectId);
    }

    // Ensure directory exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    // Create default documents
    const briefDoc = createDefaultBrief({ name, type, description, pages: pageList });
    const seedDoc = createDefaultSeed();
    const tokensDoc = createDefaultTokens();
    const pagesDoc = createDefaultPages(pageList);
    const reviewLogDoc = createDefaultReviewLog();
    const decisionsDoc = createDefaultDecisions();
    const assetsDoc = createDefaultAssets();

    // Validate documents
    validateBrief(briefDoc);
    validateDesignSeed(seedDoc);
    validateDesignTokens(tokensDoc);
    validatePages(pagesDoc);
    validateReviewLog(reviewLogDoc);
    validateDecisions(decisionsDoc);
    validateAssets(assetsDoc);

    // Atomically write all 7 documents
    this.writeJsonAtomic(path.join(folderPath, 'brief.json'), briefDoc);
    this.writeJsonAtomic(path.join(folderPath, 'design-seed.json'), seedDoc);
    this.writeJsonAtomic(path.join(folderPath, 'design-tokens.json'), tokensDoc);
    this.writeJsonAtomic(path.join(folderPath, 'pages.json'), pagesDoc);
    this.writeJsonAtomic(path.join(folderPath, 'review-log.json'), reviewLogDoc);
    this.writeJsonAtomic(path.join(folderPath, 'decisions.json'), decisionsDoc);
    this.writeJsonAtomic(path.join(folderPath, 'assets.json'), assetsDoc);

    console.log(`[KnowledgeStore] Project created: "${name}" (ID: ${projectId}) at: ${folderPath}`);

    return {
      project: {
        id: projectId,
        name,
        type,
        status: 'draft',
        folder_path: folderPath,
        description,
        page_count: pageList.length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      brief: briefDoc,
      seed: seedDoc,
      tokens: tokensDoc,
      pages: pagesDoc,
      reviewLog: reviewLogDoc,
      decisions: decisionsDoc,
      assets: assetsDoc,
    };
  }

  /**
   * Retrieves all projects from SQLite index with page counts.
   * @returns {Promise<Array<object>>}
   */
  async getProjects() {
    const db = this.getDb();
    if (!db) return [];

    try {
      const stmt = db.prepare(`
        SELECT p.id, p.name, COALESCE(p.type, p.project_type, 'website') AS type,
               p.description, p.status, p.folder_path, p.created_at, p.updated_at,
               (SELECT COUNT(*) FROM pages WHERE project_id = p.id) AS page_count
        FROM projects p
        ORDER BY p.id DESC
      `);
      const rows = stmt.all();

      return rows.map((r) => ({
        ...r,
        type: normalizeProjectType(r.type),
      }));
    } catch (err) {
      console.error('[KnowledgeStore] getProjects error:', err.message);
      return [];
    }
  }

  /**
   * Retrieves a single project and all its 7 knowledge documents.
   * Auto-backfills missing documents if needed.
   * @param {string|number} projectId
   * @returns {Promise<object>}
   */
  async getProject(projectId) {
    const folderPath = this.getProjectFolder(projectId);
    const db = this.getDb();

    let projectRow = null;
    if (db) {
      projectRow = db.prepare(`
        SELECT id, name, COALESCE(type, project_type, 'website') AS type,
               description, status, folder_path, created_at, updated_at
        FROM projects WHERE id = ?
      `).get(projectId);
    }

    if (!projectRow && !fs.existsSync(folderPath)) {
      throw new Error(`Project not found with ID: ${projectId}`);
    }

    // Read or initialize documents
    let brief = this.readJsonSafe(path.join(folderPath, 'brief.json'));
    if (!brief) {
      brief = createDefaultBrief({
        name: projectRow ? projectRow.name : `Project ${projectId}`,
        type: projectRow ? projectRow.type : 'website',
        description: projectRow ? projectRow.description : '',
      });
      this.writeJsonAtomic(path.join(folderPath, 'brief.json'), brief);
    }

    let seed = this.readJsonSafe(path.join(folderPath, 'design-seed.json'));
    if (!seed) {
      seed = createDefaultSeed();
      this.writeJsonAtomic(path.join(folderPath, 'design-seed.json'), seed);
    }

    let tokens = this.readJsonSafe(path.join(folderPath, 'design-tokens.json'));
    if (!tokens) {
      tokens = createDefaultTokens();
      this.writeJsonAtomic(path.join(folderPath, 'design-tokens.json'), tokens);
    }

    let pages = this.readJsonSafe(path.join(folderPath, 'pages.json'));
    if (!pages) {
      pages = createDefaultPages();
      this.writeJsonAtomic(path.join(folderPath, 'pages.json'), pages);
    }

    let reviewLog = this.readJsonSafe(path.join(folderPath, 'review-log.json'));
    if (!reviewLog) {
      reviewLog = createDefaultReviewLog();
      this.writeJsonAtomic(path.join(folderPath, 'review-log.json'), reviewLog);
    }

    let decisions = this.readJsonSafe(path.join(folderPath, 'decisions.json'));
    if (!decisions) {
      decisions = createDefaultDecisions();
      this.writeJsonAtomic(path.join(folderPath, 'decisions.json'), decisions);
    }

    let assets = this.readJsonSafe(path.join(folderPath, 'assets.json'));
    if (!assets) {
      assets = createDefaultAssets();
      this.writeJsonAtomic(path.join(folderPath, 'assets.json'), assets);
    }

    const projectMeta = projectRow || {
      id: projectId,
      name: brief.projectName,
      type: brief.projectType,
      description: brief.userRequirements,
      status: 'active',
      folder_path: folderPath,
      created_at: brief.createdAt,
      updated_at: brief.updatedAt,
    };

    return {
      project: {
        ...projectMeta,
        type: normalizeProjectType(projectMeta.type),
        page_count: pages.pages.length,
      },
      brief,
      seed,
      tokens,
      pages,
      reviewLog,
      decisions,
      assets,
    };
  }

  // ==============================================================================
  // BRIEF OPERATIONS
  // ==============================================================================

  /**
   * Retrieves brief.json for a project.
   * @param {string|number} projectId
   */
  async getBrief(projectId) {
    const folder = this.getProjectFolder(projectId);
    const brief = this.readJsonSafe(path.join(folder, 'brief.json'));
    if (!brief) throw new Error(`Brief document missing for project ${projectId}`);
    return brief;
  }

  /**
   * Merges partial updates into brief.json and validates.
   * @param {string|number} projectId
   * @param {object} partial
   */
  async updateBrief(projectId, partial = {}) {
    const folder = this.getProjectFolder(projectId);
    const current = await this.getBrief(projectId);

    const updated = {
      ...current,
      ...partial,
      projectName: partial.projectName !== undefined ? String(partial.projectName).trim() : current.projectName,
      projectType: partial.projectType !== undefined ? normalizeProjectType(partial.projectType) : current.projectType,
      userRequirements: partial.userRequirements !== undefined ? String(partial.userRequirements).trim() : current.userRequirements,
      interpretedRequirements: {
        ...current.interpretedRequirements,
        ...(partial.interpretedRequirements || {}),
      },
      updatedAt: new Date().toISOString(),
    };

    validateBrief(updated);
    this.writeJsonAtomic(path.join(folder, 'brief.json'), updated);

    // Sync SQLite project name and description if changed
    const db = this.getDb();
    if (db) {
      db.prepare(`
        UPDATE projects
        SET name = ?, type = ?, description = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(updated.projectName, updated.projectType, updated.userRequirements, projectId);
    }
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Brief updated for project "${projectId}"`);
    return updated;
  }

  // ==============================================================================
  // SEED OPERATIONS
  // ==============================================================================

  /**
   * Generates a new empty seed placeholder structure.
   * @param {string|number} projectId
   */
  async generateSeedPlaceholder(projectId) {
    const folder = this.getProjectFolder(projectId);
    const currentSeed = this.readJsonSafe(path.join(folder, 'design-seed.json'));
    const previousSeeds = currentSeed && currentSeed.seedId ? [currentSeed.seedId] : [];

    const newSeed = {
      ...createDefaultSeed(),
      previousSeeds,
      notes: `Seed placeholder generated at ${new Date().toLocaleTimeString()}`,
    };

    validateDesignSeed(newSeed);
    this.writeJsonAtomic(path.join(folder, 'design-seed.json'), newSeed);
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Seed placeholder generated for project "${projectId}" (Seed: ${newSeed.seedId})`);
    return newSeed;
  }

  // ==============================================================================
  // DESIGN TOKENS OPERATIONS (Strict Versioning)
  // ==============================================================================

  /**
   * Retrieves design-tokens.json for a project.
   * @param {string|number} projectId
   */
  async getTokens(projectId) {
    const folder = this.getProjectFolder(projectId);
    const tokens = this.readJsonSafe(path.join(folder, 'design-tokens.json'));
    if (!tokens) throw new Error(`Design tokens document missing for project ${projectId}`);
    return tokens;
  }

  /**
   * Updates design tokens by creating a NEW VERSION without overwriting history.
   * @param {string|number} projectId
   * @param {object} changes
   * @param {string} [reason]
   */
  async updateTokens(projectId, changes = {}, reason = 'Updated tokens') {
    const folder = this.getProjectFolder(projectId);
    const current = await this.getTokens(projectId);

    const newVersionNumber = (current.version || 1) + 1;
    const now = new Date().toISOString();

    const mergedColors = { ...current.colors, ...(changes.colors || {}) };
    const mergedTypography = {
      ...current.typography,
      ...(changes.typography || {}),
      scale: {
        ...(current.typography?.scale || {}),
        ...(changes.typography?.scale || {}),
      },
    };
    const mergedSpacing = { ...current.spacing, ...(changes.spacing || {}) };
    const mergedRadius = { ...current.radius, ...(changes.radius || {}) };
    const mergedShadows = { ...current.shadows, ...(changes.shadows || {}) };
    const mergedMotion = { ...current.motion, ...(changes.motion || {}) };

    const snapshot = {
      colors: mergedColors,
      typography: mergedTypography,
      spacing: mergedSpacing,
      radius: mergedRadius,
      shadows: mergedShadows,
      motion: mergedMotion,
    };

    const newVersionEntry = {
      version: newVersionNumber,
      timestamp: now,
      reason: String(reason || 'Token adjustment').trim(),
      tokens: snapshot,
    };

    const updatedTokensDoc = {
      ...snapshot,
      version: newVersionNumber,
      updatedAt: now,
      versions: [newVersionEntry, ...(current.versions || [])],
    };

    validateDesignTokens(updatedTokensDoc);
    this.writeJsonAtomic(path.join(folder, 'design-tokens.json'), updatedTokensDoc);
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Design tokens bumped to v${newVersionNumber} for project "${projectId}" (Reason: "${reason}")`);
    return updatedTokensDoc;
  }

  // ==============================================================================
  // PAGES OPERATIONS (addPage, updatePageStatus, reorderPages, removePage)
  // ==============================================================================

  /**
   * Adds a new page to pages.json and mirrors into SQLite pages.
   * @param {string|number} projectId
   * @param {{ name: string, status?: string }} pageData
   */
  async addPage(projectId, pageData = {}) {
    if (!pageData.name || !pageData.name.trim()) {
      throw new Error('Page name is required.');
    }

    const folder = this.getProjectFolder(projectId);
    const doc = this.readJsonSafe(path.join(folder, 'pages.json')) || { pages: [] };

    const name = pageData.name.trim();
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'page';
    const pageId = `page-${slug}-${Date.now().toString().slice(-4)}`;

    const newPage = {
      pageId,
      name,
      order: doc.pages.length,
      status: pageData.status || 'pending',
      currentDesignRef: null,
      versionHistory: [],
      approvedAt: null,
    };

    doc.pages.push(newPage);
    validatePages(doc);
    this.writeJsonAtomic(path.join(folder, 'pages.json'), doc);

    // Sync SQLite pages
    const db = this.getDb();
    if (db) {
      try {
        db.prepare(`
          INSERT INTO pages (project_id, name, page_order, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(projectId, name, newPage.order, newPage.status);
      } catch (_) {}
    }
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Page "${name}" added to project "${projectId}"`);
    return doc.pages;
  }

  /**
   * Updates status of a page (e.g. pending -> designing -> in_review -> approved).
   * @param {string|number} projectId
   * @param {string} pageId
   * @param {string} status
   */
  async updatePageStatus(projectId, pageId, status) {
    const folder = this.getProjectFolder(projectId);
    const doc = this.readJsonSafe(path.join(folder, 'pages.json')) || { pages: [] };

    const targetPage = doc.pages.find((p) => p.pageId === pageId);
    if (!targetPage) {
      throw new Error(`Page with ID "${pageId}" not found in project ${projectId}`);
    }

    targetPage.status = status;
    if (status === 'approved' && !targetPage.approvedAt) {
      targetPage.approvedAt = new Date().toISOString();
    }

    validatePages(doc);
    this.writeJsonAtomic(path.join(folder, 'pages.json'), doc);

    // Mirror to SQLite
    const db = this.getDb();
    if (db) {
      try {
        db.prepare(`
          UPDATE pages
          SET status = ?, updated_at = datetime('now')
          WHERE project_id = ? AND name = ?
        `).run(status, projectId, targetPage.name);
      } catch (_) {}
    }
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Page "${targetPage.name}" status set to "${status}" in project "${projectId}"`);
    return targetPage;
  }

  /**
   * Reorders pages given an array of page IDs in target order.
   * @param {string|number} projectId
   * @param {string[]} pageIds
   */
  async reorderPages(projectId, pageIds = []) {
    const folder = this.getProjectFolder(projectId);
    const doc = this.readJsonSafe(path.join(folder, 'pages.json')) || { pages: [] };

    const pageMap = new Map(doc.pages.map((p) => [p.pageId, p]));
    const reordered = [];

    pageIds.forEach((id, idx) => {
      const page = pageMap.get(id);
      if (page) {
        page.order = idx;
        reordered.push(page);
        pageMap.delete(id);
      }
    });

    // Append any pages not explicitly listed in pageIds
    pageMap.forEach((p) => {
      p.order = reordered.length;
      reordered.push(p);
    });

    doc.pages = reordered;
    validatePages(doc);
    this.writeJsonAtomic(path.join(folder, 'pages.json'), doc);
    this.touchProject(projectId);

    return doc.pages;
  }

  /**
   * Removes a page from pages.json and SQLite.
   * @param {string|number} projectId
   * @param {string} pageId
   */
  async removePage(projectId, pageId) {
    const folder = this.getProjectFolder(projectId);
    const doc = this.readJsonSafe(path.join(folder, 'pages.json')) || { pages: [] };

    const targetIdx = doc.pages.findIndex((p) => p.pageId === pageId);
    if (targetIdx === -1) {
      throw new Error(`Page with ID "${pageId}" not found in project ${projectId}`);
    }

    const removedPage = doc.pages.splice(targetIdx, 1)[0];
    doc.pages.forEach((p, idx) => {
      p.order = idx;
    });

    validatePages(doc);
    this.writeJsonAtomic(path.join(folder, 'pages.json'), doc);

    // Mirror to SQLite
    const db = this.getDb();
    if (db) {
      try {
        db.prepare('DELETE FROM pages WHERE project_id = ? AND name = ?').run(projectId, removedPage.name);
      } catch (_) {}
    }
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Page "${removedPage.name}" removed from project "${projectId}"`);
    return doc.pages;
  }

  // ==============================================================================
  // REVIEW LOG OPERATIONS (Page-by-page review workflow)
  // ==============================================================================

  /**
   * Appends an entry to review-log.json.
   * @param {string|number} projectId
   * @param {{ pageId: string, verdict: string, instructions: string, actions?: string[], versionId?: string }} entry
   */
  async logReview(projectId, entry = {}) {
    const folder = this.getProjectFolder(projectId);
    const doc = this.readJsonSafe(path.join(folder, 'review-log.json')) || { entries: [] };

    const newEntry = {
      entryId: `rev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      pageId: entry.pageId || 'global',
      versionId: entry.versionId || null,
      userVerdict: entry.verdict || 'approved',
      userInstructions: typeof entry.instructions === 'string' ? entry.instructions.trim() : '',
      appliedActions: Array.isArray(entry.actions) ? entry.actions : [entry.actions].filter(Boolean),
      resultingVersionId: null,
    };

    doc.entries.push(newEntry);
    validateReviewLog(doc);
    this.writeJsonAtomic(path.join(folder, 'review-log.json'), doc);

    // Also mirror to SQLite reviews table and activity_log
    const db = this.getDb();
    if (db) {
      try {
        db.prepare(`
          INSERT INTO reviews (project_id, page_id, verdict, feedback, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))
        `).run(projectId, null, newEntry.userVerdict, newEntry.userInstructions);

        db.prepare("INSERT INTO activity_log (project_id, message, created_at) VALUES (?, ?, datetime('now'))")
          .run(projectId, `Review logged for page "${newEntry.pageId}": ${newEntry.userVerdict}`);
      } catch (_) {}
    }
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Review logged for project "${projectId}" [${newEntry.userVerdict}]`);
    return newEntry;
  }

  // ==============================================================================
  // ARCHITECTURAL DECISIONS (Mandatory Scope Tracking)
  // ==============================================================================

  /**
   * Appends an architectural decision to decisions.json.
   * @param {string|number} projectId
   * @param {{ decision: string, reason?: string, scope: 'global'|'page'|'component' }} entry
   */
  async logDecision(projectId, entry = {}) {
    const folder = this.getProjectFolder(projectId);
    const doc = this.readJsonSafe(path.join(folder, 'decisions.json')) || { entries: [] };

    const newEntry = {
      timestamp: new Date().toISOString(),
      decision: String(entry.decision || '').trim(),
      reason: String(entry.reason || '').trim(),
      scope: entry.scope || 'global',
    };

    doc.entries.push(newEntry);
    validateDecisions(doc);
    this.writeJsonAtomic(path.join(folder, 'decisions.json'), doc);
    this.touchProject(projectId);

    console.log(`[KnowledgeStore] Decision logged for project "${projectId}" [Scope: ${newEntry.scope}]: "${newEntry.decision}"`);
    return newEntry;
  }

  // ==============================================================================
  // GENERIC QUERY
  // ==============================================================================

  /**
   * Queries any document type by name.
   * @param {string|number} projectId
   * @param {'brief'|'seed'|'tokens'|'pages'|'review-log'|'decisions'|'assets'} documentType
   */
  async query(projectId, documentType) {
    const folder = this.getProjectFolder(projectId);
    let fileName;

    switch (documentType) {
      case 'brief':
        fileName = 'brief.json';
        break;
      case 'seed':
      case 'design-seed':
        fileName = 'design-seed.json';
        break;
      case 'tokens':
      case 'design-tokens':
        fileName = 'design-tokens.json';
        break;
      case 'pages':
        fileName = 'pages.json';
        break;
      case 'review-log':
      case 'reviewLog':
        fileName = 'review-log.json';
        break;
      case 'decisions':
        fileName = 'decisions.json';
        break;
      case 'assets':
        fileName = 'assets.json';
        break;
      default:
        throw new Error(`Unsupported document query type "${documentType}"`);
    }

    const doc = this.readJsonSafe(path.join(folder, fileName));
    if (!doc) {
      throw new Error(`Document "${fileName}" not found in project ${projectId}`);
    }
    return doc;
  }

  // ==============================================================================
  // EXPORT & IMPORT (ZIP Bundles)
  // ==============================================================================

  /**
   * Zips the project folder to target destination.
   * @param {string|number} projectId
   * @param {string} targetZipPath
   * @returns {Promise<{ zipPath: string, size: number }>}
   */
  async exportProject(projectId, targetZipPath) {
    const folder = this.getProjectFolder(projectId);
    if (!fs.existsSync(folder)) {
      throw new Error(`Project folder does not exist for project: ${projectId}`);
    }

    const zip = new AdmZip();
    zip.addLocalFolder(folder);
    zip.writeZip(targetZipPath);

    const stats = fs.statSync(targetZipPath);
    console.log(`[KnowledgeStore] Exported project "${projectId}" to ${targetZipPath} (${stats.size} bytes)`);

    return {
      zipPath: targetZipPath,
      size: stats.size,
    };
  }

  /**
   * Imports a project from an exported zip file.
   * @param {string} zipPath
   * @returns {Promise<object>}
   */
  async importProject(zipPath) {
    if (!fs.existsSync(zipPath)) {
      throw new Error(`Zip archive not found at: ${zipPath}`);
    }

    const zip = new AdmZip(zipPath);
    const tempExtractDir = path.join(this.getProjectsDir(), `temp_import_${Date.now()}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });

    try {
      zip.extractAllTo(tempExtractDir, true);

      // Verify brief.json exists
      const briefPath = path.join(tempExtractDir, 'brief.json');
      const brief = this.readJsonSafe(briefPath);
      if (!brief) {
        throw new Error('Invalid project bundle: brief.json not found inside zip.');
      }
      validateBrief(brief);

      const db = this.getDb();
      let newProjectId;
      let newFolderPath;

      if (db) {
        const stmt = db.prepare(`
          INSERT INTO projects (name, type, project_type, description, status, folder_path, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'draft', '', datetime('now'), datetime('now'))
        `);
        const info = stmt.run(brief.projectName, brief.projectType, brief.projectType, brief.userRequirements || '');
        newProjectId = String(info.lastInsertRowid);
        newFolderPath = this.getProjectFolder(newProjectId);
        db.prepare('UPDATE projects SET folder_path = ? WHERE id = ?').run(newFolderPath, newProjectId);
      } else {
        newProjectId = `proj-${Date.now()}`;
        newFolderPath = this.getProjectFolder(newProjectId);
      }

      // Move extracted files to target directory
      if (fs.existsSync(newFolderPath)) {
        fs.rmSync(newFolderPath, { recursive: true, force: true });
      }
      fs.mkdirSync(newFolderPath, { recursive: true });

      const files = fs.readdirSync(tempExtractDir);
      for (const file of files) {
        const src = path.join(tempExtractDir, file);
        const dest = path.join(newFolderPath, file);
        fs.copyFileSync(src, dest);
      }

      console.log(`[KnowledgeStore] Project imported successfully as ID ${newProjectId}`);
      return await this.getProject(newProjectId);
    } finally {
      // Clean up temp folder
      try {
        if (fs.existsSync(tempExtractDir)) {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  }

  // ==============================================================================
  // DELETE PROJECT
  // ==============================================================================

  /**
   * Deletes a project, its folder, and cascades in SQLite.
   * @param {string|number} projectId
   * @param {boolean} confirm
   */
  async deleteProject(projectId, confirm = false) {
    if (!confirm) {
      throw new Error('Confirmation required: confirm flag must be true to delete project.');
    }

    const folder = this.getProjectFolder(projectId);
    if (fs.existsSync(folder)) {
      try {
        fs.rmSync(folder, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[KnowledgeStore] Could not delete folder ${folder}:`, err.message);
      }
    }

    const db = this.getDb();
    if (db) {
      const tx = db.transaction(() => {
        db.prepare('DELETE FROM pages WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM design_seeds WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM design_tokens WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM reviews WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM activity_log WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
      });
      tx();
    }

    console.log(`[KnowledgeStore] Project "${projectId}" deleted completely.`);
    return { success: true, id: projectId };
  }
}

// Export singleton instance
const knowledgeStore = new KnowledgeStore();

module.exports = {
  KnowledgeStore,
  knowledgeStore,
};
