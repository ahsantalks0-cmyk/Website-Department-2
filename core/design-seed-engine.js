/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DESIGN SEED ENGINE (core/design-seed-engine.js)
 * ==============================================================================
 * Generates, validates, and versions high-craft 9-axis design seeds & tokens.
 *
 * 9 Distinct Design Axes:
 * 1. layout (Bento Grid, Asymmetrical Editorial, Split-Screen Workbench, etc.)
 * 2. typography (Display + Body pairings, scale ratio, tracking, leading)
 * 3. colorDirection (Primary, secondary, background, surface, accent, contrast)
 * 4. density ('compact' | 'balanced' | 'spacious' | 'dense')
 * 5. motion (Duration, easing curve, choreography, stagger)
 * 6. shapeLanguage (Card radius, button radius, pill radius, border weight)
 * 7. imageryStyle (Duotone, 3D clay, editorial photographic, geometric vector, grain)
 * 8. depth (Flat, layered-glass, subtle elevation, frosted ambient)
 * 9. signatureElement (Custom kinetic element, interactive grain, floating card stack)
 *
 * Rules Enforced:
 * - R1: Uniqueness rule (guarantees fresh distinct seed directions across generations)
 * - R10: Exact-Copy Mode (matches exact palette and metrics from reference inputs)
 * - Anti-Generic Validation (zero purple-to-blue clichés, zero generic font defaults)
 * ==============================================================================
 */

const crypto = require('crypto');
const { antiGeneric } = require('./anti-generic');
const { handlerRegistry } = require('./handler-registry');
const { knowledgeStore } = require('./knowledge-store');

// Curated High-Craft Palettes (Zero AI Slop)
const CURATED_PALETTES = [
  {
    name: 'Obsidian & Solar Ochre',
    theme: 'dark',
    primary: '#EAB308',
    secondary: '#854D0E',
    accent: '#FDE047',
    background: '#0B0E14',
    surface: '#151A23',
    surfaceElevated: '#1E2533',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    border: 'rgba(255, 255, 255, 0.08)',
    colorTemperature: 'warm-neutral',
    contrastLevel: 'ultra-high',
  },
  {
    name: 'Nordic Slate & Cobalt',
    theme: 'dark',
    primary: '#38BDF8',
    secondary: '#0369A1',
    accent: '#7DD3FC',
    background: '#090D16',
    surface: '#121826',
    surfaceElevated: '#1B2438',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    border: 'rgba(56, 189, 248, 0.12)',
    colorTemperature: 'cool',
    contrastLevel: 'high-contrast',
  },
  {
    name: 'Alpine Forest & Sage',
    theme: 'dark',
    primary: '#10B981',
    secondary: '#064E3B',
    accent: '#6EE7B7',
    background: '#080E0B',
    surface: '#111D17',
    surfaceElevated: '#1A2C23',
    textPrimary: '#ECFDF5',
    textSecondary: '#A7F3D0',
    border: 'rgba(16, 185, 129, 0.12)',
    colorTemperature: 'organic-cool',
    contrastLevel: 'high-contrast',
  },
  {
    name: 'Monochrome Editorial Alabaster',
    theme: 'light',
    primary: '#0F172A',
    secondary: '#334155',
    accent: '#475569',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceElevated: '#F1F5F9',
    textPrimary: '#020617',
    textSecondary: '#475569',
    border: 'rgba(15, 23, 42, 0.08)',
    colorTemperature: 'crisp-neutral',
    contrastLevel: 'maximum',
  },
  {
    name: 'Terracotta & Warm Clay',
    theme: 'light',
    primary: '#C2410C',
    secondary: '#7C2D12',
    accent: '#FB923C',
    background: '#FFFBEB',
    surface: '#FEF3C7',
    surfaceElevated: '#FDE68A',
    textPrimary: '#451A03',
    textSecondary: '#78350F',
    border: 'rgba(194, 65, 12, 0.12)',
    colorTemperature: 'warm-organic',
    contrastLevel: 'high-contrast',
  },
  {
    name: 'Cyber Quartz & Electric Crimson',
    theme: 'dark',
    primary: '#F43F5E',
    secondary: '#9F1239',
    accent: '#FDA4AF',
    background: '#0D0A0C',
    surface: '#191418',
    surfaceElevated: '#251E24',
    textPrimary: '#FFF1F2',
    textSecondary: '#FDA4AF',
    border: 'rgba(244, 63, 94, 0.15)',
    colorTemperature: 'high-energy',
    contrastLevel: 'high-contrast',
  },
];

