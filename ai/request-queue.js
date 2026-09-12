/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — REQUEST QUEUE & RATE LIMITER (ai/request-queue.js)
 * ==============================================================================
 * Protects free-tier rate limits and stabilizes concurrent LLM requests:
 * - Concurrency limit: max 2 active requests
 * - Sliding window rate limiter: 8 requests per 60 seconds
 * - FIFO queue: pending requests wait safely without dropping
 * - Auto-retry: exponential backoff (2s -> 4s -> 8s) on 429 and 5xx errors
 * - 120s timeout per execution with AbortController
 * - Audit logging: records every execution into SQLite `ai_usage` table
 * ==============================================================================
 */

class RequestQueue {
  /**
   * @param {object} options
   * @param {number} [options.maxConcurrent=2]
   * @param {number} [options.rateLimit=8]
   * @param {number} [options.rateLimitWindowMs=60000]
   * @param {number} [options.timeoutMs=120000]
   * @param {number} [options.maxRetries=3]
   * @param {import('better-sqlite3').Database} [options.db]
   */
  constructor(options = {}) {
    this.maxConcurrent = options.maxConcurrent || 2;
    this.rateLimit = options.rateLimit || 8;
    this.rateLimitWindowMs = options.rateLimitWindowMs || 60000;
    this.timeoutMs = options.timeoutMs || 120000;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 3;
    this.db = options.db || null;

    this.activeCount = 0;
    this.queue = [];
    this.requestTimestamps = [];
    this.drainTimer = null;
  }

  /**
   * Updates the database instance reference for usage logging.
   * @param {import('better-sqlite3').Database} db
   */
  setDb(db) {
    this.db = db;
  }

  /**
   * Calculates backoff delay in milliseconds.
   * Attempt 1 -> 2000ms, Attempt 2 -> 4000ms, Attempt 3 -> 8000ms
   * @param {number} attemptIndex
   * @returns {number}
   */
  getBackoffDelay(attemptIndex) {
    return Math.pow(2, attemptIndex) * 1000;
  }

  /**
   * Adds an execution job to the queue and returns a Promise that resolves
   * when the request has executed (or completely exhausted retries).
   *
   * @param {Function} executionFn - Async function (signal) => Promise<{success, data, error, status}>
   * @param {object} metadata - { model, profile }
   * @returns {Promise<object>}
   */
  enqueue(executionFn, metadata = {}) {
    return new Promise((resolve) => {
      this.queue.push({
        executionFn,
        metadata: {
          model: metadata.model || 'unknown',
          profile: metadata.profile || 'cheap',
        },
        resolve,
        attempt: 0,
      });

      this.processNext();
    });
  }

  /**
   * Purges timestamps older than the sliding window.
   */
  cleanOldTimestamps() {
    const cutoff = Date.now() - this.rateLimitWindowMs;
    while (this.requestTimestamps.length > 0 && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
  }

  /**
   * Evaluates queue state and launches ready items within rate & concurrency constraints.
   */
  processNext() {
    if (this.queue.length === 0) {
      return;
    }

    if (this.activeCount >= this.maxConcurrent) {
      return;
    }

    this.cleanOldTimestamps();

    // Check sliding window rate limit
    if (this.requestTimestamps.length >= this.rateLimit) {
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = Math.max(50, oldestTimestamp + this.rateLimitWindowMs - Date.now() + 50);

      if (!this.drainTimer) {
        this.drainTimer = setTimeout(() => {
          this.drainTimer = null;
          this.processNext();
        }, waitTime);
      }
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.activeCount++;
    this.requestTimestamps.push(Date.now());

    this.executeItem(item).finally(() => {
      this.activeCount--;
      this.processNext();
    });
  }

  /**
   * Executes a single queued item with timeout, retry backoff, and usage logging.
   * @param {object} item
   */
  async executeItem(item) {
    const { executionFn, metadata, resolve } = item;
    const startTime = Date.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let result = null;
    try {
      result = await executionFn(controller.signal);
    } catch (err) {
      result = {
        success: false,
        status: 500,
        error: err.message || 'Internal execution failure',
      };
    } finally {
      clearTimeout(timeoutId);
    }

    const latencyMs = Date.now() - startTime;

    // Check if error is retryable (429 Rate Limit or 5xx Server Error)
    const isRetryable =
      !result.success &&
      (result.status === 429 || (result.status >= 500 && result.status <= 599)) &&
      item.attempt < this.maxRetries;

    if (isRetryable) {
      item.attempt++;
      const delay = this.getBackoffDelay(item.attempt);
      console.warn(
        `[RequestQueue] Retryable error (${result.status}) on ${metadata.model}. ` +
          `Retrying attempt ${item.attempt}/${this.maxRetries} after ${delay}ms...`
      );

      // Record transient attempt in usage log
      this.logUsage({
        model: metadata.model,
        profile: metadata.profile,
        promptTokens: 0,
        outputTokens: 0,
        latencyMs,
        status: `retry_${item.attempt}`,
        errorMessage: result.error || 'Retryable transient failure',
      });

      // Schedule re-insertion into queue
      setTimeout(() => {
        this.queue.unshift(item); // Prioritize retried item
        this.processNext();
      }, delay);

      return;
    }

    // Extract token metrics if present
    const usage = result?.data?.usageMetadata || {};
    const promptTokens = usage.promptTokens || 0;
    const outputTokens = usage.outputTokens || 0;

    // Audit log to SQLite
    this.logUsage({
      model: metadata.model,
      profile: metadata.profile,
      promptTokens,
      outputTokens,
      latencyMs,
      status: result.success ? 'success' : 'error',
      errorMessage: result.success ? null : result.error || 'Unknown error',
    });

    // Attach latency to data for UI test panel
    if (result && result.data) {
      result.data.latencyMs = latencyMs;
      result.data.modelUsed = metadata.model;
    }

    resolve(result);
  }

  /**
   * Persists an execution entry into the `ai_usage` SQLite table.
   * @param {object} log
   */
  logUsage(log) {
    if (!this.db) return;

    try {
      this.db
        .prepare(
          `
        INSERT INTO ai_usage (
          timestamp,
          model,
          task_profile,
          prompt_tokens,
          output_tokens,
          latency_ms,
          status,
          error_message
        ) VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          log.model || 'unknown',
          log.profile || 'cheap',
          log.promptTokens || 0,
          log.outputTokens || 0,
          log.latencyMs || 0,
          log.status || 'unknown',
          log.errorMessage || null
        );
    } catch (err) {
      console.error('[RequestQueue] Failed to record ai_usage entry:', err.message);
    }
  }

  /**
   * Retrieves today's usage statistics: total requests and total tokens used.
   * @returns {{requestsToday: number, tokensToday: number}}
   */
  getTodayUsage() {
    if (!this.db) {
      return { requestsToday: 0, tokensToday: 0 };
    }

    try {
      const row = this.db
        .prepare(
          `
        SELECT 
          COUNT(*) as requests_today,
          COALESCE(SUM(prompt_tokens + output_tokens), 0) as tokens_today
        FROM ai_usage
        WHERE date(timestamp) = date('now')
      `
        )
        .get();

      return {
        requestsToday: row ? row.requests_today || 0 : 0,
        tokensToday: row ? row.tokens_today || 0 : 0,
      };
    } catch (err) {
      console.error('[RequestQueue] Failed to query today ai_usage stats:', err.message);
      return { requestsToday: 0, tokensToday: 0 };
    }
  }
}

module.exports = {
  RequestQueue,
};
