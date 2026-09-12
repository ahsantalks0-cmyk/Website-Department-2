/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — GEMINI REST PROVIDER (ai/gemini-provider.js)
 * ==============================================================================
 * Re-exports the unified GeminiProvider from ai/providers/gemini-provider.js
 * for backwards compatibility.
 * ==============================================================================
 */

const { GeminiProvider } = require('./providers/gemini-provider');

module.exports = {
  GeminiProvider,
};
