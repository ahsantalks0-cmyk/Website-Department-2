/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — STORE SCHEMA & VALIDATION (core/store-schema.js)
 * ==============================================================================
 * Defines canonical schemas, strict input validation, and initial factory templates
 * for Phase 5 Knowledge Store documents. Every document written to disk is validated
 * to guarantee corruption-free persistent state for all downstream agent pipelines.
 * ==============================================================================
 */

const VALID_PROJECT_TYPES = ['website', 'ui-only', 'saas-dashboard', 'custom'];
const VALID_PAGE_STATUSES = ['pending', 'designing', 'in_review', 'approved', 'rejected', 'redesigning'];
const VALID_VERDICTS = ['approved', 'rejected', 'change_requested'];
const VALID_DECISION_SCOPES = ['global', 'page', 'component'];

/**
 * Normalizes project type string to canonical hyphenated format.
 * @param {string} type
 * @returns {string}
 */
function normalizeProjectType(type) {
  if (!type) return 'website';
  const str = String(type).trim().toLowerCase().replace(/_/g, '-');
  return VALID_PROJECT_TYPES.includes(str) ? str : 'website';
}

/**
 * Validates brief.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validateBrief(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('brief.json: document must be an object');
  }

  if (!data.projectName || typeof data.projectName !== 'string' || !data.projectName.trim()) {
    throw new Error('brief.json: projectName is required and cannot be empty');
  }

  const normType = normalizeProjectType(data.projectType);
  if (!VALID_PROJECT_TYPES.includes(normType)) {
    throw new Error(`brief.json: projectType must be one of: ${VALID_PROJECT_TYPES.join(', ')}`);
  }

  if (data.userRequirements !== undefined && typeof data.userRequirements !== 'string') {
    throw new Error('brief.json: userRequirements must be a string');
  }

  if (data.interpretedRequirements) {
    if (typeof data.interpretedRequirements !== 'object' || Array.isArray(data.interpretedRequirements)) {
      throw new Error('brief.json: interpretedRequirements must be an object');
    }
    const req = data.interpretedRequirements;
    if (req.pages !== undefined && !Array.isArray(req.pages)) {
      throw new Error('brief.json: interpretedRequirements.pages must be an array');
    }
    if (req.features !== undefined && !Array.isArray(req.features)) {
      throw new Error('brief.json: interpretedRequirements.features must be an array');
    }
    if (req.styleHints !== undefined && !Array.isArray(req.styleHints)) {
      throw new Error('brief.json: interpretedRequirements.styleHints must be an array');
    }
  }

  return true;
}

/**
 * Validates design-seed.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validateDesignSeed(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('design-seed.json: document must be an object');
  }

  if (!data.seedId || typeof data.seedId !== 'string') {
    throw new Error('design-seed.json: seedId is required and must be a string');
  }

  if (!data.axes || typeof data.axes !== 'object' || Array.isArray(data.axes)) {
    throw new Error('design-seed.json: axes must be an object');
  }

  if (data.previousSeeds !== undefined && !Array.isArray(data.previousSeeds)) {
    throw new Error('design-seed.json: previousSeeds must be an array of seed IDs');
  }

  return true;
}

/**
 * Validates design-tokens.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validateDesignTokens(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('design-tokens.json: document must be an object');
  }

  if (!data.colors || typeof data.colors !== 'object' || Array.isArray(data.colors)) {
    throw new Error('design-tokens.json: colors object is required');
  }

  if (!data.colors.primary || typeof data.colors.primary !== 'string' || !data.colors.primary.trim()) {
    throw new Error('design-tokens.json: colors.primary is required');
  }

  if (!data.typography || typeof data.typography !== 'object') {
    throw new Error('design-tokens.json: typography object is required');
  }

  if (!data.spacing || typeof data.spacing !== 'object') {
    throw new Error('design-tokens.json: spacing object is required');
  }

  if (!data.radius || typeof data.radius !== 'object') {
    throw new Error('design-tokens.json: radius object is required');
  }

  if (typeof data.version !== 'number' || data.version < 1) {
    throw new Error('design-tokens.json: version must be a positive number');
  }

  if (data.versions !== undefined && !Array.isArray(data.versions)) {
    throw new Error('design-tokens.json: versions must be an array');
  }

  return true;
}

/**
 * Validates pages.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validatePages(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('pages.json: document must be an object');
  }

  if (!Array.isArray(data.pages)) {
    throw new Error('pages.json: pages must be an array');
  }

  const seenIds = new Set();
  for (let i = 0; i < data.pages.length; i++) {
    const p = data.pages[i];
    if (!p || typeof p !== 'object') {
      throw new Error(`pages.json: page at index ${i} must be an object`);
    }

    if (!p.pageId || typeof p.pageId !== 'string') {
      throw new Error(`pages.json: page at index ${i} requires a valid pageId`);
    }

    if (seenIds.has(p.pageId)) {
      throw new Error(`pages.json: duplicate pageId "${p.pageId}"`);
    }
    seenIds.add(p.pageId);

    if (!p.name || typeof p.name !== 'string' || !p.name.trim()) {
      throw new Error(`pages.json: page "${p.pageId}" requires a non-empty name`);
    }

    const status = p.status || 'pending';
    if (!VALID_PAGE_STATUSES.includes(status)) {
      throw new Error(`pages.json: invalid status "${p.status}" for page "${p.name}". Must be one of: ${VALID_PAGE_STATUSES.join(', ')}`);
    }
  }

  return true;
}

/**
 * Validates review-log.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validateReviewLog(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('review-log.json: document must be an object');
  }

  if (!Array.isArray(data.entries)) {
    throw new Error('review-log.json: entries must be an array');
  }

  for (let i = 0; i < data.entries.length; i++) {
    const e = data.entries[i];
    if (!e || typeof e !== 'object') {
      throw new Error(`review-log.json: entry at index ${i} must be an object`);
    }

    if (!e.entryId || typeof e.entryId !== 'string') {
      throw new Error(`review-log.json: entry at index ${i} requires entryId`);
    }

    if (!e.pageId || typeof e.pageId !== 'string') {
      throw new Error(`review-log.json: entry "${e.entryId}" requires pageId`);
    }

    if (!e.userVerdict || !VALID_VERDICTS.includes(e.userVerdict)) {
      throw new Error(`review-log.json: userVerdict must be one of: ${VALID_VERDICTS.join(', ')}`);
    }

    if (e.appliedActions !== undefined && !Array.isArray(e.appliedActions)) {
      throw new Error(`review-log.json: entry "${e.entryId}" appliedActions must be an array`);
    }
  }

  return true;
}

/**
 * Validates decisions.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validateDecisions(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('decisions.json: document must be an object');
  }

  if (!Array.isArray(data.entries)) {
    throw new Error('decisions.json: entries must be an array');
  }

  for (let i = 0; i < data.entries.length; i++) {
    const d = data.entries[i];
    if (!d || typeof d !== 'object') {
      throw new Error(`decisions.json: entry at index ${i} must be an object`);
    }

    if (!d.decision || typeof d.decision !== 'string' || !d.decision.trim()) {
      throw new Error(`decisions.json: entry at index ${i} requires decision text`);
    }

    if (!d.scope || !VALID_DECISION_SCOPES.includes(d.scope)) {
      throw new Error(`decisions.json: scope must be one of: ${VALID_DECISION_SCOPES.join(', ')}`);
    }
  }

  return true;
}

/**
 * Validates assets.json structure.
 * @param {any} data
 * @throws {Error} Clear schema validation error
 */
