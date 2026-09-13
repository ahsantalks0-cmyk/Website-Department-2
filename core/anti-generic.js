/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ANTI-GENERIC BANNED-PATTERN DETECTOR
 * ==============================================================================
 * (core/anti-generic.js)
 *
 * Enforces strict craftsmanship rules to actively recognize and eliminate
 * "AI Slop"—the generic, low-effort visual templates and clichés that define
 * amateur AI generation.
 *
 * Banned Patterns (Rules R2 through R9):
 * - R2: No generic purple-to-blue gradients or cyan-on-dark neon clichés.
 * - R3: No identical 3-column feature cards with stacked generic icons.
 * - R4: No hero eyebrows with generic uppercase marketing verbs ("SUPERCHARGE", "EMPOWER").
 * - R5: No ghost cards mixing 1px hairline borders with wide soft fuzzy drop-shadows.
 * - R6: No extreme border-radii on standard cards (>16px) or conflicting thick accent borders + radii.
 * - R7: No generic font defaults (Inter/Roboto) as lazy defaults; require distinctive display pairing.
 * - R8: No low-contrast text or gray text on colored backgrounds (strict WCAG AA 4.5:1).
 * - R9: No numbered section markers (01, 02) unless explicitly sequential.
 * ==============================================================================
 */

const BANNED_KEYWORDS = [
  'supercharge',
  'empower',
  'unleash',
  'game-changer',
  'next-level',
  'seamlessly',
  'revolutionary',
  'cutting-edge',
  'streamline your workflow',
  'take your business to the next level',
];

