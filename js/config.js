// ═══════════════════════════════════════════════════
// STATE & STORAGE / KONSTANTEN / PREISE / DRIVE STATE
// ═══════════════════════════════════════════════════

// ═══════════════════════════════════════════════════
// STATE & STORAGE
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// GOOGLE DRIVE CONSTANTS
// ═══════════════════════════════════════════════════
// ═══════════════════════════════════════════════════
// PREISE (tagesaktuell – Stand 24.05.2026)
// ═══════════════════════════════════════════════════
const PRICING = {
  assemblyai: {
    name: 'AssemblyAI',
    model: 'Universal (mit Speaker Diarization)',
    perMinute: 0.0045,        // USD/Minute – $0.27/Std inkl. Diarization (verifiziert 03.06.2026)
    diarizationPerMin: 0,     // Diarization ist im Flatrate-Preis enthalten
    currency: 'USD',
    updatedAt: '2026-06-03',
    source: 'https://www.assemblyai.com/pricing/',
  },
  claude: {
    name: 'Anthropic Claude',
    model: 'claude-sonnet-4-6',
    inputPerMToken: 3.00,     // USD pro Million Input-Tokens (verifiziert 03.06.2026)
    outputPerMToken: 15.00,   // USD pro Million Output-Tokens (verifiziert 03.06.2026)
    currency: 'USD',
    updatedAt: '2026-06-03',
    source: 'https://platform.claude.com/docs/en/about-claude/models/all-models',
  },
  // v6.58: Mistral-Preise sind nativ in EUR (0,50 €/1,50 € pro 1M Token, verifiziert 15.08.2026).
  // Intern als USD-Äquivalent (Kurs 0,922) gespeichert, damit calcLogEntryCost()/calculateSessionCost()
  // unverändert weiterrechnen (die multiplizieren am Ende mit dem USD→EUR-Tageskurs). Echter
  // EUR-Originalpreis steht in originalEur für die Kosten-UI (v6.59).
  mistral: {
    name: 'Mistral Large 3',
    model: 'mistral-large-latest',
    inputPerMToken: 0.5423,
    outputPerMToken: 1.6269,
    currency: 'USD',
    originalEur: { input: 0.50, output: 1.50 },
    updatedAt: '2026-08-15',
    source: 'https://mistral.ai/pricing',
  },
  ollama: { // v6.63: lokal, kein API-Preis
    name: 'Ollama (lokal)',
    model: 'llama3.1:latest',
    inputPerMToken: 0,
    outputPerMToken: 0,
    currency: 'USD',
    updatedAt: '2026-08-15',
    source: 'lokal – kein API-Preis',
  },
};

function calculateSessionCost(session) {
  let assemblyai = 0;
  let claude = 0;
  // AssemblyAI: audio_duration in Sekunden
  // v6.47: scan_import wird nicht über AssemblyAI transkribiert → immer 0
  if (session.duration && session.source !== 'scan_import') {
    const mins = session.duration / 60;
    assemblyai = mins * (PRICING.assemblyai.perMinute + PRICING.assemblyai.diarizationPerMin);
  }
  // Claude/Mistral: aus Cost-Log summieren (neues Format, v6.58 providerbewusst); Fallback auf claudeTokens (altes Format)
  if (session.claudeCostLog && session.claudeCostLog.length > 0) {
    session.claudeCostLog.forEach(entry => {
      claude += calcLogEntryCost(entry);
    });
  } else {
    const inp = session.claudeTokens?.input  || 0;
    const out = session.claudeTokens?.output || 0;
    claude = (inp / 1e6) * PRICING.claude.inputPerMToken
           + (out / 1e6) * PRICING.claude.outputPerMToken;
  }
  return { assemblyai, claude, total: assemblyai + claude };
}

// Kosten eines einzelnen Log-Eintrags berechnen (v6.58: providerbewusst, Default Claude für alte Einträge ohne provider-Feld)
function calcLogEntryCost(entry) {
  // v6.63: 3-Wege statt Ternary – Ollama ist lokal (0 Kosten)
  const pricing = entry.provider === 'mistral' ? PRICING.mistral
                 : entry.provider === 'ollama'  ? PRICING.ollama
                 : PRICING.claude;
  return (entry.input  / 1e6) * pricing.inputPerMToken
       + (entry.output / 1e6) * pricing.outputPerMToken;
}

// Fallback-Wechselkurs falls API nicht erreichbar
const USD_TO_EUR_FALLBACK = 0.922;

