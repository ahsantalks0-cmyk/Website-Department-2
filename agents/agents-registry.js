/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — AGENTS REGISTRY (agents/agents-registry.js)
 * ==============================================================================
 * Central registry of all 46 specialized agents across 6 departments:
 * Department A: Command & Creative Direction (6 agents)
 * Department B: Design Intelligence & Systems (8 agents)
 * Department C: Engineering & Code Generation (10 agents)
 * Department D: Content, Copy & SEO (6 agents)
 * Department E: CMS, Data & Backend (8 agents)
 * Department F: Quality Assurance & Verification (8 agents)
 *
 * Tracks live status, current activity, action logs, and orchestrator hooks.
 * ==============================================================================
 */

const { eventBus } = require('../core/event-bus');

class AgentsRegistry {
  constructor() {
    this.plansByProject = new Map();
    this.agents = this.initializeAgents();
    this.setupEventListeners();
  }

  /**
   * Initializes the full matrix of 46 agents.
   * Agent 1 (Senior Chat) and Agent 2 (Department Head) are Active.
   * Agents 3 to 46 are Planned.
   */
  initializeAgents() {
    return [
      // ------------------------------------------------------------------------
      // DEPARTMENT A: Command & Creative Direction (6 agents)
      // ------------------------------------------------------------------------
      {
        id: 'agent-1-senior-chat',
        number: 1,
        name: 'Senior Chat Agent',
        role: 'Senior Project Lead & Requirements Lead',
        department: 'A: Command & Creative',
        deptKey: 'command',
        status: 'Active',
        currentActivity: 'Listening for client directives & conducting discovery interviews',
        description: 'Conducts proactive onboarding interviews, classifies user intent, enforces exact/self design rules, maintains architectural checklist, and triggers project handoffs.',
        lastActions: [
          { action: 'System online & conversational gateway initialized', timestamp: new Date().toISOString() },
        ],
      },
      {
        id: 'agent-2-dept-head',
        number: 2,
        name: 'Department Head',
        role: 'Executive Director & Task Graph Architect',
        department: 'A: Command & Creative',
        deptKey: 'command',
        status: 'Active',
        currentActivity: 'Standing by for project handoff & task graph compilation',
        description: 'Translates Project Knowledge Store briefs into dependency-ordered multi-phase execution plans, dispatches Task Graphs, and orchestrates department review gates.',
        lastActions: [
          { action: 'Department Head initialized with TaskGraph dispatch engine', timestamp: new Date().toISOString() },
        ],
      },
      {
        id: 'agent-3-creative-director',
        number: 3,
        name: 'Creative Director',
        role: 'Aesthetic Vision & Brand Archetype Guardian',
        department: 'A: Command & Creative',
        deptKey: 'command',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Sets global aesthetic vision, brand personality, and visual tone of voice across web applications.',
        lastActions: [],
      },
      {
        id: 'agent-4-brand-architect',
        number: 4,
        name: 'Brand Architect',
        role: 'Identity & Guidelines Specialist',
        department: 'A: Command & Creative',
        deptKey: 'command',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Formalizes brand identity rules, logo usage principles, and multi-surface style guide documentation.',
        lastActions: [],
      },
      {
        id: 'agent-5-design-seed-engine',
        number: 5,
        name: 'Design Seed Engine',
        role: 'Autonomous Concept Generator',
        department: 'A: Command & Creative',
        deptKey: 'command',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Generates creative, bespoke visual themes with high typographic contrast and distinctive spatial layouts.',
        lastActions: [],
      },
      {
        id: 'agent-6-project-synthesizer',
        number: 6,
        name: 'Project Synthesizer',
        role: 'Multi-Document Harmonizer',
        department: 'A: Command & Creative',
        deptKey: 'command',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Synchronizes cross-document requirements between design tokens, page hierarchies, and technical briefs.',
        lastActions: [],
      },

      // ------------------------------------------------------------------------
      // DEPARTMENT B: Design Intelligence & Systems (8 agents)
      // ------------------------------------------------------------------------
      {
        id: 'agent-7-layout-architect',
        number: 7,
        name: 'Layout & Spatial Architect',
        role: '8pt Rhythmic Grid & Layout Engineer',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Engineers responsive container grids, flexbox stacks, and mathematical spacing rhythm.',
        lastActions: [],
      },
      {
        id: 'agent-8-typography-director',
        number: 8,
        name: 'Typography Director',
        role: 'Type Hierarchy & Optical Scaling Lead',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Establishes mathematical font scales, line heights, letter-tracking, and font pairing architectures.',
        lastActions: [],
      },
      {
        id: 'agent-9-color-specialist',
        number: 9,
        name: 'Color & Palette Specialist',
        role: 'HSB Harmony & Contrast Engineer',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Generates semantic color tokens, dark/light theme maps, and strictly validates WCAG AA ratios.',
        lastActions: [],
      },
      {
        id: 'agent-10-motion-designer',
        number: 10,
        name: 'Motion & Animation Designer',
        role: 'Micro-Interactions & Transitions Lead',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Designs tactile button feedback, cubic-bezier timing curves, and page entry transitions.',
        lastActions: [],
      },
      {
        id: 'agent-11-vector-artist',
        number: 11,
        name: 'Iconography & Vector Artist',
        role: 'Visual Icon Graph Curator',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Selects and aligns Lucide SVG icons with uniform stroke weights and optical bounding boxes.',
        lastActions: [],
      },
      {
        id: 'agent-12-component-architect',
        number: 12,
        name: 'Component Architect',
        role: 'Design System Units Specialist',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Defines reusable atomic components, variants, hover states, and design token connections.',
        lastActions: [],
      },
      {
        id: 'agent-13-visual-critic',
        number: 13,
        name: 'Visual Hierarchy Critic',
        role: 'Anti-Slop & Density Inspector',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Eliminates AI clichés, generic purple gradients, nested cards, and ungrounded decorative elements.',
        lastActions: [],
      },
      {
        id: 'agent-14-asset-curator',
        number: 14,
        name: 'Asset & Media Curator',
        role: 'Image Pipeline & Aspect Ratio Lead',
        department: 'B: Design Intelligence',
        deptKey: 'design',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Optimizes image formats, dimensions, responsive picture elements, and asset caching rules.',
        lastActions: [],
      },

      // ------------------------------------------------------------------------
      // DEPARTMENT C: Engineering & Code Generation (10 agents)
      // ------------------------------------------------------------------------
      {
        id: 'agent-15-nextjs-architect',
        number: 15,
        name: 'Next.js App Architect',
        role: 'App Router & Server Component Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Architects Next.js 14+ App Router directory structures, layouts, and server component boundaries.',
        lastActions: [],
      },
      {
        id: 'agent-16-tailwind-engineer',
        number: 16,
        name: 'Tailwind CSS Master',
        role: 'Zero-CSS Utility Specialist',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Compiles clean utility class hierarchies, responsive breakpoints, and custom theme token mappings.',
        lastActions: [],
      },
      {
        id: 'agent-17-html-specialist',
        number: 17,
        name: 'HTML5 Semantic Specialist',
        role: 'Semantic Markup & Landmark Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Ensures structural semantic HTML with proper landmarks, headings hierarchy, and accessibility attributes.',
        lastActions: [],
      },
      {
        id: 'agent-18-vanilla-engineer',
        number: 18,
        name: 'Vanilla JS & DOM Engineer',
        role: 'High-Performance Event Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Builds lightweight, zero-dependency client logic, modal triggers, and clean DOM event listeners.',
        lastActions: [],
      },
      {
        id: 'agent-19-shadcn-assembler',
        number: 19,
        name: 'shadcn/ui Assembler',
        role: 'Radix Primitive & Component Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Integrates Radix UI primitives, accessible dialogs, tooltips, and dropdown menus seamlessly.',
        lastActions: [],
      },
      {
        id: 'agent-20-state-architect',
        number: 20,
        name: 'State Machine Architect',
        role: 'Predictable Data Flow Specialist',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Manages client state machines, validation states, optimistic UI updates, and data synchronization.',
        lastActions: [],
      },
      {
        id: 'agent-21-api-integrator',
        number: 21,
        name: 'API & Fetch Integrator',
        role: 'Type-Safe Server Route Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Constructs secure backend API routes, fetch handlers, and request caching mechanisms.',
        lastActions: [],
      },
      {
        id: 'agent-22-css-architect',
        number: 22,
        name: 'CSS Architecture Specialist',
        role: 'Token Isolation & Variables Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Maintains scoped CSS variables, typography tokens, and hardware-accelerated animations.',
        lastActions: [],
      },
      {
        id: 'agent-23-responsive-engineer',
        number: 23,
        name: 'Responsive Viewport Engineer',
        role: 'Fluid Viewport Optimization Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Fine-tunes mobile drawers, touch targets (>=44px), desktop multi-columns, and ultra-wide clamping.',
        lastActions: [],
      },
      {
        id: 'agent-24-bundle-optimizer',
        number: 24,
        name: 'Build & Bundle Optimizer',
        role: 'Performance & Tree-Shaking Lead',
        department: 'C: Engineering',
        deptKey: 'engineering',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Minimizes bundle sizes, optimizes font loading, and eliminates unused CSS and script imports.',
        lastActions: [],
      },

      // ------------------------------------------------------------------------
      // DEPARTMENT D: Content, Copy & SEO (6 agents)
      // ------------------------------------------------------------------------
      {
        id: 'agent-25-ux-copywriter',
        number: 25,
        name: 'UX Copywriter',
        role: 'Conversion Copy & Voice Specialist',
        department: 'D: Content & Media',
        deptKey: 'content',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Writes crisp, value-driven headlines, benefits copy, and human-centered onboarding narratives.',
        lastActions: [],
      },
      {
        id: 'agent-26-content-architect',
        number: 26,
        name: 'Content Architect',
        role: 'Information Architecture Specialist',
        department: 'D: Content & Media',
        deptKey: 'content',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Structures page narrative flows, section groupings, FAQs, and scannable content hierarchies.',
        lastActions: [],
      },
      {
        id: 'agent-27-tech-writer',
        number: 27,
        name: 'Technical Documentation Lead',
        role: 'Developer Docs & Specs Specialist',
        department: 'D: Content & Media',
        deptKey: 'content',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Authors clear README files, component API documentation, and deployment guides.',
        lastActions: [],
      },
      {
        id: 'agent-28-seo-strategist',
        number: 28,
        name: 'SEO & Metadata Strategist',
        role: 'OpenGraph & JSON-LD Architect',
        department: 'D: Content & Media',
        deptKey: 'content',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Implements structured rich snippets, meta descriptions, canonical URLs, and social sharing cards.',
        lastActions: [],
      },
      {
        id: 'agent-29-microcopy-specialist',
        number: 29,
        name: 'Microcopy Specialist',
        role: 'Tactile Label & Feedback Copy Lead',
        department: 'D: Content & Media',
        deptKey: 'content',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Refines button labels, validation warnings, tooltip guidance, and success state microcopy.',
        lastActions: [],
      },
      {
        id: 'agent-30-localization-lead',
        number: 30,
        name: 'Localization & Multi-Lang Lead',
        role: 'i18n & Multi-Language Specialist',
        department: 'D: Content & Media',
        deptKey: 'content',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Coordinates internationalization, RTL layout support, and multi-language string dictionaries.',
        lastActions: [],
      },

      // ------------------------------------------------------------------------
      // DEPARTMENT E: CMS, Data & Backend (8 agents)
      // ------------------------------------------------------------------------
      {
        id: 'agent-31-db-timing-director',
        number: 31,
        name: 'Database Timing Director',
        role: 'Schema Deferral & Policy Guardian',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Guarantees database setup respects user preference and pauses schema generation until visual UI sign-off.',
        lastActions: [],
      },
      {
        id: 'agent-32-supabase-architect',
        number: 32,
        name: 'Supabase / Postgres Architect',
        role: 'Relational DDL & RLS Specialist',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Designs PostgreSQL schemas, foreign key relationships, migration scripts, and Row Level Security.',
        lastActions: [],
      },
      {
        id: 'agent-33-sqlite-engineer',
        number: 33,
        name: 'SQLite Embedded Engineer',
        role: 'Local-First Data Cache Lead',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Manages embedded desktop SQLite stores, WAL mode, transaction checkpoints, and offline sync.',
        lastActions: [],
      },
      {
        id: 'agent-34-auth-specialist',
        number: 34,
        name: 'Auth & Session Specialist',
        role: 'Token Lifecycle & Security Lead',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Implements OAuth2 flows, cookie security, session management, and protected client routes.',
        lastActions: [],
      },
      {
        id: 'agent-35-headless-cms',
        number: 35,
        name: 'Headless CMS Integrator',
        role: 'Content Model & Webhook Specialist',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Bridges headless CMS schemas (Sanity, Strapi, Contentful) to dynamic front-end page renderers.',
        lastActions: [],
      },
      {
        id: 'agent-36-realtime-engineer',
        number: 36,
        name: 'Realtime & WebSocket Engineer',
        role: 'Live Event Pipeline Lead',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Establishes bidirectional event channels for live collaboration, notifications, and telemetry streams.',
        lastActions: [],
      },
      {
        id: 'agent-37-storage-architect',
        number: 37,
        name: 'Storage & Asset CDN Architect',
        role: 'Bucket & Asset Distribution Lead',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Configures cloud storage buckets, pre-signed upload URLs, and asset CDN caching headers.',
        lastActions: [],
      },
      {
        id: 'agent-38-security-auditor',
        number: 38,
        name: 'Security & Rule Auditor',
        role: 'Data Sanitization & XSS Guard',
        department: 'E: CMS & Backend',
        deptKey: 'cms',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Audits inputs for SQL injection, cross-site scripting, and unauthorized API parameter pollution.',
        lastActions: [],
      },

      // ------------------------------------------------------------------------
      // DEPARTMENT F: Quality Assurance & Verification (8 agents)
      // ------------------------------------------------------------------------
      {
        id: 'agent-39-visual-qa',
        number: 39,
        name: 'Visual Regression Inspector',
        role: 'Pixel Comparison & Layout Drift Lead',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Captures visual baselines to identify unintended style changes, padding shifts, or clipping.',
        lastActions: [],
      },
      {
        id: 'agent-40-a11y-auditor',
        number: 40,
        name: 'Accessibility & WCAG Auditor',
        role: 'AA/AAA Contrast & Keyboard Nav Lead',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Verifies ARIA tags, tab focus rings, screen reader compatibility, and minimum color contrast.',
        lastActions: [],
      },
      {
        id: 'agent-41-cross-device',
        number: 41,
        name: 'Cross-Device Viewport Tester',
        role: 'Device Matrix & Touch Target Lead',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Validates behavior across iPhone, iPad, Android, standard desktop, and 4K widescreen displays.',
        lastActions: [],
      },
      {
        id: 'agent-42-perf-auditor',
        number: 42,
        name: 'Performance & Web Vitals Lead',
        role: 'LCP, CLS & Frame Budget Specialist',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Audits Core Web Vitals, Cumulative Layout Shift, Largest Contentful Paint, and memory leaks.',
        lastActions: [],
      },
      {
        id: 'agent-43-form-validator',
        number: 43,
        name: 'Form & Input State Validator',
        role: 'Error Boundary & Edge Case Lead',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Tests empty states, long text overflow, invalid email formats, and disabled button behavior.',
        lastActions: [],
      },
      {
        id: 'agent-44-link-checker',
        number: 44,
        name: 'Broken Link & Asset Checker',
        role: 'Asset Integrity & 404 Prevention Lead',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Crawls all internal anchors, image sources, and external links to ensure 100% resolution.',
        lastActions: [],
      },
      {
        id: 'agent-45-code-inspector',
        number: 45,
        name: 'Code Quality & Linter Inspector',
        role: 'Syntax, Imports & Clean Code Guard',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Enforces ESLint standards, cleans unused imports, and validates TypeScript strict type safety.',
        lastActions: [],
      },
      {
        id: 'agent-46-release-gatekeeper',
        number: 46,
        name: 'Final Sign-off Release Gatekeeper',
        role: 'Production Deployment Validator',
        department: 'F: Quality & Verification',
        deptKey: 'qa',
        status: 'Planned',
        currentActivity: 'Planned for future phase',
        description: 'Executes pre-flight checklist before production bundle compilation, export, and release packaging.',
        lastActions: [],
      },
    ];
  }

