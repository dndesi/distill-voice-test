// ═══════════════════════════════════════════════════
// AI PROVIDER LAYER (v6.58)
// Vermittlungsschicht zwischen den Analyse-Funktionen und dem gewählten
// KI-Anbieter. Claude bleibt der unveränderte Standard-Pfad für alle
// bestehenden Aufrufstellen. Mistral wird NUR aktiv, wenn im Analysen-Tab
// explizit ausgewählt (_aiProviderOverride) — kein globaler Zwangs-Wechsel,
// damit andere Features (Semantiksuche, Kalender, Fotoanalyse, Projekt-
// Assistent …) unverändert auf Claude laufen, bis sie einzeln angebunden werden.
// ═══════════════════════════════════════════════════

let aiProvider   = localStorage.getItem('ai_provider')   || 'claude'; // nur Vorauswahl im Analysen-Tab-Dropdown
let mistralKey   = localStorage.getItem('mistral_key')   || '';
let mistralModel = localStorage.getItem('mistral_model') || 'mistral-large-latest';

// Von startSelectedAnalysis() (claude.js) gesetzt, solange eine Analyse mit
// explizit gewähltem Anbieter läuft. Ohne Override läuft alles wie bisher
// über Claude (siehe callClaudeAPI/callClaudeAPIVision in claude.js).
let _aiProviderOverride = null;

// v6.60: ohne Override zählt der globale Standard-Anbieter (nicht mehr hart Claude) –
// damit gilt "Standard-KI-Anbieter" aus dem API-Modal wirklich für die ganze App.
function _effectiveProvider() {
  if (_aiProviderOverride) return _aiProviderOverride;
  if (aiProvider === 'mistral') return { provider: 'mistral', model: mistralModel };
  return { provider: 'claude', model: 'claude-sonnet-4-6' };
}

// v6.60: gemeinsame Key-Prüfung für alle ~15 Aufrufstellen, die vorher nur anthropicKey
// geprüft haben – ersetzt "if (!anthropicKey) {...}" durch "if (!_hasActiveAiKey()) {...}".
function _hasActiveAiKey() {
  const { provider } = _effectiveProvider();
  return provider === 'mistral' ? !!mistralKey : !!anthropicKey;
}
function _missingAiKeyMessage() {
  const { provider } = _effectiveProvider();
  return provider === 'mistral' ? 'Kein Mistral API-Key gesetzt.' : 'Kein Anthropic API-Key gesetzt.';
}

// Letzter tatsächlich genutzter Anbieter/Modell – von callClaudeAPI() gesetzt,
// von addTokensToSession() gelesen (Kosten-Log, v6.58).
let _lastAiCallMeta = { provider: 'claude', model: 'claude-sonnet-4-6' };

// v5.69-Pendant für Mistral: bei 429 (Rate-Limit) bis zu 2× mit Pause wiederholen
async function _mistralFetchWithRetry(body, label) {
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 4000;
  let attempt = 0;
  while (true) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = await res.json();
      const textVal = data?.choices?.[0]?.message?.content;
      if (!textVal) throw new Error('Mistral hat keine Antwort zurückgegeben (leerer Content). Bitte erneut versuchen.');
      return {
        text: textVal.trim(),
        inputTokens:  data.usage?.prompt_tokens     || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      };
    }
    const err = await res.json().catch(() => ({}));
    const msg = err.message || err.error?.message || `HTTP ${res.status}`;
    // 429 = Rate-Limit → retry (Mistral-Pendant zu Anthropics 529)
    if (res.status === 429 && attempt < MAX_RETRIES) {
      attempt++;
      const waitSec = RETRY_DELAY_MS / 1000 * attempt;
      console.warn(`[Mistral] ${label} 429 Rate-Limit – Versuch ${attempt}/${MAX_RETRIES} in ${waitSec}s`);
      if (typeof showToast === 'function') showToast(`Mistral ausgelastet – Versuch ${attempt}/${MAX_RETRIES} in ${waitSec}s …`, 'warning');
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      continue;
    }
    console.error(`[Mistral] ${label} Fehler:`, res.status, msg);
    const friendlyMsg = res.status === 429
      ? 'Mistral ist gerade ausgelastet (Rate-Limit). Bitte versuche es in einer Minute erneut.'
      : res.status === 401
        ? 'Mistral API-Key ungültig.'
        : `Mistral HTTP ${res.status}: ${msg}`;
    throw new Error(friendlyMsg);
  }
}

// Übersetzt Anfrage/Antwort auf dasselbe Format wie callClaudeAPI(): { text, inputTokens, outputTokens }
async function callMistralAPI(prompt, systemPrompt, model) {
  if (!mistralKey) throw new Error('Kein Mistral API-Key gesetzt. Bitte unter 🔑 API-Keys eintragen.');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: prompt });
  return _mistralFetchWithRetry({ model, max_tokens: 32000, messages }, 'callMistralAPI');
}