// Tageskurs für ein Datum von frankfurter.app abrufen
async function fetchExchangeRate(dateStr) {
  // dateStr = 'YYYY-MM-DD' oder leer für heute
  const url = dateStr
    ? `https://api.frankfurter.app/${dateStr}?from=USD&to=EUR`
    : 'https://api.frankfurter.app/latest?from=USD&to=EUR';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return { rate: data.rates?.EUR || USD_TO_EUR_FALLBACK, date: data.date };
  } catch(e) {
    console.warn('Wechselkurs-API nicht erreichbar, Fallback:', e.message);
    return { rate: USD_TO_EUR_FALLBACK, date: dateStr || 'Fallback' };
  }
}

// Wechselkurs einer Session ermitteln (gespeichert oder Fallback)
function getSessionRate(session) {
  return session.usdToEur || USD_TO_EUR_FALLBACK;
}

function fmtCost(usd, rate) {
  if (usd === 0) return '—';
  const r   = rate || USD_TO_EUR_FALLBACK;
  const eur = usd * r;
  if (eur < 0.0001) return '< 0,0001 €';
  return eur.toFixed(4).replace('.', ',') + ' €';
}

function fmtCostSession(usd, session) {
  return fmtCost(usd, getSessionRate(session));
}

// Fertig berechneten EUR-Betrag formatieren (für aggregierte Werte)
function fmtEur(eur) {
  if (eur === 0) return '—';
  if (eur < 0.0001) return '< 0,0001 €';
  return eur.toFixed(4).replace('.', ',') + ' €';
}

// v6.49: Globales Kosten-Log für nicht-sitzungsbezogene Claude-Calls
// (Semantiksuche, Prompt-Generator – haben keinen Session-Kontext)
function addToGlobalCostLog(inputTokens, outputTokens, label) {
  try {
    const log = JSON.parse(localStorage.getItem('distill_globalCostLog') || '[]');
    log.push({ date: new Date().toISOString(), input: inputTokens || 0, output: outputTokens || 0, label });
    localStorage.setItem('distill_globalCostLog', JSON.stringify(log));
  } catch(e) {}
}

const CLIENT_ID    = '607815751793-jlm965pkt597fpfnk63367rks19tbhkg.apps.googleusercontent.com';
const SCOPE        = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.compose';
const DRIVE_API    = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME  = 'Transkriptions-Dashboard';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GMAIL_API    = 'https://www.googleapis.com/gmail/v1';

let apiKey = localStorage.getItem('assemblyai_key') || '';
let anthropicKey = localStorage.getItem('anthropic_key') || '';
let proxyUrl = localStorage.getItem('proxy_url') || '';
let assemblyRegion = localStorage.getItem('assembly_region') || 'eu';

// DSGVO: EU-Server oder US-Server
function assemblyBase() {
  return assemblyRegion === 'eu'
    ? 'https://api.eu.assemblyai.com'
    : 'https://api.assemblyai.com';
}
let sessions = []; // wird von initStorage() aus IndexedDB geladen
let currentSessionId = null;
let pollTimer = null;

// ── Nutzer-Profil (Inhaber der App) ──────────────────────────────────────
let ownerName = localStorage.getItem('ownerName') || '';

// ── Projekte ──────────────────────────────────────────────────────────────
const BUILTIN_PROJECT_ID = 'project_general';

function _defaultProjects() {
  return [{
    id: BUILTIN_PROJECT_ID,
    name: 'Allgemeines Projekt',
    color: '#6b7280',
    status: 'active',         // 'active' | 'paused' | 'archived'
    goalDescription: 'Sammelbecken für Sitzungen ohne Projektzuordnung',
    promptTemplateId: null,   // null = kein Projekt-Prompt
    createdAt: new Date().toISOString(),
    builtin: true,            // kann nicht gelöscht werden
  }];
}

let projects = _defaultProjects(); // wird von initStorage() aus IndexedDB geladen

// Google Drive State
let driveToken = null;
let driveTokenExpiry = 0;
let driveUser = null;
let driveFolderId = null;
let driveTokenClient = null;
let driveSubfolderId = null;
let driveSubfolderName = '';
let rememberedFolders = []; // Drive-Unterordner (wird dynamisch geladen)

// saveSessions() und saveProjects() → js/storage.js (IndexedDB)



// ═══════════════════════════════════════════════════
// API KEY
// ═══════════════════════════════════════════════════
function updateApiIndicator() {
  const dot = document.getElementById('apiBadgeDot');
  if (dot) {
    dot.style.background = apiKey ? 'var(--green)' : 'var(--red)';
  }
  checkUploadReady();
}