  /**
   * Returns all 46 agents with their latest dynamic status and activities.
   */
  getAll() {
    return this.agents.map((a) => ({ ...a }));
  }

  /**
   * Retrieves single agent by ID or number.
   * @param {string|number} idOrNum
   */
  getAgent(idOrNum) {
    return this.agents.find(
      (a) => a.id === idOrNum || a.number === Number(idOrNum)
    ) || null;
  }

  /**
   * Updates an agent's current live activity.
   * @param {string} agentId
   * @param {string} activity
   */
  setActivity(agentId, activity) {
    const agent = this.getAgent(agentId);
    if (agent) {
      agent.currentActivity = activity;
      eventBus.publish('agents:updated', { agentId, activity });
    }
  }

  /**
   * Appends an entry to an agent's recent action log.
   * @param {string} agentId
   * @param {string} action
   */
  logAction(agentId, action) {
    const agent = this.getAgent(agentId);
    if (agent) {
      if (!Array.isArray(agent.lastActions)) agent.lastActions = [];
      agent.lastActions.unshift({
        action,
        timestamp: new Date().toISOString(),
      });
      if (agent.lastActions.length > 20) {
        agent.lastActions = agent.lastActions.slice(0, 20);
      }
      eventBus.publish('agents:updated', { agentId, action });
    }
  }

