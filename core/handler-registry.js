/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — HANDLER REGISTRY (core/handler-registry.js)
 * ==============================================================================
 * Central registry where task handlers and future agents register their
 * execution functions. The Orchestrator and TaskRunner decouple from specific
 * implementations by calling handlers by name.
 * ==============================================================================
 */

class HandlerRegistry {
  constructor() {
    /** @type {Map<string, Function>} */
    this.handlers = new Map();
  }

  /**
   * Registers a task handler function under a unique name.
   * @param {string} name e.g. "demo.wait", "agent.architect"
   * @param {Function} asyncFn ({ params, context, signal }) => Promise<{ success: boolean, output?: any, error?: string, retryable?: boolean }>
   */
  registerHandler(name, asyncFn) {
    if (!name || typeof name !== 'string') {
      throw new Error('[HandlerRegistry] Handler name must be a non-empty string');
    }
    if (typeof asyncFn !== 'function') {
      throw new Error(`[HandlerRegistry] Handler for "${name}" must be an executable function`);
    }

    if (this.handlers.has(name)) {
      console.warn(`[HandlerRegistry] Overwriting existing handler for "${name}"`);
    }

    this.handlers.set(name, asyncFn);
    console.log(`[HandlerRegistry] Registered handler: "${name}"`);
  }

  /**
   * Retrieves a registered handler by name.
   * @param {string} name
   * @returns {Function}
   */
  getHandler(name) {
    if (!this.handlers.has(name)) {
      throw new Error(`No handler registered for '${name}'`);
    }
    return this.handlers.get(name);
  }

  /**
   * Returns true if a handler is registered with the given name.
   * @param {string} name
   * @returns {boolean}
   */
  hasHandler(name) {
    return this.handlers.has(name);
  }

  /**
   * Lists all registered handler names.
   * @returns {string[]}
   */
  listHandlers() {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clears all registered handlers (useful for isolated tests).
   */
  clear() {
    this.handlers.clear();
  }
}

// Global singleton instance
const handlerRegistry = new HandlerRegistry();

module.exports = {
  HandlerRegistry,
  handlerRegistry,
};