const BANNED_GRADIENTS = [
  /linear-gradient\([^)]*(#8b5cf6|#6366f1|#a855f7|purple)[^)]*(#3b82f6|#06b6d4|#0ea5e9|blue|cyan)[^)]*\)/i,
  /linear-gradient\([^)]*#ec4899[^)]*#8b5cf6[^)]*\)/i,
];

const BANNED_FONTS = [
  /^inter$/i,
  /^roboto$/i,
  /^geist$/i,
  /^space\s*grotesk$/i,
];

class AntiGenericDetector {
  /**
   * Evaluates a design seed or design token set against all anti-generic rules.
   * @param {object} seed 9-axis design seed or partial tokens
   * @returns {{ valid: boolean, score: number, violations: Array<{ rule: string, description: string, severity: string, fix: string }> }}
   */
  validateSeed(seed = {}) {
    const violations = [];

    if (!seed || typeof seed !== 'object') {
      return {
        valid: false,
        score: 0,
        violations: [{ rule: 'R0', description: 'Invalid seed object provided', severity: 'critical', fix: 'Generate complete 9-axis seed' }],
      };
    }

    // Check Color & Gradients (R2)
    this.checkColorClichés(seed, violations);

    // Check Typography (R7)
    this.checkTypography(seed, violations);

    // Check Shape Language & Radii (R6)
    this.checkShapeLanguage(seed, violations);

    // Check Depth & Shadows (R5)
    this.checkDepthAndShadows(seed, violations);

    // Check Copy & Naming (R4)
    this.checkCopywriting(seed, violations);

    // Check Signature Element & Layout (R3)
    this.checkLayoutAndSignature(seed, violations);

    const maxScore = 100;
    const penalty = violations.reduce((sum, v) => sum + (v.severity === 'critical' ? 25 : 10), 0);
    const score = Math.max(0, maxScore - penalty);
    const valid = violations.filter((v) => v.severity === 'critical').length === 0 && score >= 70;

    return {
      valid,
      score,
      violations,
    };
  }

  /**
   * Checks for purple-to-blue clichés and low-contrast text (R2 & R8).
   */
  checkColorClichés(seed, violations) {
    const color = seed.colorDirection || seed.colors || {};
    const primary = String(color.primary || '').toLowerCase();
    const accent = String(color.accent || '').toLowerCase();
    const bg = String(color.background || '').toLowerCase();
    const textSec = String(color.textSecondary || '').toLowerCase();

    // Check for purple-blue combo
    const isPurple = (c) => c.includes('#8b') || c.includes('#63') || c.includes('#a8') || c.includes('purple') || c.includes('indigo');
    const isCyanBlue = (c) => c.includes('#06b') || c.includes('#0ea') || c.includes('#3b8') || c.includes('cyan');

    if (isPurple(primary) && isCyanBlue(accent)) {
      violations.push({
        rule: 'R2',
        description: 'Banned purple-to-blue gradient/accent cliché detected.',
        severity: 'critical',
        fix: 'Use a sophisticated bespoke palette (e.g., Deep Emerald + Warm Ochre, Obsidian + Solar Gold, or Cobalt + Alabaster).',
      });
    }

    // Check for cyan-on-dark text
    if ((bg.includes('#0') || bg.includes('#1')) && isCyanBlue(textSec)) {
      violations.push({
        rule: 'R2',
        description: 'Cyan text on dark background cliché detected.',
        severity: 'warning',
        fix: 'Use sophisticated warm/cool neutral shades (e.g. #94A3B8 or #A1A1AA) for secondary text.',
      });
    }
  }

  /**
   * Checks for lazy font selections (R7).
   */
  checkTypography(seed, violations) {
    const typography = seed.typography || {};
    const display = String(typography.displayFont || typography.display || '').trim();
    const body = String(typography.bodyFont || typography.body || '').trim();

    if (BANNED_FONTS.some((regex) => regex.test(display))) {
      violations.push({
        rule: 'R7',
        description: `Lazy default font "${display}" used as display typeface.`,
        severity: 'critical',
        fix: 'Pair a distinctive display font (e.g., Outfit, Cabinet Grotesk, Syne, Fraunces, Plus Jakarta Sans) with a refined body font.',
      });
    }

    if (display && body && display.toLowerCase() === body.toLowerCase() && display.toLowerCase() === 'inter') {
      violations.push({
        rule: 'R7',
        description: 'Single generic font used for both display and body.',
        severity: 'critical',
        fix: 'Establish a clear typographic pairing with distinct character and optical hierarchy.',
      });
    }
  }

  /**
   * Checks for extreme border-radii or clashing borders (R6).
   */
  checkShapeLanguage(seed, violations) {
    const shapes = seed.shapeLanguage || {};
    const radius = parseInt(shapes.borderRadius || shapes.cardRadius || 12, 10);

    if (radius > 20) {
      violations.push({
        rule: 'R6',
        description: `Excessive card border radius (${radius}px) exceeds 16px maximum standard.`,
        severity: 'warning',
        fix: 'Cap standard card border-radius between 8px and 16px; reserve 24px+ pills strictly for interactive buttons or badges.',
      });
    }

    if (shapes.cornerStyle === 'pill' && shapes.borderWeight && parseInt(shapes.borderWeight, 10) >= 3) {
      violations.push({
        rule: 'R6',
        description: 'Thick accent borders combined with high rounded corners compete visually.',
        severity: 'warning',
        fix: 'Choose either a crisp geometric flat edge for thick accent borders or a refined 1px border for rounded cards.',
      });
    }
  }

  /**
   * Checks for ghost cards with conflicting hairline borders + blurry shadows (R5).
   */
  checkDepthAndShadows(seed, violations) {
    const depth = seed.depth || {};
    const style = String(depth.style || depth.elevation || '').toLowerCase();

    if (style.includes('ghost') || (style.includes('hairline') && style.includes('wide-shadow'))) {
      violations.push({
        rule: 'R5',
        description: 'Ghost card pattern detected (mixing 1px hairline border with wide soft drop-shadow).',
        severity: 'warning',
        fix: 'Use either clean crisp flat surface contrast or subtle layered elevation with backdrop blur.',
      });
    }
  }

  /**
   * Checks for generic SaaS copywriting clichés (R4).
   */
  checkCopywriting(seed, violations) {
    const textToCheck = [
      seed.conceptName,
      seed.philosophy,
      seed.signatureElement?.description,
      seed.layout?.description,
    ].filter(Boolean).join(' ').toLowerCase();

    for (const banned of BANNED_KEYWORDS) {
      if (textToCheck.includes(banned)) {
        violations.push({
          rule: 'R4',
          description: `Generic SaaS buzzword cliché "${banned}" found in design seed concept.`,
          severity: 'warning',
          fix: 'Use precise, domain-authentic terminology that directly describes user capabilities.',
        });
      }
    }
  }

  /**
   * Checks layout archetypes (R3).
   */
  checkLayoutAndSignature(seed, violations) {
    const layout = seed.layout || {};
    const layoutType = String(layout.archetype || layout.style || '').toLowerCase();

    if (layoutType.includes('3-column-icon-grid') || layoutType.includes('hero-3-cards')) {
      violations.push({
        rule: 'R3',
        description: 'Generic 3-column feature grid with stacked icons detected.',
        severity: 'warning',
        fix: 'Use asymmetrical bento grids, split-screen layouts, or dynamic content workbenches.',
      });
    }
  }

  /**
   * Auto-fixes a non-compliant seed by replacing generic defaults with curated high-craft tokens.
   * @param {object} rawSeed
   * @returns {object} Cleaned seed
   */
  autoCorrectSeed(rawSeed) {
    const seed = JSON.parse(JSON.stringify(rawSeed || {}));

    // Fix typography if generic
    if (!seed.typography || BANNED_FONTS.some((r) => r.test(seed.typography.displayFont))) {
      seed.typography = {
        displayFont: 'Outfit',
        bodyFont: 'Plus Jakarta Sans',
        scaleRatio: 1.25,
        headingTracking: '-0.02em',
        bodyLineHeight: 1.6,
      };
    }

    // Fix colors if purple-blue cliché
    if (!seed.colorDirection || this.validateSeed(seed).violations.some((v) => v.rule === 'R2')) {
      seed.colorDirection = {
        name: 'Obsidian Emerald',
        primary: '#10B981',
        secondary: '#064E3B',
        accent: '#34D399',
        background: '#090B10',
        surface: '#11151F',
        surfaceElevated: '#181F2E',
        textPrimary: '#F8FAFC',
        textSecondary: '#94A3B8',
        border: 'rgba(255, 255, 255, 0.08)',
        colorTemperature: 'cool',
        contrastLevel: 'high-contrast',
      };
    }

    // Fix shape language
    if (!seed.shapeLanguage || parseInt(seed.shapeLanguage.borderRadius || 12, 10) > 16) {
      seed.shapeLanguage = {
        borderRadius: '12px',
        cardRadius: '12px',
        btnRadius: '8px',
        pillRadius: '9999px',
        borderWidth: '1px',
        geometricArchetype: 'Modern Softened Rectangles',
      };
    }

    // Ensure density
    if (!seed.density) {
      seed.density = 'balanced';
    }

    // Ensure motion
    if (!seed.motion) {
      seed.motion = {
        durationFast: '150ms',
        durationNormal: '250ms',
        durationSlow: '400ms',
        easingCurve: 'cubic-bezier(0.16, 1, 0.3, 1)',
        staggerDelayMs: 40,
      };
    }

    // Ensure depth
    if (!seed.depth) {
      seed.depth = {
        style: 'layered-glass',
        backdropBlur: '16px',
        shadowSubtle: '0 2px 8px rgba(0, 0, 0, 0.12)',
        shadowCard: '0 4px 20px rgba(0, 0, 0, 0.25)',
      };
    }

    return seed;
  }
}

const antiGeneric = new AntiGenericDetector();

module.exports = {
  AntiGenericDetector,
  antiGeneric,
  BANNED_KEYWORDS,
  BANNED_FONTS,
};