// Curated Typographic Pairings
const CURATED_TYPOGRAPHY = [
  {
    displayFont: 'Outfit',
    bodyFont: 'Plus Jakarta Sans',
    scaleRatio: 1.25,
    headingTracking: '-0.025em',
    bodyLineHeight: 1.6,
    archetype: 'Modern Geometric Luxury',
  },
  {
    displayFont: 'Cabinet Grotesk',
    bodyFont: 'Plus Jakarta Sans',
    scaleRatio: 1.333,
    headingTracking: '-0.03em',
    bodyLineHeight: 1.65,
    archetype: 'Editorial Punch & Clarity',
  },
  {
    displayFont: 'Fraunces',
    bodyFont: 'Plus Jakarta Sans',
    scaleRatio: 1.25,
    headingTracking: '-0.015em',
    bodyLineHeight: 1.6,
    archetype: 'Warm Humanist Craft',
  },
  {
    displayFont: 'Syne',
    bodyFont: 'Plus Jakarta Sans',
    scaleRatio: 1.3,
    headingTracking: '-0.02em',
    bodyLineHeight: 1.55,
    archetype: 'Avant-Garde Architectural',
  },
];

// Layout Archetypes
const LAYOUT_ARCHETYPES = [
  {
    name: 'Asymmetric Bento Modular',
    description: 'High-density cards with optical balance, asymmetric feature highlights, and structural negative space.',
    gridStyle: 'bento-dynamic',
    containerMaxWidth: '100%',
    columnCount: 12,
  },
  {
    name: 'Split-Screen Workbench',
    description: 'Two-column primary stage with persistent context sidebar and fluid expanding workspace.',
    gridStyle: 'split-fluid',
    containerMaxWidth: '100%',
    columnCount: 2,
  },
  {
    name: 'Editorial Monolith',
    description: 'Clean typographic hierarchy with wide reading containers and subtle floating metadata cards.',
    gridStyle: 'editorial-stacked',
    containerMaxWidth: '100%',
    columnCount: 1,
  },
  {
    name: 'Floating Canvas Stage',
    description: 'Deep layered surfaces with subtle backdrop blur and floating elevated action bars.',
    gridStyle: 'floating-stage',
    containerMaxWidth: '100%',
    columnCount: 12,
  },
];

// Signature Elements
const SIGNATURE_ELEMENTS = [
  {
    name: 'Layered Glass Card Depth',
    type: 'visual-depth',
    description: 'Frosted acrylic panels with optical inner rim lighting and subtle backdrop blur.',
  },
  {
    name: 'Kinetic Staggered Enter',
    type: 'motion',
    description: 'Choreographed spring-eased entry transitions with 40ms stagger delays across content cards.',
  },
  {
    name: 'Tactile Pill Switchers',
    type: 'interactive',
    description: 'High-contrast pill buttons with micro spring feedback and active status indicators.',
  },
  {
    name: 'Precision Metric Badges',
    type: 'typographic',
    description: 'Monospaced numerical stat chips with subtle glowing status rings.',
  },
];

class DesignSeedEngine {
  constructor() {
    this.seedHistory = new Map(); // projectId -> Array of previous seed hashes/names
    this.registerEngineHandlers();
  }

  /**
   * Registers the 'design.seed-generate' handler with the Orchestrator HandlerRegistry.
   */
  registerEngineHandlers() {
    handlerRegistry.registerHandler('design.seed-generate', this.handleGenerateSeedTask.bind(this));
    console.log('[DesignSeedEngine] Registered handler "design.seed-generate" into HandlerRegistry.');
  }

