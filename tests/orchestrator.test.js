/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — ORCHESTRATOR & TASK GRAPH TEST SUITE
 * ==============================================================================
 * Comprehensive automated verification tests for Phase 4:
 * 1. HandlerRegistry: registration, resolution, missing handler errors
 * 2. TaskGraph: validation, duplicate IDs, cycle detection, ready nodes, skipped propagation
 * 3. EventBus: pub/sub, SQLite persistence
 * 4. TaskRunner & DemoHandlers: wait, ai-ping, fail-test retry logic
 * 5. Orchestrator: full DAG execution, pause/resume, cancel, SQLite persistence
 * ==============================================================================
 */

const assert = require('assert');
const Database = require('better-sqlite3');
const { HandlerRegistry } = require('../core/handler-registry');
const {
  createGraph,
  getReadyNodes,
  getExecutionOrder,
  propagateSkipped,
  getNodeStats,
  NodeState,
  GraphState,
} = require('../core/task-graph');
const { OrchestratorEventBus } = require('../core/event-bus');
const { TaskRunner } = require('../core/task-runner');
const { registerDemoHandlers } = require('../core/demo-handlers');
const { Orchestrator } = require('../core/orchestrator');
const { migrations } = require('../db/migrations');

// Helper to create an in-memory DB with all migrations applied
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS _schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);');
  for (const m of migrations) {
    m.up(db);
    db.prepare("INSERT INTO _schema_migrations (version, name, applied_at) VALUES (?, ?, datetime('now'))").run(m.version, m.name);
  }
  return db;
}