  /**
   * Stores a generated execution plan for a project.
   * @param {number|string} projectId
   * @param {object} plan
   */
  setPlan(projectId, plan) {
    this.plansByProject.set(String(projectId), plan);
  }

  /**
   * Retrieves a generated plan for a project.
   * @param {number|string} projectId
   */
  getPlan(projectId) {
    return this.plansByProject.get(String(projectId)) || null;
  }

  /**
   * Subscribes to orchestrator events to reflect live agent activities.
   */
  setupEventListeners() {
    eventBus.subscribe('graph:started', ({ data }) => {
      const graphName = data?.name || 'Task Graph';
      this.setActivity('agent-2-dept-head', `Running graph: "${graphName}"`);
      this.logAction('agent-2-dept-head', `Launched execution graph: "${graphName}"`);
    });

    eventBus.subscribe('task:started', ({ nodeId, data }) => {
      const handler = data?.handler || 'Task';
      if (handler.includes('department-head')) {
        this.setActivity('agent-2-dept-head', `Synthesizing execution plan (Node: ${nodeId})`);
        this.logAction('agent-2-dept-head', `Generating plan for task node "${nodeId}"`);
      } else if (handler.includes('chat')) {
        this.setActivity('agent-1-senior-chat', `Processing client request (Node: ${nodeId})`);
      }
    });

    eventBus.subscribe('task:completed', ({ nodeId }) => {
      if (nodeId.includes('dept-head') || nodeId.includes('plan')) {
        this.setActivity('agent-2-dept-head', 'Execution plan completed & task graph dispatched');
        this.logAction('agent-2-dept-head', `Plan completed successfully for node "${nodeId}"`);
      }
    });

    eventBus.subscribe('task:waiting_for_user', ({ data }) => {
      const msg = data?.message || 'Review gate reached';
      this.setActivity('agent-2-dept-head', `Review gate active: Waiting for user approval`);
      this.logAction('agent-2-dept-head', `Paused graph at review gate: "${msg}"`);
    });

    eventBus.subscribe('graph:paused', () => {
      this.setActivity('agent-2-dept-head', 'Graph paused (Waiting for user review)');
      this.logAction('agent-2-dept-head', 'Task graph paused at review gate');
    });

    eventBus.subscribe('graph:resumed', () => {
      this.setActivity('agent-2-dept-head', 'Graph resumed: Running remaining tasks');
      this.logAction('agent-2-dept-head', 'Task graph resumed after review');
    });

    eventBus.subscribe('graph:completed', ({ data }) => {
      const name = data?.name || 'Graph';
      this.setActivity('agent-2-dept-head', `Completed all tasks for "${name}"`);
      this.logAction('agent-2-dept-head', `Finished graph "${name}" successfully`);
    });
  }
}

const agentsRegistry = new AgentsRegistry();

module.exports = {
  AgentsRegistry,
  agentsRegistry,
};
