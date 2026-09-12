/**
 * ==============================================================================
 * AI DESIGN DEPARTMENT — PRICING METADATA (ai/pricing-metadata.js)
 * ==============================================================================
 * Updatable pricing metadata per provider and model family.
 * Provider APIs do not return billing or pricing flags directly in listModels,
 * so this module maintains heuristic tier mappings (free / paid / unknown).
 *
 * NOTE: This map must be updated as providers change pricing, launch new models,
 * or alter API-key free quotas.
 * ==============================================================================
 */

const PRICING_METADATA = {
  google: {
    patterns: [
      {
        regex: /flash-lite/i,
        tier: 'free',
        note: 'High-speed free tier available via Google AI Studio API key (rate limits apply).',
      },
      {
        regex: /flash/i,
        tier: 'free',
        note: 'Free tier available (up to 15 RPM) via Google AI Studio API key.',
      },
      {
        regex: /8b/i,
        tier: 'free',
        note: 'Lightweight free-tier model.',
      },
      {
        regex: /pro/i,
        tier: 'paid',
        note: 'Google Gemini Pro models typically require paid tier or have minimal free quota.',
      },
      {
        regex: /ultra/i,
        tier: 'paid',
        note: 'Flagship enterprise tier model requiring billing.',
      },
    ],
    defaultTier: 'unknown',
    defaultNote: 'Google AI Studio models may offer limited free quotas or require Cloud billing.',
  },

  openai: {
    // ALL OpenAI models require paid API credits
    patterns: [],
    defaultTier: 'paid',
    defaultNote: 'OpenAI models require paid credits (no free tier available via API keys).',
  },

  anthropic: {
    // ALL Anthropic models require paid API credits
    patterns: [],
    defaultTier: 'paid',
    defaultNote: 'Anthropic Claude models require paid credits (no free tier available via API keys).',
  },

  groq: {
    // Groq offers a generous free tier for developer accounts
    patterns: [],
    defaultTier: 'free',
    defaultNote: 'Free tier available within Groq rate limits (RPM / TPM).',
  },
};

/**
 * Returns pricing tier and warning messages for a specific provider model.
 *
 * @param {string} providerId 'google' | 'openai' | 'anthropic' | 'groq'
 * @param {string} modelId
 * @returns {{tier: 'free'|'paid'|'unknown', note: string, warning: string|null}}
 */
function getModelPricing(providerId, modelId) {
  const normProvider = (providerId || '').toLowerCase();
  const meta = PRICING_METADATA[normProvider];

  if (!meta) {
    return {
      tier: 'unknown',
      note: 'Billing status unknown for this provider.',
      warning: 'Billing status unknown — you may need billing enabled for this model.',
    };
  }

  const normModel = (modelId || '').toLowerCase();
  let selectedTier = meta.defaultTier || 'unknown';
  let selectedNote = meta.defaultNote || '';

  if (Array.isArray(meta.patterns)) {
    for (const p of meta.patterns) {
      if (p.regex.test(normModel)) {
        selectedTier = p.tier;
        selectedNote = p.note;
        break;
      }
    }
  }

  let warning = null;
  if (selectedTier === 'paid') {
    warning = 'This model is PAID — no free tier. To use it, add billing in your provider account.';
  } else if (selectedTier === 'unknown') {
    warning = 'Billing status unknown — you may need billing enabled for this model.';
  }

  return {
    tier: selectedTier,
    note: selectedNote,
    warning,
  };
}

module.exports = {
  PRICING_METADATA,
  getModelPricing,
};