function validateAssets(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('assets.json: document must be an object');
  }

  if (!Array.isArray(data.assets)) {
    throw new Error('assets.json: assets must be an array');
  }

  return true;
}

/**
 * Generic document validator dispatcher.
 * @param {string} docType
 * @param {any} data
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDocument(docType, data) {
  try {
    switch (docType) {
      case 'brief':
      case 'brief.json':
        validateBrief(data);
        break;
      case 'design-seed':
      case 'seed':
      case 'design-seed.json':
        validateDesignSeed(data);
        break;
      case 'design-tokens':
      case 'tokens':
      case 'design-tokens.json':
        validateDesignTokens(data);
        break;
      case 'pages':
      case 'pages.json':
        validatePages(data);
        break;
      case 'review-log':
      case 'reviewLog':
      case 'review-log.json':
        validateReviewLog(data);
        break;
      case 'decisions':
      case 'decisions.json':
        validateDecisions(data);
        break;
      case 'assets':
      case 'assets.json':
        validateAssets(data);
        break;
      default:
        throw new Error(`Unknown document type "${docType}"`);
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// ==============================================================================
// FACTORY CREATORS FOR INITIAL PROJECT KNOWLEDGE STORE
// ==============================================================================

/**
 * Creates default brief document.
 * @param {{ name: string, type?: string, description?: string, pages?: string[] }} opts
 */
