/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DESIGN SEED PROMPTS & SCHEMAS
 * ==============================================================================
 * (agents/prompts/design-seed-prompt.js)
 * Defines structured JSON schema and reasoning prompts for 9-Axis Design Seed Agent.
 * ==============================================================================
 */

const DESIGN_SEED_SYSTEM_PROMPT = `You are the Lead Visual Architect & Design Seed Director at the AI Design Department (Agent 3 of 46).
Your role is to formulate a high-craft, bespoke 9-axis visual design direction for software applications.

STRICT CRAFTSMANSHIP DIRECTIVES (Anti-Generic Mandate):
1. REJECT ALL AI CLICHÉS:
   - NEVER use purple-to-blue gradients, cyan text on dark backgrounds, or glowing glassmorphism.
   - NEVER use Inter, Roboto, or Geist as lazy defaults. Pair a distinctive display font (Outfit, Cabinet Grotesk, Syne, Fraunces) with a refined body font.
   - NEVER use identical 3-column feature grids with stacked icons.
   - NEVER use generic SaaS verbs ("supercharge", "empower", "unleash") in concepts.
2. 9 DISTINCT DESIGN AXES:
   - Axis 1 (Layout): Asymmetrical bento grid, split-screen workbench, or editorial monolith.
   - Axis 2 (Typography): Distinctive display font + body font, scale ratio (1.25+), optical tracking.
   - Axis 3 (Color Direction): Sophisticated high-contrast palette with authentic warmth or cool obsidian tone.
   - Axis 4 (Density): Compact, balanced, spacious, or high-density workbench.
   - Axis 5 (Motion): Timing, cubic-bezier easing curve, choreography, and stagger delay.
   - Axis 6 (Shape Language): Mathematically nested radii, button radius, pill pills.
   - Axis 7 (Imagery Style): Editorial vector, duotone grain, geometric monochrome.
   - Axis 8 (Depth): Layered glass, frosted acrylic, subtle ambient elevation.
   - Axis 9 (Signature Element): Bespoke tactile interaction or kinetic element.

You MUST return valid JSON adhering strictly to the response schema.`;

const DESIGN_SEED_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    conceptName: { type: 'string', description: 'Unique, evocative name for this design direction (e.g. Obsidian Emerald Workbench)' },
    philosophy: { type: 'string', description: 'Core visual thesis and optical principles' },
    layout: {
      type: 'object',
      properties: {
        archetype: { type: 'string' },
        description: { type: 'string' },
        gridStyle: { type: 'string' },
        columnCount: { type: 'number' },
      },
      required: ['archetype', 'description'],
    },
    typography: {
      type: 'object',
      properties: {
        displayFont: { type: 'string' },
        bodyFont: { type: 'string' },
        scaleRatio: { type: 'number' },
        headingTracking: { type: 'string' },
        bodyLineHeight: { type: 'number' },
      },
      required: ['displayFont', 'bodyFont', 'scaleRatio'],
    },
    colorDirection: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        theme: { type: 'string', enum: ['dark', 'light'] },
        primary: { type: 'string' },
        secondary: { type: 'string' },
        accent: { type: 'string' },
        background: { type: 'string' },
        surface: { type: 'string' },
        surfaceElevated: { type: 'string' },
        textPrimary: { type: 'string' },
        textSecondary: { type: 'string' },
        border: { type: 'string' },
        colorTemperature: { type: 'string' },
        contrastLevel: { type: 'string' },
      },
      required: ['primary', 'background', 'surface', 'textPrimary', 'accent'],
    },
    density: { type: 'string', enum: ['compact', 'balanced', 'spacious', 'dense'] },
    motion: {
      type: 'object',
      properties: {
        durationFast: { type: 'string' },
        durationNormal: { type: 'string' },
        durationSlow: { type: 'string' },
        easingCurve: { type: 'string' },
        staggerDelayMs: { type: 'number' },
      },
      required: ['durationNormal', 'easingCurve'],
    },
    shapeLanguage: {
      type: 'object',
      properties: {
        borderRadius: { type: 'string' },
        cardRadius: { type: 'string' },
        btnRadius: { type: 'string' },
        pillRadius: { type: 'string' },
        geometricArchetype: { type: 'string' },
      },
      required: ['cardRadius', 'btnRadius'],
    },
    imageryStyle: {
      type: 'object',
      properties: {
        style: { type: 'string' },
        treatment: { type: 'string' },
      },
      required: ['style'],
    },
    depth: {
      type: 'object',
      properties: {
        style: { type: 'string' },
        backdropBlur: { type: 'string' },
        shadowSubtle: { type: 'string' },
        shadowCard: { type: 'string' },
      },
      required: ['style'],
    },
    signatureElement: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  },
  required: [
    'conceptName',
    'philosophy',
    'layout',
    'typography',
    'colorDirection',
    'density',
    'motion',
    'shapeLanguage',
    'imageryStyle',
    'depth',
    'signatureElement',
  ],
};

function buildDesignSeedUserPrompt(projectData = {}) {
  const { projectId, projectName, brief } = projectData;
  const techStack = brief?.techStack || 'Next.js + Tailwind';
  const designMode = brief?.designMode || 'self-design';
  const userRequirements = brief?.userRequirements || brief?.description || 'High-performance desktop web application';

  return `Formulate a complete, bespoke 9-axis Design Seed for the following project:
- Project ID: ${projectId}
- Project Name: "${projectName}"
- Tech Stack: ${techStack}
- Design Mode: ${designMode}
- User Requirements & Brief: ${userRequirements}

Return ONLY valid JSON matching the specified 9-axis schema. Ensure zero generic AI clichés and distinct high-craft visual character.`;
}

module.exports = {
  DESIGN_SEED_SYSTEM_PROMPT,
  DESIGN_SEED_RESPONSE_SCHEMA,
  buildDesignSeedUserPrompt,
};
