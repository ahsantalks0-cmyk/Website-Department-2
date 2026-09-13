/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — AGENTS MATRIX CONTROLLER (src/js/agents.js)
 * ==============================================================================
 * Renders and manages the complete 46-agent matrix across all 6 departments.
 * Features:
 * - Real-time activity indicators for Agent 1 (Senior Chat) & Agent 2 (Department Head)
 * - Department filter tabs (All, Command, Design, Engineering, Content, CMS, QA)
 * - Fast text search across names, numbers, roles, and descriptions
 * - Collapsible live action logs for active agents
 * - Department Head execution plan inspector modal
 * - Live subscription to Orchestrator event streams
 * ==============================================================================
 */

(function () {
  'use strict';

  class AgentsController {
    constructor() {
      this.agents = [];
      this.activeFilter = 'all';
      this.searchQuery = '';
      this.activeProjectId = 1;

      this.dom = {
        statsTotal: null,
        statsActive: null,
        statsPlanned: null,
        filterButtons: null,
        searchInput: null,
        agentsGrid: null,
        planModal: null,
        planModalContent: null,
        planModalClose: null,
      };

      this.initialized = false;
    }

    /**
     * Initializes the controller once DOM is ready.
     */
    init() {
      if (this.initialized) return;

      this.dom.statsTotal = document.getElementById('agents-stat-total');
      this.dom.statsActive = document.getElementById('agents-stat-active');
      this.dom.statsPlanned = document.getElementById('agents-stat-planned');
      this.dom.searchInput = document.getElementById('agents-search-input');
      this.dom.agentsGrid = document.getElementById('agents-grid');
      this.dom.planModal = document.getElementById('agents-plan-modal');
      this.dom.planModalContent = document.getElementById('agents-plan-modal-content');
      this.dom.planModalClose = document.getElementById('agents-plan-modal-close');

      // Bind search input
      if (this.dom.searchInput) {
        this.dom.searchInput.addEventListener('input', (e) => {
          this.searchQuery = (e.target.value || '').trim().toLowerCase();
          this.renderGrid();
        });
      }

      // Bind department filter tabs
      const filterBtns = document.querySelectorAll('.agents-filter-btn');
      filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          filterBtns.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          this.activeFilter = btn.getAttribute('data-filter') || 'all';
          this.renderGrid();
        });
      });

      // Bind plan modal close
      if (this.dom.planModalClose && this.dom.planModal) {
        this.dom.planModalClose.addEventListener('click', () => {
          this.dom.planModal.classList.remove('active');
        });
        this.dom.planModal.addEventListener('click', (e) => {
          if (e.target === this.dom.planModal) {
            this.dom.planModal.classList.remove('active');
          }
        });
      }

      this.setupLiveEventBridge();
      this.initialized = true;
    }

    /**
     * Subscribes to live orchestrator events to update agent cards.
     */
    setupLiveEventBridge() {
      const orchestrator = window.orchestrator || window.api?.orchestrator;
      if (orchestrator && typeof orchestrator.onEvent === 'function') {
        try {
          orchestrator.onEvent((event) => {
            const { type, nodeId, data } = event;
            if (type === 'graph:started' || type === 'task:started' || type === 'task:completed' || type === 'task:waiting_for_user') {
              this.refreshAgentsData();
            }
          });
        } catch (e) {
          console.warn('[AgentsController] Could not bind orchestrator event listener:', e);
        }
      }
    }

    /**
     * Loads agent matrix data.
     */
    async load() {
      this.init();
      await this.refreshAgentsData();
    }

    /**
     * Fetches fresh agent list from backend bridge or fallback.
     */
    async refreshAgentsData() {
      try {
        const bridge = window.agents || window.api?.agents;
        if (bridge && typeof bridge.getAll === 'function') {
          const res = await bridge.getAll();
          if (Array.isArray(res) && res.length > 0) {
            this.agents = res;
          }
        }
      } catch (err) {
        console.warn('[AgentsController] Fetching from IPC failed, checking local store:', err.message);
      }

      // If still empty, populate comprehensive fallback matrix
      if (!this.agents || this.agents.length === 0) {
        this.agents = this.getFallbackMatrix();
      }

      this.updateStats();
      this.renderGrid();
    }

    /**
     * Updates header statistics banner.
     */
    updateStats() {
      const total = this.agents.length;
      const active = this.agents.filter((a) => a.status === 'Active').length;
      const planned = total - active;

      if (this.dom.statsTotal) this.dom.statsTotal.textContent = total;
      if (this.dom.statsActive) this.dom.statsActive.textContent = active;
      if (this.dom.statsPlanned) this.dom.statsPlanned.textContent = planned;
    }

    /**
     * Renders agent cards in grid based on current filter & search.
     */
    renderGrid() {
      if (!this.dom.agentsGrid) return;

      const filtered = this.agents.filter((agent) => {
        // Department filter match
        if (this.activeFilter !== 'all') {
          const deptMatch = agent.deptKey === this.activeFilter ||
            (agent.department || '').toLowerCase().includes(this.activeFilter.toLowerCase());
          if (!deptMatch) return false;
        }

        // Search query match
        if (this.searchQuery) {
          const q = this.searchQuery;
          const matchNum = String(agent.number || '').includes(q);
          const matchName = (agent.name || '').toLowerCase().includes(q);
          const matchRole = (agent.role || '').toLowerCase().includes(q);
          const matchDept = (agent.department || '').toLowerCase().includes(q);
          const matchDesc = (agent.description || '').toLowerCase().includes(q);
          return matchNum || matchName || matchRole || matchDept || matchDesc;
        }

        return true;
      });

      if (filtered.length === 0) {
        this.dom.agentsGrid.innerHTML = `
          <div class="agents-empty-state">
            <div class="agents-empty-icon">🔍</div>
            <div class="agents-empty-title">No agents match your criteria</div>
            <div class="agents-empty-desc">Try clearing the search query or switching department filter tabs.</div>
          </div>
        `;
        return;
      }

      this.dom.agentsGrid.innerHTML = filtered.map((agent) => this.renderAgentCard(agent)).join('');

      // Attach card button handlers
      this.dom.agentsGrid.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.getAttribute('data-action');
          const agentId = btn.getAttribute('data-agent-id');
          this.handleCardAction(action, agentId);
        });
      });
    }

    /**
     * Produces HTML string for a single agent card.
     * @param {object} agent
     * @returns {string}
     */
    renderAgentCard(agent) {
      const isActive = agent.status === 'Active';
      const actions = Array.isArray(agent.lastActions) ? agent.lastActions : [];
      const hasActions = actions.length > 0;

      // Department badge color class
      const deptClass = `dept-badge-${agent.deptKey || 'command'}`;

      let activeSectionHtml = '';
      if (isActive) {
        activeSectionHtml = `
          <div class="agent-activity-banner">
            <div class="agent-activity-dot"></div>
            <div class="agent-activity-text">
              <span class="agent-activity-label">Live Activity</span>
              <span class="agent-activity-desc">${this.escapeHtml(agent.currentActivity || 'Online & ready')}</span>
            </div>
          </div>

          ${hasActions ? `
            <div class="agent-actions-log">
              <div class="agent-actions-header">
                <span>Recent Actions (${actions.length})</span>
              </div>
              <ul class="agent-actions-list">
                ${actions.slice(0, 3).map((act) => `
                  <li class="agent-action-item">
                    <span class="action-bullet">•</span>
                    <span class="action-text">${this.escapeHtml(act.action)}</span>
                    <span class="action-time">${this.formatTime(act.timestamp)}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        `;
      }

      let cardActionButtons = '';
      if (isActive) {
        if (agent.number === 2) {
          cardActionButtons = `
            <div class="agent-card-footer">
              <button type="button" class="agent-card-btn primary" data-action="view-plan" data-agent-id="${agent.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                <span>View Department Plan</span>
              </button>
            </div>
          `;
        } else if (agent.number === 1) {
          cardActionButtons = `
            <div class="agent-card-footer">
              <button type="button" class="agent-card-btn primary" data-action="open-chat" data-agent-id="${agent.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <span>Talk to Agent</span>
              </button>
            </div>
          `;
        }
      } else {
        cardActionButtons = `
          <div class="agent-card-footer planned">
            <span class="planned-roadmap-tag">Roadmap • Planned for future phase</span>
          </div>
        `;
      }

      return `
        <div class="agent-card ${isActive ? 'card-active' : 'card-planned'}">
          <div class="agent-card-header">
            <div class="agent-card-meta">
              <span class="agent-number-pill">Agent ${agent.number}</span>
              <span class="agent-dept-tag ${deptClass}">${this.escapeHtml(agent.department || 'Department')}</span>
            </div>
            <div class="agent-status-badge ${isActive ? 'badge-active' : 'badge-planned'}">
              <span class="status-indicator-dot"></span>
              <span>${isActive ? 'Active' : 'Planned'}</span>
            </div>
          </div>

          <div class="agent-card-body">
            <h3 class="agent-card-name">${this.escapeHtml(agent.name)}</h3>
            <div class="agent-card-role">${this.escapeHtml(agent.role)}</div>
            <p class="agent-card-desc">${this.escapeHtml(agent.description || '')}</p>

            ${activeSectionHtml}
          </div>

          ${cardActionButtons}
        </div>
      `;
    }

    /**
     * Handles clicks on agent card buttons.
     * @param {string} action
     * @param {string} agentId
     */
    async handleCardAction(action, agentId) {
      if (action === 'open-chat') {
        if (window.AppNavigator) {
          window.AppNavigator.navigateTo('chat');
        }
      } else if (action === 'view-plan') {
        await this.showDepartmentPlanModal();
      }
    }

    /**
     * Shows modal with Department Head's execution plan.
     */
    async showDepartmentPlanModal() {
      if (!this.dom.planModal || !this.dom.planModalContent) return;

      let plan = null;
      try {
        const bridge = window.deptHead || window.api?.deptHead || window.agents || window.api?.agents;
        if (bridge && typeof bridge.getDeptHeadPlan === 'function') {
          plan = await bridge.getDeptHeadPlan(this.activeProjectId);
        } else if (bridge && typeof bridge.getPlan === 'function') {
          plan = await bridge.getPlan(this.activeProjectId);
        }
      } catch (err) {
        console.warn('[AgentsController] Could not fetch plan via bridge:', err);
      }

      if (!plan) {
        // Provide sample plan representation
        plan = {
          reasoning: 'Autonomous plan compiled for active project workspace.',
          summaryForUser: 'Standard multi-phase design and engineering plan orchestrated by Department Head.',
          phases: [
            {
              name: 'Phase 1: Architecture & Design System Baseline',
              description: 'Foundational framework setup, typography scales, and token architecture.',
              tasks: [
                { id: 'scaffold-setup', title: 'Scaffold Next.js & Tailwind Core', department: 'engineering', estimatedMinutes: 15 },
                { id: 'design-seed-tokens', title: 'Design Seed & Typography Scale', department: 'design', estimatedMinutes: 20 },
              ],
            },
            {
              name: 'Phase 2: Home Interface & Review Gate',
              description: 'Visual layout, component build, and user sign-off for Home view.',
              tasks: [
                { id: 'design-page-home', title: 'Design Home Layout & Wireframe', department: 'design', estimatedMinutes: 25 },
                { id: 'build-page-home', title: 'Implement Home Component & Interactions', department: 'engineering', estimatedMinutes: 30 },
                { id: 'review-gate-home', title: 'User Review Gate: Home Page', department: 'design', estimatedMinutes: 10 },
              ],
            },
            {
              name: 'Phase 3: Quality Assurance & Verification',
              description: 'Department-wide validation, responsive audit, and accessibility sign-off.',
              tasks: [
                { id: 'qa-responsive', title: 'Cross-Device & Viewport Inspection', department: 'qa', estimatedMinutes: 20 },
                { id: 'qa-a11y', title: 'Accessibility & WCAG AA Audit', department: 'qa', estimatedMinutes: 15 },
                { id: 'qa-final', title: 'Final Department Release Gate', department: 'qa', estimatedMinutes: 10 },
              ],
            },
          ],
        };
      }

      let totalTasks = 0;
      plan.phases.forEach((p) => { if (Array.isArray(p.tasks)) totalTasks += p.tasks.length; });

      this.dom.planModalContent.innerHTML = `
        <div class="plan-modal-summary-box">
          <div class="plan-modal-summary-headline">
            <span class="plan-status-pill">Active Execution Plan</span>
            <span class="plan-metric">${plan.phases.length} Phases • ${totalTasks} Tasks</span>
          </div>
          <p class="plan-modal-reasoning">${this.escapeHtml(plan.reasoning || plan.summaryForUser || '')}</p>
        </div>

        <div class="plan-modal-phases-container">
          ${plan.phases.map((phase, pIdx) => `
            <div class="plan-modal-phase-block">
              <div class="phase-block-header">
                <span class="phase-number-chip">Phase ${pIdx + 1}</span>
                <span class="phase-title-text">${this.escapeHtml(phase.name)}</span>
              </div>
              <p class="phase-desc-text">${this.escapeHtml(phase.description || '')}</p>
              <div class="phase-tasks-stack">
                ${(phase.tasks || []).map((t) => {
                  const isGate = t.id.startsWith('review-') || t.title.toLowerCase().includes('review') || t.title.toLowerCase().includes('gate');
                  return `
                    <div class="phase-task-pill ${isGate ? 'task-pill-gate' : ''}">
                      <span class="task-dept-badge dept-${this.escapeHtml(t.department || 'eng')}">${this.escapeHtml(t.department || 'eng').toUpperCase()}</span>
                      <span class="task-pill-name">${this.escapeHtml(t.title)}</span>
                      <span class="task-pill-time">${t.estimatedMinutes || 15}m</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;

      this.dom.planModal.classList.add('active');
    }

    /**
     * Fallback matrix of 46 agents if IPC bridge is unavailable.
     */
    getFallbackMatrix() {
      return [
        { number: 1, id: 'agent-1-senior-chat', name: 'Senior Chat Agent', role: 'Senior Project Lead & Requirements Lead', department: 'A: Command & Creative', deptKey: 'command', status: 'Active', currentActivity: 'Listening for client directives & conducting discovery interviews', description: 'Conducts proactive onboarding interviews, classifies user intent, enforces exact/self design rules, maintains architectural checklist, and triggers project handoffs.' },
        { number: 2, id: 'agent-2-dept-head', name: 'Department Head', role: 'Executive Director & Task Graph Architect', department: 'A: Command & Creative', deptKey: 'command', status: 'Active', currentActivity: 'Standing by for project handoff & task graph compilation', description: 'Translates Project Knowledge Store briefs into dependency-ordered multi-phase execution plans, dispatches Task Graphs, and orchestrates department review gates.' },
        { number: 3, id: 'agent-3-creative-director', name: 'Creative Director', role: 'Aesthetic Vision & Brand Archetype Guardian', department: 'A: Command & Creative', deptKey: 'command', status: 'Planned', description: 'Sets global aesthetic vision, brand personality, and visual tone of voice across web applications.' },
        { number: 4, id: 'agent-4-brand-architect', name: 'Brand Architect', role: 'Identity & Guidelines Specialist', department: 'A: Command & Creative', deptKey: 'command', status: 'Planned', description: 'Formalizes brand identity rules, logo usage principles, and multi-surface style guide documentation.' },
        { number: 5, id: 'agent-5-design-seed-engine', name: 'Design Seed Engine', role: 'Autonomous Concept Generator', department: 'A: Command & Creative', deptKey: 'command', status: 'Planned', description: 'Generates creative, bespoke visual themes with high typographic contrast and distinctive spatial layouts.' },
        { number: 6, id: 'agent-6-project-synthesizer', name: 'Project Synthesizer', role: 'Multi-Document Harmonizer', department: 'A: Command & Creative', deptKey: 'command', status: 'Planned', description: 'Synchronizes cross-document requirements between design tokens, page hierarchies, and technical briefs.' },

        { number: 7, id: 'agent-7-layout-architect', name: 'Layout & Spatial Architect', role: '8pt Rhythmic Grid & Layout Engineer', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Engineers responsive container grids, flexbox stacks, and mathematical spacing rhythm.' },
        { number: 8, id: 'agent-8-typography-director', name: 'Typography Director', role: 'Type Hierarchy & Optical Scaling Lead', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Establishes mathematical font scales, line heights, letter-tracking, and font pairing architectures.' },
        { number: 9, id: 'agent-9-color-specialist', name: 'Color & Palette Specialist', role: 'HSB Harmony & Contrast Engineer', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Generates semantic color tokens, dark/light theme maps, and strictly validates WCAG AA ratios.' },
        { number: 10, id: 'agent-10-motion-designer', name: 'Motion & Animation Designer', role: 'Micro-Interactions & Transitions Lead', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Designs tactile button feedback, cubic-bezier timing curves, and page entry transitions.' },
        { number: 11, id: 'agent-11-vector-artist', name: 'Iconography & Vector Artist', role: 'Visual Icon Graph Curator', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Selects and aligns Lucide SVG icons with uniform stroke weights and optical bounding boxes.' },
        { number: 12, id: 'agent-12-component-architect', name: 'Component Architect', role: 'Design System Units Specialist', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Defines reusable atomic components, variants, hover states, and design token connections.' },
        { number: 13, id: 'agent-13-visual-critic', name: 'Visual Hierarchy Critic', role: 'Anti-Slop & Density Inspector', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Eliminates AI clichés, generic purple gradients, nested cards, and ungrounded decorative elements.' },
        { number: 14, id: 'agent-14-asset-curator', name: 'Asset & Media Curator', role: 'Image Pipeline & Aspect Ratio Lead', department: 'B: Design Intelligence', deptKey: 'design', status: 'Planned', description: 'Optimizes image formats, dimensions, responsive picture elements, and asset caching rules.' },

        { number: 15, id: 'agent-15-nextjs-architect', name: 'Next.js App Architect', role: 'App Router & Server Component Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Architects Next.js 14+ App Router directory structures, layouts, and server component boundaries.' },
        { number: 16, id: 'agent-16-tailwind-engineer', name: 'Tailwind CSS Master', role: 'Zero-CSS Utility Specialist', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Compiles clean utility class hierarchies, responsive breakpoints, and custom theme token mappings.' },
        { number: 17, id: 'agent-17-html-specialist', name: 'HTML5 Semantic Specialist', role: 'Semantic Markup & Landmark Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Ensures structural semantic HTML with proper landmarks, headings hierarchy, and accessibility attributes.' },
        { number: 18, id: 'agent-18-vanilla-engineer', name: 'Vanilla JS & DOM Engineer', role: 'High-Performance Event Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Builds lightweight, zero-dependency client logic, modal triggers, and clean DOM event listeners.' },
        { number: 19, id: 'agent-19-shadcn-assembler', name: 'shadcn/ui Assembler', role: 'Radix Primitive & Component Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Integrates Radix UI primitives, accessible dialogs, tooltips, and dropdown menus seamlessly.' },
        { number: 20, id: 'agent-20-state-architect', name: 'State Machine Architect', role: 'Predictable Data Flow Specialist', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Manages client state machines, validation states, optimistic UI updates, and data synchronization.' },
        { number: 21, id: 'agent-21-api-integrator', name: 'API & Fetch Integrator', role: 'Type-Safe Server Route Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Constructs secure backend API routes, fetch handlers, and request caching mechanisms.' },
        { number: 22, id: 'agent-22-css-architect', name: 'CSS Architecture Specialist', role: 'Token Isolation & Variables Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Maintains scoped CSS variables, typography tokens, and hardware-accelerated animations.' },
        { number: 23, id: 'agent-23-responsive-engineer', name: 'Responsive Viewport Engineer', role: 'Fluid Viewport Optimization Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Fine-tunes mobile drawers, touch targets (>=44px), desktop multi-columns, and ultra-wide clamping.' },
        { number: 24, id: 'agent-24-bundle-optimizer', name: 'Build & Bundle Optimizer', role: 'Performance & Tree-Shaking Lead', department: 'C: Engineering', deptKey: 'engineering', status: 'Planned', description: 'Minimizes bundle sizes, optimizes font loading, and eliminates unused CSS and script imports.' },

        { number: 25, id: 'agent-25-ux-copywriter', name: 'UX Copywriter', role: 'Conversion Copy & Voice Specialist', department: 'D: Content & Media', deptKey: 'content', status: 'Planned', description: 'Writes crisp, value-driven headlines, benefits copy, and human-centered onboarding narratives.' },
        { number: 26, id: 'agent-26-content-architect', name: 'Content Architect', role: 'Information Architecture Specialist', department: 'D: Content & Media', deptKey: 'content', status: 'Planned', description: 'Structures page narrative flows, section groupings, FAQs, and scannable content hierarchies.' },
        { number: 27, id: 'agent-27-tech-writer', name: 'Technical Documentation Lead', role: 'Developer Docs & Specs Specialist', department: 'D: Content & Media', deptKey: 'content', status: 'Planned', description: 'Authors clear README files, component API documentation, and deployment guides.' },
        { number: 28, id: 'agent-28-seo-strategist', name: 'SEO & Metadata Strategist', role: 'OpenGraph & JSON-LD Architect', department: 'D: Content & Media', deptKey: 'content', status: 'Planned', description: 'Implements structured rich snippets, meta descriptions, canonical URLs, and social sharing cards.' },
        { number: 29, id: 'agent-29-microcopy-specialist', name: 'Microcopy Specialist', role: 'Tactile Label & Feedback Copy Lead', department: 'D: Content & Media', deptKey: 'content', status: 'Planned', description: 'Refines button labels, validation warnings, tooltip guidance, and success state microcopy.' },
        { number: 30, id: 'agent-30-localization-lead', name: 'Localization & Multi-Lang Lead', role: 'i18n & Multi-Language Specialist', department: 'D: Content & Media', deptKey: 'content', status: 'Planned', description: 'Coordinates internationalization, RTL layout support, and multi-language string dictionaries.' },

        { number: 31, id: 'agent-31-db-timing-director', name: 'Database Timing Director', role: 'Schema Deferral & Policy Guardian', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Guarantees database setup respects user preference and pauses schema generation until visual UI sign-off.' },
        { number: 32, id: 'agent-32-supabase-architect', name: 'Supabase / Postgres Architect', role: 'Relational DDL & RLS Specialist', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Designs PostgreSQL schemas, foreign key relationships, migration scripts, and Row Level Security.' },
        { number: 33, id: 'agent-33-sqlite-engineer', name: 'SQLite Embedded Engineer', role: 'Local-First Data Cache Lead', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Manages embedded desktop SQLite stores, WAL mode, transaction checkpoints, and offline sync.' },
        { number: 34, id: 'agent-34-auth-specialist', name: 'Auth & Session Specialist', role: 'Token Lifecycle & Security Lead', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Implements OAuth2 flows, cookie security, session management, and protected client routes.' },
        { number: 35, id: 'agent-35-headless-cms', name: 'Headless CMS Integrator', role: 'Content Model & Webhook Specialist', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Bridges headless CMS schemas (Sanity, Strapi, Contentful) to dynamic front-end page renderers.' },
        { number: 36, id: 'agent-36-realtime-engineer', name: 'Realtime & WebSocket Engineer', role: 'Live Event Pipeline Lead', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Establishes bidirectional event channels for live collaboration, notifications, and telemetry streams.' },
        { number: 37, id: 'agent-37-storage-architect', name: 'Storage & Asset CDN Architect', role: 'Bucket & Asset Distribution Lead', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Configures cloud storage buckets, pre-signed upload URLs, and asset CDN caching headers.' },
        { number: 38, id: 'agent-38-security-auditor', name: 'Security & Rule Auditor', role: 'Data Sanitization & XSS Guard', department: 'E: CMS & Backend', deptKey: 'cms', status: 'Planned', description: 'Audits inputs for SQL injection, cross-site scripting, and unauthorized API parameter pollution.' },

        { number: 39, id: 'agent-39-visual-qa', name: 'Visual Regression Inspector', role: 'Pixel Comparison & Layout Drift Lead', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Captures visual baselines to identify unintended style changes, padding shifts, or clipping.' },
        { number: 40, id: 'agent-40-a11y-auditor', name: 'Accessibility & WCAG Auditor', role: 'AA/AAA Contrast & Keyboard Nav Lead', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Verifies ARIA tags, tab focus rings, screen reader compatibility, and minimum color contrast.' },
        { number: 41, id: 'agent-41-cross-device', name: 'Cross-Device Viewport Tester', role: 'Device Matrix & Touch Target Lead', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Validates behavior across iPhone, iPad, Android, standard desktop, and 4K widescreen displays.' },
        { number: 42, id: 'agent-42-perf-auditor', name: 'Performance & Web Vitals Lead', role: 'LCP, CLS & Frame Budget Specialist', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Audits Core Web Vitals, Cumulative Layout Shift, Largest Contentful Paint, and memory leaks.' },
        { number: 43, id: 'agent-43-form-validator', name: 'Form & Input State Validator', role: 'Error Boundary & Edge Case Lead', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Tests empty states, long text overflow, invalid email formats, and disabled button behavior.' },
        { number: 44, id: 'agent-44-link-checker', name: 'Broken Link & Asset Checker', role: 'Asset Integrity & 404 Prevention Lead', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Crawls all internal anchors, image sources, and external links to ensure 100% resolution.' },
        { number: 45, id: 'agent-45-code-inspector', name: 'Code Quality & Linter Inspector', role: 'Syntax, Imports & Clean Code Guard', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Enforces ESLint standards, cleans unused imports, and validates TypeScript strict type safety.' },
        { number: 46, id: 'agent-46-release-gatekeeper', name: 'Final Sign-off Release Gatekeeper', role: 'Production Deployment Validator', department: 'F: Quality & Verification', deptKey: 'qa', status: 'Planned', description: 'Executes pre-flight checklist before production bundle compilation, export, and release packaging.' },
      ];
    }

    formatTime(isoStr) {
      if (!isoStr) return '';
      try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    }

    escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  }

  const agentsController = new AgentsController();
  window.AgentsController = agentsController;

  document.addEventListener('DOMContentLoaded', () => {
    if (window.AgentsController) {
      window.AgentsController.load();
    }
  });
})();