function createDefaultBrief(opts = {}) {
  const now = new Date().toISOString();
  const normType = normalizeProjectType(opts.type);
  const pageNames = Array.isArray(opts.pages) && opts.pages.length > 0
    ? opts.pages.map((p) => String(p).trim()).filter(Boolean)
    : ['Home'];

  return {
    projectName: String(opts.name || 'Untitled Project').trim(),
    projectType: normType,
    userRequirements: typeof opts.description === 'string' ? opts.description.trim() : '',
    interpretedRequirements: {
      goal: `Build a modern, production-ready ${normType.replace('-', ' ')} with Apple-inspired craftsmanship.`,
      audience: 'Modern web users requiring fast, intuitive digital experiences.',
      pages: pageNames,
      features: ['Responsive layout', 'Dark/light theme support', 'Fluid typography'],
      styleHints: ['Outfit font pairing', 'Generous whitespace', 'High contrast aesthetics'],
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Creates default empty design seed placeholder.
 * @param {string} [seedId]
 */
function createDefaultSeed(seedId) {
  const id = seedId || `seed-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  return {
    seedId: id,
    generatedAt: new Date().toISOString(),
    axes: {
      layout: 'Single-tier structured bento grid with asymmetric hero focal points',
      typography: 'Outfit display heading paired with clean neutral system sans body',
      colorDirection: 'High-contrast monochromatic base with subtle vibrant cobalt blue accents',
      density: 'Spacious, breathable padding ratio with minimum 16px unit padding',
      motion: 'Subtle ease-out entrance transitions (0.2s cubic-bezier)',
      shapeLanguage: 'Rounded container geometry (12px outer radius, 8px inner)',
      imageryStyle: 'Crisp vector typography and geometric UI mockups',
      depth: 'Flat surface elevation with refined 1px translucent borders and hairline dividers',
      signatureElement: 'Interactive status indicators and floating action headers',
    },
    previousSeeds: [],
    notes: 'Initial seed foundation generated by Project Knowledge Store engine.',
  };
}

/**
 * Creates default design tokens document with full initial version entry.
 */
function createDefaultTokens() {
  const now = new Date().toISOString();
  const initialTokens = {
    colors: {
      primary: '#0071E3',
      secondary: '#5E5CE6',
      accent: '#0A84FF',
      background: '#FAFAFA',
      surface: '#FFFFFF',
      text: '#1D1D1F',
      muted: '#86868B',
      border: '#E5E5EA',
    },
    typography: {
      displayFont: 'Outfit, -apple-system, BlinkMacSystemFont, sans-serif',
      bodyFont: 'Outfit, -apple-system, BlinkMacSystemFont, sans-serif',
      scale: {
        h1: '32px',
        h2: '24px',
        h3: '18px',
        body: '14px',
        small: '12px',
      },
    },
    spacing: {
      xs: '4px',
      sm: '8px',
      md: '16px',
      lg: '24px',
      xl: '32px',
    },
    radius: {
      sm: '6px',
      md: '10px',
      lg: '14px',
    },
    shadows: {
      subtle: '0 1px 3px rgba(0,0,0,0.04)',
      elevated: '0 8px 24px rgba(0,0,0,0.08)',
    },
    motion: {
      duration: '0.2s',
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    },
  };

  return {
    ...initialTokens,
    version: 1,
    updatedAt: now,
    versions: [
      {
        version: 1,
        timestamp: now,
        reason: 'Initial token generation on project creation',
        tokens: { ...initialTokens },
      },
    ],
  };
}

/**
 * Creates default pages document from initial page names list.
 * @param {string[]} [pageNames]
 */
function createDefaultPages(pageNames = []) {
  const names = Array.isArray(pageNames) && pageNames.length > 0
    ? pageNames.map((n) => String(n).trim()).filter(Boolean)
    : ['Home'];

  const pages = names.map((name, index) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'page';
    return {
      pageId: `page-${slug}-${index + 1}`,
      name,
      order: index,
      status: 'pending',
      currentDesignRef: null,
      versionHistory: [],
      approvedAt: null,
    };
  });

  return {
    pages,
  };
}

/**
 * Creates default review-log document.
 */
function createDefaultReviewLog() {
  return {
    entries: [],
  };
}

/**
 * Creates default decisions document.
 */
function createDefaultDecisions() {
  return {
    entries: [
      {
        timestamp: new Date().toISOString(),
        decision: 'Initialize project knowledge store baseline architecture',
        reason: 'Initial setup of project document specifications',
        scope: 'global',
      },
    ],
  };
}

/**
 * Creates default assets document.
 */
function createDefaultAssets() {
  return {
    assets: [],
  };
}

module.exports = {
  VALID_PROJECT_TYPES,
  VALID_PAGE_STATUSES,
  VALID_VERDICTS,
  VALID_DECISION_SCOPES,
  normalizeProjectType,
  validateBrief,
  validateDesignSeed,
  validateDesignTokens,
  validatePages,
  validateReviewLog,
  validateDecisions,
  validateAssets,
  validateDocument,
  createDefaultBrief,
  createDefaultSeed,
  createDefaultTokens,
  createDefaultPages,
  createDefaultReviewLog,
  createDefaultDecisions,
  createDefaultAssets,
};