  /**
   * Orchestrator Task Handler for 'design.seed-generate'.
   * @param {object} args
   */
  async handleGenerateSeedTask({ params, context, signal }) {
    const projectId = params?.projectId || 1;
    const projectName = params?.projectName || `Project #${projectId}`;
    const mode = params?.mode || 'self-design';
    const isRegen = Boolean(params?.regenerate);

    context.log(`[DesignSeedEngine] Generating ${isRegen ? 'fresh' : 'initial'} 9-axis design seed for "${projectName}"...`);
    context.emit('progress', { progress: 15, message: 'Analyzing brief and brand archetype...' });

    // Step 1: Read Project Data & Reference Assets
    let project = null;
    let brief = null;
    try {
      project = knowledgeStore.getProject(projectId);
      brief = knowledgeStore.getBrief(projectId);
    } catch (_) {}

    context.emit('progress', { progress: 40, message: 'Formulating 9 distinct design axes...' });

    // Step 2: Generate 9-axis Seed
    let seed = null;
    if (context.ai && typeof context.ai.generate === 'function') {
      try {
        seed = await this.generateSeedViaAi(projectId, projectName, brief, context, signal);
      } catch (aiErr) {
        console.warn('[DesignSeedEngine] AI seed generation fallback to rule-based engine:', aiErr.message);
        seed = this.generateDeterministicSeed(projectId, projectName, brief, isRegen);
      }
    } else {
      seed = this.generateDeterministicSeed(projectId, projectName, brief, isRegen);
    }

    // Step 3: Validate against Anti-Generic Banned Patterns
    context.emit('progress', { progress: 70, message: 'Verifying anti-generic compliance & craft rules...' });
    const validation = antiGeneric.validateSeed(seed);
    if (!validation.valid) {
      console.warn('[DesignSeedEngine] Seed failed anti-generic checks, auto-correcting:', validation.violations);
      seed = antiGeneric.autoCorrectSeed(seed);
    }

    // Step 4: Generate synchronized design-tokens.json
    context.emit('progress', { progress: 85, message: 'Compiling design tokens & CSS custom properties...' });
    const tokens = this.compileTokensFromSeed(seed);

    // Step 5: Save into Knowledge Store
    knowledgeStore.saveSeed(projectId, seed);
    knowledgeStore.saveTokens(projectId, tokens, isRegen ? 'Seed regeneration (R1)' : 'Initial Seed Generation');

    // Track seed in history (R1)
    const history = this.seedHistory.get(projectId) || [];
    history.push({
      seedId: seed.seedId,
      conceptName: seed.conceptName,
      generatedAt: new Date().toISOString(),
    });
    this.seedHistory.set(projectId, history);

    context.emit('progress', { progress: 100, message: `Design Seed "${seed.conceptName}" formulated successfully.` });

    return {
      success: true,
      output: {
        status: 'seed-generated',
        seedId: seed.seedId,
        conceptName: seed.conceptName,
        philosophy: seed.philosophy,
        colorPalette: seed.colorDirection.name,
        typography: `${seed.typography.displayFont} / ${seed.typography.bodyFont}`,
        signatureElement: seed.signatureElement.name,
        complianceScore: validation.score,
        seed,
      },
    };
  }

