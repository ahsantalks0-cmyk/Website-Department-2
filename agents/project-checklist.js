/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PROJECT CHECKLIST TRACKER (agents/project-checklist.js)
 * ==============================================================================
 * Manages the canonical checklist.json inside each project folder.
 * Ensures the department NEVER claims a project is complete while items remain.
 *
 * Provides:
 * - initChecklist(projectId, pages, options)
 * - getChecklist(projectId)
 * - getMissingItems(projectId)
 * - markDone(projectId, itemKeyOrText)
 * - markUndone(projectId, itemKeyOrText)
 * - addItem(projectId, text, category)
 * - removeItem(projectId, itemKeyOrText)
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
let electronApp = null;

if (process.versions && process.versions.electron) {
  try {
    const electron = require('electron');
    electronApp = electron?.app || null;
  } catch (_) {}
}

class ProjectChecklist {
  /**
   * @param {object} [options]
   * @param {string} [options.baseDir]
   */
  constructor(options = {}) {
    this.customBaseDir = options.baseDir || null;
  }

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
    const dir = path.join(userData, 'projects');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getProjectFolder(projectId) {
    return path.join(this.getProjectsDir(), String(projectId));
  }

  getChecklistFilePath(projectId) {
    return path.join(this.getProjectFolder(projectId), 'checklist.json');
  }

  /**
   * Performs an atomic write for checklist.json.
   * @param {string} filePath
   * @param {object} data
   */
  atomicWriteJson(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  }

  /**
   * Initializes or refreshes standard checklist items for a project.
   * @param {number|string} projectId
   * @param {Array<string>} [pages]
   * @param {object} [options]
   * @returns {object}
   */
  initChecklist(projectId, pages = ['Home'], options = {}) {
    const existing = this.getChecklist(projectId);
    if (existing && Array.isArray(existing.items) && existing.items.length > 0) {
      return existing;
    }

    const items = [
      { id: 'design-system', text: 'Design system & token definition', done: true, category: 'architecture' },
    ];

    (pages || ['Home']).forEach((p, idx) => {
      items.push({
        id: `page-design-${idx + 1}`,
        text: `Generate layout & code for ${p} page`,
        done: false,
        category: 'pages',
      });
      items.push({
        id: `page-review-${idx + 1}`,
        text: `User review & approval of ${p} page`,
        done: false,
        category: 'reviews',
      });
    });

    if (options.techStack?.includes('supabase') || options.databaseTiming === 'now') {
      items.push({ id: 'database-setup', text: 'Database schema & Supabase setup', done: false, category: 'backend' });
    } else if (options.databaseTiming === 'after-design') {
      items.push({ id: 'database-setup', text: 'Database setup (deferred until UI approval)', done: false, category: 'backend' });
    }

    if (options.projectType === 'saas-dashboard' || options.features?.some((f) => /admin/i.test(f))) {
      items.push({ id: 'admin-panel', text: 'Admin management panel', done: false, category: 'features' });
    }

    items.push({ id: 'seo-meta', text: 'SEO metadata & open graph tags', done: false, category: 'optimization' });
    items.push({ id: 'final-qa', text: 'Cross-device QA & accessibility validation', done: false, category: 'qa' });

    const checklistData = {
      projectId,
      updatedAt: new Date().toISOString(),
      items,
    };

    const filePath = this.getChecklistFilePath(projectId);
    this.atomicWriteJson(filePath, checklistData);
    console.log(`[ProjectChecklist] Initialized ${items.length} checklist items for project ${projectId}`);
    return checklistData;
  }

  /**
   * Retrieves the project checklist.
   * @param {number|string} projectId
   * @returns {object|null}
   */
  getChecklist(projectId) {
    const filePath = this.getChecklistFilePath(projectId);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[ProjectChecklist] Failed to read checklist for project ${projectId}:`, err.message);
      return null;
    }
  }

  /**
   * Returns list of human-readable text strings for items that are not yet done.
   * @param {number|string} projectId
   * @returns {string[]}
   */
  getMissingItems(projectId) {
    const data = this.getChecklist(projectId);
    if (!data || !Array.isArray(data.items)) {
      return [];
    }
    return data.items
      .filter((item) => !item.done)
      .map((item) => item.text);
  }

  /**
   * Marks an item as done.
   * @param {number|string} projectId
   * @param {string} itemKeyOrText
   * @returns {boolean}
   */
  markDone(projectId, itemKeyOrText) {
    const data = this.getChecklist(projectId);
    if (!data || !Array.isArray(data.items)) return false;

    let matched = false;
    data.items.forEach((item) => {
      if (item.id === itemKeyOrText || item.text.toLowerCase() === itemKeyOrText.toLowerCase()) {
        item.done = true;
        item.completedAt = new Date().toISOString();
        matched = true;
      }
    });

    if (matched) {
      data.updatedAt = new Date().toISOString();
      this.atomicWriteJson(this.getChecklistFilePath(projectId), data);
      console.log(`[ProjectChecklist] Marked "${itemKeyOrText}" as done for project ${projectId}`);
    }
    return matched;
  }

  /**
   * Marks an item as undone.
   * @param {number|string} projectId
   * @param {string} itemKeyOrText
   * @returns {boolean}
   */
  markUndone(projectId, itemKeyOrText) {
    const data = this.getChecklist(projectId);
    if (!data || !Array.isArray(data.items)) return false;

    let matched = false;
    data.items.forEach((item) => {
      if (item.id === itemKeyOrText || item.text.toLowerCase() === itemKeyOrText.toLowerCase()) {
        item.done = false;
        delete item.completedAt;
        matched = true;
      }
    });

    if (matched) {
      data.updatedAt = new Date().toISOString();
      this.atomicWriteJson(this.getChecklistFilePath(projectId), data);
    }
    return matched;
  }

  /**
   * Adds a custom item to the checklist.
   * @param {number|string} projectId
   * @param {string} text
   * @param {string} [category]
   * @returns {object}
   */
  addItem(projectId, text, category = 'custom') {
    let data = this.getChecklist(projectId);
    if (!data) {
      data = this.initChecklist(projectId, ['Home']);
    }

    const id = `item-${Date.now()}`;
    const newItem = {
      id,
      text: text.trim(),
      done: false,
      category,
      createdAt: new Date().toISOString(),
    };

    data.items.push(newItem);
    data.updatedAt = new Date().toISOString();
    this.atomicWriteJson(this.getChecklistFilePath(projectId), data);
    return newItem;
  }

  /**
   * Removes an item from the checklist.
   * @param {number|string} projectId
   * @param {string} itemKeyOrText
   * @returns {boolean}
   */
  removeItem(projectId, itemKeyOrText) {
    const data = this.getChecklist(projectId);
    if (!data || !Array.isArray(data.items)) return false;

    const initialLen = data.items.length;
    data.items = data.items.filter(
      (item) => item.id !== itemKeyOrText && item.text.toLowerCase() !== itemKeyOrText.toLowerCase()
    );

    if (data.items.length !== initialLen) {
      data.updatedAt = new Date().toISOString();
      this.atomicWriteJson(this.getChecklistFilePath(projectId), data);
      return true;
    }
    return false;
  }
}

const projectChecklist = new ProjectChecklist();

module.exports = {
  ProjectChecklist,
  projectChecklist,
};
