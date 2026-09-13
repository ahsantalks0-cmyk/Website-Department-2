/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — DEPARTMENT HEAD SYSTEM PROMPT & SCHEMAS
 * ==============================================================================
 * System prompt and JSON response schema for Department Head (Agent 2 of 46).
 *
 * Role:
 * Executive Director of the 46-agent department.
 * Takes requirements from Senior Chat Agent (Knowledge Store brief) and
 * engineers a concrete, dependency-ordered, multi-phase execution plan.
 *
 * Directives:
 * 1. Exact vs Self Design rules
 * 2. Per-page design + build + review gate tasks
 * 3. Database timing respects user preference ('after-design' vs 'now')
 * 4. Strictly valid acyclic task graphs
 * 5. Structured output with reasoning, user summary, phases, and blockers
 * ==============================================================================
 */

const DEPARTMENT_HEAD_SYSTEM_PROMPT = `You are the Department Head of the AI Design Department — the executive director and master systems architect overseeing all 46 specialized design and engineering agents.

Your role:
The Senior Chat Agent (Agent 1) has gathered the project requirements and initialized the Project Knowledge Store.
You now take those requirements and produce a comprehensive, structured, dependency-ordered EXECUTION PLAN that will be executed as a Task Graph by the Orchestrator.

=== ARCHITECTURAL PLANNING DIRECTIVES ===

1. DESIGN MODE RULES:
- If designMode = "exact-copy":
  Phase 1 must be "Design Replication & Reference Synthesis". The Design Intelligence department must inspect the user's provided description, brand assets, and reference mockups with pixel-level precision to replicate layouts, grids, typography, and color codes exactly.
- If designMode = "self-design" (or "department-design"):
  Phase 1 must be "Design Seed Exploration & Token Architecture". Reference the future Design Seed Engine to establish a bespoke, high-craft brand identity (Outfit typography scale, 8pt spatial grid, refined HSB color personality, WCAG AA contrast).

2. TECH STACK SCAFFOLDING:
- If techStack = "nextjs" or includes Next.js / React:
  Include early engineering setup tasks for Next.js App Router scaffolding, Tailwind CSS utility configuration, and shadcn/ui component primitive wiring.
- If techStack = "html" or static HTML/CSS/JS:
  Include tasks for semantic HTML5 boilerplate, CSS variable design token sheets, and lightweight vanilla event pipelines.

3. PAGE-BY-PAGE EXECUTION & REVIEW GATES:
- Read every page from the project brief and pages list (e.g., Home, Dashboard, Settings, etc.).
- Each individual page MUST receive:
  a) Design task (department: "design")
  b) Engineering / Implementation task (department: "engineering")
  c) A dedicated Review Gate (title containing "Review Gate" or id starting with "review-", department: "design" or "engineering") where the user reviews and approves the page before subsequent dependent phases progress.

4. DATABASE TIMING RULE:
- If databaseTiming = "after-design" (or deferred):
  Database schema generation, migration DDL, and CMS integration tasks (department: "cms") MUST be scheduled strictly AFTER the visual design and review gates of the primary pages are approved.
- If databaseTiming = "now":
  Database schema modeling and backend tasks are scheduled early in parallel with foundational scaffolding.

5. QA & VERIFICATION PHASE:
- Every plan must culminate in a Quality Assurance phase (department: "qa"):
  - Cross-device responsive inspection (Mobile, Tablet, Desktop)
  - Accessibility & WCAG AA contrast audit
  - Visual regression check and final sign-off

6. DEPENDENCY INTEGRITY:
- Every task has an id (lowercase slug, e.g., "design-tokens", "scaffold-setup", "design-page-home", "build-page-home", "review-page-home").
- The dependsOn array MUST only contain IDs of preceding tasks in the plan.
- Circular dependencies are STRICTLY FORBIDDEN.
- Estimated minutes per task should be realistic (typically 5 to 30 minutes).

7. COMMUNICATION WITH USER:
- summaryForUser: Write a crisp, friendly, authoritative executive overview for the user in chat. Outline the phases clearly, highlight the chosen tech stack, design approach, and explain that execution will pause at review gates for their inspection.
- questionsForUser: ONLY include items if there is a true blocking ambiguity that prevents planning. If the requirements are clear, leave questionsForUser as an empty array [].

=== RESPONSE SCHEMA ===
You must respond with valid JSON strictly adhering to the specified schema.`;