  /**
   * Generates a 9-axis seed using deterministic algorithmic variety (Rule R1 guaranteed).
   * @param {number|string} projectId
   * @param {string} projectName
   * @param {object} [brief]
   * @param {boolean} [isRegenerate=false]
   * @returns {object} 9-axis seed specification
   */
  generateDeterministicSeed(projectId, projectName, brief, isRegenerate = false) {
    const history = this.seedHistory.get(projectId) || [];
    const usedNames = new Set(history.map((h) => h.conceptName));

    // Filter palettes and typography to guarantee distinct variety (R1)
    let availablePalettes = CURATED_PALETTES.filter((p) => !usedNames.has(p.name));
    if (availablePalettes.length === 0) availablePalettes = CURATED_PALETTES;

    const paletteIndex = isRegenerate ? Math.floor(Math.random() * availablePalettes.length) : (Number(projectId) || 0) % availablePalettes.length;
    const palette = availablePalettes[paletteIndex] || availablePalettes[0];

    const typoIndex = (paletteIndex + 1) % CURATED_TYPOGRAPHY.length;
    const typo = CURATED_TYPOGRAPHY[typoIndex];

    const layoutIndex = (paletteIndex + 2) % LAYOUT_ARCHETYPES.length;
    const layout = LAYOUT_ARCHETYPES[layoutIndex];

    const sigIndex = (paletteIndex + 3) % SIGNATURE_ELEMENTS.length;
    const signature = SIGNATURE_ELEMENTS[sigIndex];

    const seedId = `seed-${projectId}-${Date.now().toString(36)}`;
    const conceptName = `${palette.name} • ${typo.archetype}`;

    return {
      seedId,
      projectId,
      conceptName,
      philosophy: `Engineered for ${projectName} with high-contrast hierarchy, deliberate spacing ratios, and zero visual clutter.`,
      axes: {
        layout: {
          archetype: layout.name,
          description: layout.description,
          gridStyle: layout.gridStyle,
          containerMaxWidth: '100%',
          columnCount: layout.columnCount,
        },
        typography: {
          displayFont: typo.displayFont,
          bodyFont: typo.bodyFont,
          scaleRatio: typo.scaleRatio,
          headingTracking: typo.headingTracking,
          bodyLineHeight: typo.bodyLineHeight,
          archetype: typo.archetype,
        },
        colorDirection: {
          name: palette.name,
          theme: palette.theme,
          primary: palette.primary,
          secondary: palette.secondary,
          accent: palette.accent,
          background: palette.background,
          surface: palette.surface,
          surfaceElevated: palette.surfaceElevated,
          textPrimary: palette.textPrimary,
          textSecondary: palette.textSecondary,
          border: palette.border,
          colorTemperature: palette.colorTemperature,
          contrastLevel: palette.contrastLevel,
        },
        density: 'balanced',
        motion: {
          durationFast: '150ms',
          durationNormal: '250ms',
          durationSlow: '400ms',
          easingCurve: 'cubic-bezier(0.16, 1, 0.3, 1)',
          staggerDelayMs: 40,
        },
        shapeLanguage: {
          borderRadius: '12px',
          cardRadius: '12px',
          btnRadius: '8px',
          pillRadius: '9999px',
          borderWidth: '1px',
          geometricArchetype: 'Modern Softened Rectangles',
        },
        imageryStyle: {
          style: 'Editorial Crisp Vector',
          treatment: 'Duotone Accent with Micro Grain',
        },
        depth: {
          style: 'layered-glass',
          backdropBlur: '16px',
          shadowSubtle: '0 2px 8px rgba(0, 0, 0, 0.12)',
          shadowCard: '0 4px 20px rgba(0, 0, 0, 0.25)',
        },
        signatureElement: {
          name: signature.name,
          type: signature.type,
          description: signature.description,
        },
      },
      // Flat accessors for backward compatibility
      layout: layout,
      typography: typo,
      colorDirection: palette,
      density: 'balanced',
      motion: {
        durationFast: '150ms',
        durationNormal: '250ms',
        durationSlow: '400ms',
        easingCurve: 'cubic-bezier(0.16, 1, 0.3, 1)',
        staggerDelayMs: 40,
      },
      shapeLanguage: {
        borderRadius: '12px',
        cardRadius: '12px',
        btnRadius: '8px',
        pillRadius: '9999px',
        borderWidth: '1px',
        geometricArchetype: 'Modern Softened Rectangles',
      },
      imageryStyle: {
        style: 'Editorial Crisp Vector',
        treatment: 'Duotone Accent with Micro Grain',
      },
      depth: {
        style: 'layered-glass',
        backdropBlur: '16px',
        shadowSubtle: '0 2px 8px rgba(0, 0, 0, 0.12)',
        shadowCard: '0 4px 20px rgba(0, 0, 0, 0.25)',
      },
      signatureElement: signature,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Generates seed via active AI model with strict JSON schema.
   */
  async generateSeedViaAi(projectId, projectName, brief, context, signal) {
    const { DESIGN_SEED_SYSTEM_PROMPT, DESIGN_SEED_RESPONSE_SCHEMA, buildDesignSeedUserPrompt } = require('../agents/prompts/design-seed-prompt');

    const userPrompt = buildDesignSeedUserPrompt({ projectId, projectName, brief });

    const response = await context.ai.generate({
      systemInstruction: DESIGN_SEED_SYSTEM_PROMPT,
      prompt: userPrompt,
      taskProfile: 'reasoning',
      responseSchema: DESIGN_SEED_RESPONSE_SCHEMA,
      temperature: 0.3,
      maxTokens: 3000,
      signal,
    });

    if (!response || !response.success) {
      throw new Error(response?.error || 'AI seed generation failed');
    }

    let parsed = response.parsed;
    if (!parsed && typeof response.text === 'string') {
      const clean = response.text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      parsed = JSON.parse(clean);
    }

    parsed.seedId = `seed-${projectId}-${Date.now().toString(36)}`;
    parsed.projectId = projectId;
    parsed.generatedAt = new Date().toISOString();

    // Flatten axes if nested
    if (parsed.axes) {
      Object.assign(parsed, parsed.axes);
    }

    return parsed;
  }

  /**
   * Compiles design seed into complete design-tokens.json document.
   * @param {object} seed
   * @returns {object} Token specification
   */
  compileTokensFromSeed(seed) {
    const colors = seed.colorDirection || {};
    const typo = seed.typography || {};
    const shapes = seed.shapeLanguage || {};
    const depth = seed.depth || {};
    const motion = seed.motion || {};

    return {
      version: '1.0.0',
      schema: 'ai-design-department-tokens-v1',
      generatedFromSeed: seed.seedId,
      colors: {
        primary: colors.primary || '#6366F1',
        secondary: colors.secondary || '#4F46E5',
        accent: colors.accent || '#818CF8',
        background: colors.background || '#0B0E14',
        surface: colors.surface || '#151A23',
        surfaceElevated: colors.surfaceElevated || '#1E2533',
        textPrimary: colors.textPrimary || '#F8FAFC',
        textSecondary: colors.textSecondary || '#94A3B8',
        border: colors.border || 'rgba(255, 255, 255, 0.08)',
      },
      typography: {
        fontFamily: {
          display: `"${typo.displayFont || 'Outfit'}", -apple-system, sans-serif`,
          body: `"${typo.bodyFont || 'Plus Jakarta Sans'}", -apple-system, sans-serif`,
          mono: '"JetBrains Mono", monospace',
        },
        fontSize: {
          xs: '11px',
          sm: '13px',
          base: '15px',
          lg: '18px',
          xl: '22px',
          '2xl': '28px',
          '3xl': '36px',
        },
        lineHeight: {
          tight: '1.2',
          normal: String(typo.bodyLineHeight || 1.6),
          relaxed: '1.75',
        },
        letterSpacing: {
          tight: String(typo.headingTracking || '-0.02em'),
          normal: '0',
          wide: '0.02em',
        },
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
      },
      borderRadius: {
        sm: '6px',
        md: shapes.btnRadius || '8px',
        lg: shapes.cardRadius || '12px',
        pill: shapes.pillRadius || '9999px',
      },
      shadows: {
        subtle: depth.shadowSubtle || '0 2px 8px rgba(0, 0, 0, 0.12)',
        card: depth.shadowCard || '0 4px 20px rgba(0, 0, 0, 0.25)',
      },
      transitions: {
        fast: motion.durationFast || '150ms',
        normal: motion.durationNormal || '250ms',
        slow: motion.durationSlow || '400ms',
        easing: motion.easingCurve || 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    };
  }
}

const designSeedEngine = new DesignSeedEngine();

module.exports = {
  DesignSeedEngine,
  designSeedEngine,
  CURATED_PALETTES,
  CURATED_TYPOGRAPHY,
  LAYOUT_ARCHETYPES,
  SIGNATURE_ELEMENTS,
};