async function runTests() {
  console.log('--- STARTING PHASE 4 ORCHESTRATOR TEST SUITE ---');

  // TEST 1: HandlerRegistry
  console.log('\n[Test 1] HandlerRegistry tests...');
  {
    const registry = new HandlerRegistry();
    assert.strictEqual(registry.listHandlers().length, 0);

    registry.registerHandler('test.echo', async ({ params }) => ({ success: true, output: params }));
    assert.strictEqual(registry.hasHandler('test.echo'), true);
    assert.strictEqual(registry.hasHandler('test.nonexistent'), false);

    const fn = registry.getHandler('test.echo');
    const res = await fn({ params: { msg: 'hello' } });
    assert.deepStrictEqual(res, { success: true, output: { msg: 'hello' } });

    assert.throws(
      () => registry.getHandler('unknown.agent'),
      /No handler registered for 'unknown.agent'/
    );
    console.log('✓ HandlerRegistry verified.');
  }

  // TEST 2: TaskGraph Validation & Cycle Detection
  console.log('\n[Test 2] TaskGraph Validation & Cycle Detection...');
  {
    // A. Valid graph
    const valid = createGraph({
      name: 'Valid Pipeline',
      nodes: [
        { id: 'node-1', handler: 'demo.wait', dependsOn: [] },
        { id: 'node-2', handler: 'demo.wait', dependsOn: ['node-1'] },
      ],
    });
    assert.strictEqual(valid.nodes.length, 2);
    assert.strictEqual(valid.nodes[0].status, NodeState.PENDING);

    // B. Duplicate node ID detection
    assert.throws(
      () => createGraph({
        nodes: [
          { id: 'dup-1', handler: 'demo.wait' },
          { id: 'dup-1', handler: 'demo.wait' },
        ],
      }),
      /Duplicate node ID "dup-1"/
    );

    // C. Unknown dependency detection
    assert.throws(
      () => createGraph({
        nodes: [
          { id: 'node-a', handler: 'demo.wait', dependsOn: ['phantom-node'] },
        ],
      }),
      /Unknown dependency.*phantom-node/
    );

    // D. Self-dependency detection
    assert.throws(
      () => createGraph({
        nodes: [
          { id: 'loop-node', handler: 'demo.wait', dependsOn: ['loop-node'] },
        ],
      }),
      /Self-dependency detected/
    );

    // E. 2-node cycle detection (A -> B -> A)
    assert.throws(
      () => createGraph({
        nodes: [
          { id: 'A', handler: 'demo.wait', dependsOn: ['B'] },
          { id: 'B', handler: 'demo.wait', dependsOn: ['A'] },
        ],
      }),
      /Cycle detected in task graph/
    );

    // F. 3-node cycle detection (A -> B -> C -> A)
    assert.throws(
      () => createGraph({
        nodes: [
          { id: 'A', handler: 'demo.wait', dependsOn: ['C'] },
          { id: 'B', handler: 'demo.wait', dependsOn: ['A'] },
          { id: 'C', handler: 'demo.wait', dependsOn: ['B'] },
        ],
      }),
      /Cycle detected in task graph/
    );

    // G. Topological sort order & ready nodes
    const dag = createGraph({
      nodes: [
        { id: 'root-1', handler: 'demo.wait', dependsOn: [], priority: 2 },
        { id: 'root-2', handler: 'demo.wait', dependsOn: [], priority: 1 },
        { id: 'join', handler: 'demo.wait', dependsOn: ['root-1', 'root-2'], priority: 1 },
      ],
    });

    const readyInitial = getReadyNodes(dag);
    assert.strictEqual(readyInitial.length, 2);
    assert.strictEqual(readyInitial[0].id, 'root-2'); // priority 1 before priority 2
    assert.strictEqual(readyInitial[1].id, 'root-1');

    const order = getExecutionOrder(dag);
    assert.ok(order.indexOf('join') > order.indexOf('root-1'));
    assert.ok(order.indexOf('join') > order.indexOf('root-2'));

    // H. Failure propagation / skipped nodes
    dag.nodes.find((n) => n.id === 'root-1').status = NodeState.FAILED;
    const newlySkipped = propagateSkipped(dag, 'root-1');
    assert.deepStrictEqual(newlySkipped, ['join']);
    assert.strictEqual(dag.nodes.find((n) => n.id === 'join').status, NodeState.SKIPPED);

    console.log('✓ TaskGraph validation, cycle detection, sorting, and skipping verified.');
  }

  // TEST 3: EventBus & SQLite Audit
  console.log('\n[Test 3] EventBus & Persistence...');
  {
    const db = createTestDb();
    const eventBus = new OrchestratorEventBus();
    eventBus.setDb(db);

    let received = null;
    eventBus.on('task:progress', (e) => {
      received = e;
    });

    eventBus.publish('task:progress', {
      graphId: 'test-g-1',
      nodeId: 'node-1',
      data: { progress: 75, message: 'processing' },
    });

    assert.ok(received);
    assert.strictEqual(received.data.progress, 75);

    // Verify row in task_events table
    const row = db.prepare('SELECT * FROM task_events WHERE graph_id = ?').get('test-g-1');
    assert.ok(row);
    assert.strictEqual(row.event_type, 'task:progress');
    assert.strictEqual(row.node_id, 'node-1');
    assert.strictEqual(JSON.parse(row.data_json).progress, 75);
    console.log('✓ EventBus pub/sub and SQLite persistence verified.');
  }

  // TEST 4: TaskRunner & Demo Handlers
  console.log('\n[Test 4] TaskRunner & Demo Handlers...');
  {
    registerDemoHandlers();
    const db = createTestDb();
    const runner = new TaskRunner({ db, retryDelayMs: 100 });

    // A. demo.wait handler
    const waitNode = {
      id: 'wait-test',
      handler: 'demo.wait',
      params: { durationMs: 300 },
      maxRetries: 0,
      timeoutMs: 5000,
    };
    const waitGraph = { graphId: 'g-wait' };
    const waitRes = await runner.runNode(waitGraph, waitNode);
    assert.strictEqual(waitRes.success, true);
    assert.strictEqual(waitNode.status, NodeState.COMPLETED);
    assert.strictEqual(waitNode.progressPercent, 100);

    // B. demo.fail-test handler with retries
    const failNode = {
      id: 'fail-test',
      handler: 'demo.fail-test',
      params: { failFirstTime: true },
      maxRetries: 2,
      timeoutMs: 5000,
    };
    const failGraph = { graphId: 'g-fail' };
    const failRes = await runner.runNode(failGraph, failNode);
    assert.strictEqual(failRes.success, true);
    assert.strictEqual(failNode.status, NodeState.COMPLETED);
    assert.strictEqual(failNode.attempts, 2); // succeeded on retry attempt 2!
    assert.strictEqual(failNode.output.recoveredOnAttempt, 2);

    // C. Missing handler error handling (shields app, doesn't crash)
    const missingNode = {
      id: 'missing-test',
      handler: 'nonexistent.agent',
      maxRetries: 0,
      timeoutMs: 2000,
    };
    const missingRes = await runner.runNode(failGraph, missingNode);
    assert.strictEqual(missingRes.success, false);
    assert.strictEqual(missingNode.status, NodeState.FAILED);
    assert.ok(missingRes.error.includes('No handler registered for \'nonexistent.agent\''));

    console.log('✓ TaskRunner and demo handlers verified.');
  }

  // TEST 5: Orchestrator Full Pipeline Execution & Persistence
  console.log('\n[Test 5] Orchestrator Full Pipeline & SQLite Persistence...');
  {
    const db = createTestDb();
    const mockAiHandler = {
      generate: async () => ({
        success: true,
        content: 'OK',
        model: 'gemini-1.5-pro',
      }),
    };

    const orchestrator = new Orchestrator({ db, maxConcurrency: 3 });
    orchestrator.init(db, mockAiHandler);

    // Build the 4-node canonical demo pipeline
    const demoSpec = orchestrator.buildDemoGraph();
    // Reduce durations for fast automated test execution
    demoSpec.nodes.find((n) => n.id === 'demo-wait-1').params.durationMs = 200;
    demoSpec.nodes.find((n) => n.id === 'demo-wait-final').params.durationMs = 150;
    orchestrator.runner.retryDelayMs = 100;

    console.log('Executing test DAG pipeline...');
    const result = await orchestrator.runGraph(demoSpec);

    assert.strictEqual(result.status, GraphState.COMPLETED);
    assert.strictEqual(result.nodeStats.total, 4);
    assert.strictEqual(result.nodeStats.completed, 4);
    assert.strictEqual(result.nodeStats.failed, 0);
    assert.strictEqual(result.nodeStats.skipped, 0);

    // Verify persistence in SQLite
    const graphRow = db.prepare('SELECT * FROM task_graphs WHERE graph_id = ?').get(demoSpec.graphId);
    assert.ok(graphRow);
    assert.strictEqual(graphRow.status, GraphState.COMPLETED);

    const taskRows = db.prepare('SELECT * FROM tasks WHERE graph_id = ?').all(demoSpec.graphId);
    assert.strictEqual(taskRows.length, 4);
    for (const t of taskRows) {
      assert.strictEqual(t.status, NodeState.COMPLETED);
    }

    const eventsRows = db.prepare('SELECT * FROM task_events WHERE graph_id = ?').all(demoSpec.graphId);
    assert.ok(eventsRows.length >= 8); // start, progress, completion events

    // Verify history query
    const history = orchestrator.getGraphHistory(5);
    assert.ok(history.length >= 1);
    assert.strictEqual(history[0].graphId, demoSpec.graphId);

    // Verify detail query
    const detail = orchestrator.getGraphDetail(demoSpec.graphId);
    assert.ok(detail.graph);
    assert.strictEqual(detail.nodes.length, 4);

    console.log('✓ Orchestrator full pipeline, state transitions, and SQLite persistence verified.');
  }

  // TEST 6: Pause and Resume Controls
  console.log('\n[Test 6] Orchestrator Pause and Resume...');
  {
    const db = createTestDb();
    const orchestrator = new Orchestrator({ db, maxConcurrency: 1 });
    orchestrator.init(db);

    const pauseDag = {
      name: 'Pause Test DAG',
      maxConcurrency: 1,
      nodes: [
        { id: 'p-node-1', handler: 'demo.wait', params: { durationMs: 400 }, dependsOn: [] },
        { id: 'p-node-2', handler: 'demo.wait', params: { durationMs: 200 }, dependsOn: ['p-node-1'] },
      ],
    };

    const runPromise = orchestrator.runGraph(pauseDag);

    // Pause while node 1 is running
    await new Promise((r) => setTimeout(r, 100));
    const pauseRes = orchestrator.pauseGraph(pauseDag.graphId);
    assert.strictEqual(pauseRes.success, true);

    // Wait for node 1 to complete; node 2 should stay pending because graph is paused
    await new Promise((r) => setTimeout(r, 500));
    const active = orchestrator.activeGraphs.get(pauseDag.graphId);
    const node1 = active.nodes.find((n) => n.id === 'p-node-1');
    const node2 = active.nodes.find((n) => n.id === 'p-node-2');
    assert.strictEqual(node1.status, NodeState.COMPLETED);
    assert.strictEqual(node2.status, NodeState.PENDING);
    assert.strictEqual(active.status, GraphState.PAUSED);

    // Resume graph
    const resumeRes = orchestrator.resumeGraph(pauseDag.graphId);
    assert.strictEqual(resumeRes.success, true);

    const finalResult = await runPromise;
    assert.strictEqual(finalResult.status, GraphState.COMPLETED);
    assert.strictEqual(node2.status, NodeState.COMPLETED);
    console.log('✓ Orchestrator Pause and Resume verified.');
  }

  // TEST 7: Cancel Control
  console.log('\n[Test 7] Orchestrator Cancel...');
  {
    const db = createTestDb();
    const orchestrator = new Orchestrator({ db });
    orchestrator.init(db);

    const cancelDag = {
      name: 'Cancel Test DAG',
      nodes: [
        { id: 'c-node-1', handler: 'demo.wait', params: { durationMs: 2000 }, dependsOn: [] },
        { id: 'c-node-2', handler: 'demo.wait', params: { durationMs: 1000 }, dependsOn: ['c-node-1'] },
      ],
    };

    const runPromise = orchestrator.runGraph(cancelDag);
    await new Promise((r) => setTimeout(r, 150));

    const cancelRes = orchestrator.cancelGraph(cancelDag.graphId);
    assert.strictEqual(cancelRes.success, true);

    const finalResult = await runPromise;
    assert.strictEqual(finalResult.status, GraphState.CANCELLED);
    console.log('✓ Orchestrator Cancel verified.');
  }

  console.log('\n=============================================');
  console.log(' ALL PHASE 4 ORCHESTRATOR TESTS PASSED! ');
  console.log('=============================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