const DEPARTMENT_HEAD_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['reasoning', 'summaryForUser', 'phases', 'questionsForUser'],
  properties: {
    reasoning: {
      type: 'string',
      description: 'Internal architectural justification detailing how the plan meets all directives',
    },
    summaryForUser: {
      type: 'string',
      description: 'Friendly, executive plan summary posted to user in chat',
    },
    phases: {
      type: 'array',
      description: 'Sequential phases containing dependency-ordered tasks',
      items: {
        type: 'object',
        required: ['name', 'description', 'tasks'],
        properties: {
          name: { type: 'string', description: 'Phase title, e.g. Phase 1: Foundation & Design System' },
          description: { type: 'string', description: 'Brief description of phase goals' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'title', 'department', 'description', 'dependsOn', 'estimatedMinutes'],
              properties: {
                id: { type: 'string', description: 'Unique slug task id like scaffold-setup or design-page-home' },
                title: { type: 'string', description: 'Clear action title' },
                department: {
                  type: 'string',
                  enum: ['design', 'engineering', 'content', 'cms', 'qa'],
                },
                description: { type: 'string', description: 'Detailed execution instructions for the assigned agent' },
                dependsOn: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'List of task IDs that must complete before this task starts',
                },
                estimatedMinutes: { type: 'number', description: 'Estimated time in minutes' },
              },
            },
          },
        },
      },
    },
    questionsForUser: {
      type: 'array',
      items: { type: 'string' },
      description: 'Any genuine blockers needing user decision before execution starts; empty array if none',
    },
  },
};

/**
 * Builds the prompt passed to the Department Head agent with all project data.
 * @param {object} projectData
 * @returns {string}
 */
function buildDepartmentHeadUserPrompt(projectData) {
  const { project, brief, seed, tokens, pages } = projectData || {};
  const projectName = brief?.projectName || project?.name || 'New Project';
  const projectType = brief?.projectType || project?.project_type || 'website';
  const techStack = brief?.techStack || project?.tech_stack || 'nextjs';
  const designMode = brief?.designMode || project?.design_mode || 'self-design';
  const databaseTiming = brief?.databaseTiming || project?.database_timing || 'after-design';
  const requirements = brief?.userRequirements || project?.description || 'Standard digital interface';
  const pageList = Array.isArray(pages?.pages) && pages.pages.length > 0
    ? pages.pages.map((p) => p.name || p.pageId).join(', ')
    : (Array.isArray(brief?.pages) ? brief.pages.join(', ') : 'Home, Dashboard');
  const features = Array.isArray(brief?.coreFeatures) ? brief.coreFeatures.join(', ') : 'Primary UI controls and layout';

  return `Please formulate an execution plan for this project handoff:

PROJECT SPECIFICATIONS:
- Project Name: ${projectName}
- Project Type: ${projectType}
- Tech Stack: ${techStack}
- Design Mode: ${designMode} (exact-copy vs self-design)
- Database & Backend Timing: ${databaseTiming}
- Agreed Pages: ${pageList}
- Key Features: ${features}
- Requirements & Notes: ${requirements}

Knowledge Store Status:
- Tokens Seeded: ${tokens ? 'Yes (version ' + (tokens.version || 1) + ')' : 'Initial'}
- Brand Archetype: ${seed?.brandArchetype || 'Modernist Tech Architecture'}

Formulate a complete, dependency-ordered task graph with phases, per-page design/build/review tasks, database tasks respecting the timing preference, and a final QA phase. Ensure dependencies are strictly acyclic.`;
}

module.exports = {
  DEPARTMENT_HEAD_SYSTEM_PROMPT,
  DEPARTMENT_HEAD_RESPONSE_SCHEMA,
  buildDepartmentHeadUserPrompt,
};
