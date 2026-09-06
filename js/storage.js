// ═══════════════════════════════════════════════════
// STORAGE – IndexedDB-Wrapper (ersetzt localStorage für sessions + projects)
// ═══════════════════════════════════════════════════
// Warum: localStorage hat ~5 MB Limit → "exceeded the quota" auf Smartphones
// IndexedDB hat kein nennenswerts Limit (~50% des freien Speichers)

const _IDB_NAME    = 'distill_voice_db';
const _IDB_VERSION = 1;
let   _idb         = null;

// v6.71: Lösch-Listen (Tombstones) für Projekte/Kontakte – verhindert, dass ein Gerät beim
// Sync einen bereits anderswo gelöschten Eintrag durch sein (noch lokal vorhandenes) Exemplar
// wiederherstellt. Siehe loadSettingsFromDrive() in sessions.js.
let deletedProjectIds = [];
let deletedContactIds = [];

// v6.89: Quellentypen (Obsidian-Ingest, Einstellungen-Seite) – Objekte {id,value,label,builtin}
// statt reinem String-Array (v6.88), da Label+Wert jetzt beide editierbar sind und eine vom
// Wert unabhängige, stabile ID für Bearbeiten/Löschen/Merge braucht. Tombstones jetzt ID-basiert.
let quelleTypen = [];
let deletedQuelleTypenIds = [];

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, _IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('keyval')) {
        db.createObjectStore('keyval');
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _idbGet(key) {
  const db = _idb || (_idb = await _openDB());
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('keyval', 'readonly');
    const req = tx.objectStore('keyval').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function _idbSet(key, value) {
  const db = _idb || (_idb = await _openDB());
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('keyval', 'readwrite');
    const req = tx.objectStore('keyval').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Haupt-Init: aufrufen bevor die App startet ────────────────────────────
async function initStorage() {
  _idb = await _openDB();

  // Migration: falls sessions noch in localStorage → nach IDB verschieben + löschen
  const lsSessions = localStorage.getItem('transcription_sessions');
  if (lsSessions) {
    try {
      await _idbSet('sessions', JSON.parse(lsSessions));
      localStorage.removeItem('transcription_sessions');
      console.log('[storage] Sessions aus localStorage nach IndexedDB migriert.');
    } catch(e) { console.warn('[storage] Session-Migration fehlgeschlagen:', e); }
  }

  // Migration: falls projects noch in localStorage → nach IDB verschieben + löschen
  const lsProjects = localStorage.getItem('distill_projects');
  if (lsProjects) {
    try {
      await _idbSet('projects', JSON.parse(lsProjects));
      localStorage.removeItem('distill_projects');
      console.log('[storage] Projekte aus localStorage nach IndexedDB migriert.');
    } catch(e) { console.warn('[storage] Projekt-Migration fehlgeschlagen:', e); }
  }

  // Sessions in globale Variable laden
  const storedSessions = await _idbGet('sessions');
  if (Array.isArray(storedSessions)) {
    sessions = storedSessions;
    localStorage.setItem('distill_has_sessions', sessions.length > 0 ? '1' : '0');
  }

  // Projekte in globale Variable laden
  const storedProjects = await _idbGet('projects');
  if (Array.isArray(storedProjects)) {
    projects = storedProjects;
    // Sicherstellen dass das Builtin-Projekt immer vorhanden ist
    if (!projects.find(p => p.id === BUILTIN_PROJECT_ID)) {
      projects.unshift(_defaultProjects()[0]);
    }
  }

  // Contacts in globale Variable laden
  const storedContacts = await _idbGet('contacts');
  if (Array.isArray(storedContacts) && typeof contacts !== 'undefined') {
    contacts = storedContacts;
  }

  // v6.71: Lösch-Listen (Tombstones) laden
  const storedDeletedProjectIds = await _idbGet('deletedProjectIds');
  if (Array.isArray(storedDeletedProjectIds)) deletedProjectIds = storedDeletedProjectIds;
  const storedDeletedContactIds = await _idbGet('deletedContactIds');
  if (Array.isArray(storedDeletedContactIds)) deletedContactIds = storedDeletedContactIds;

  // v6.89: Quellentypen laden. Ist der Key noch nie gesetzt worden (allererster Start bzw.
  // Umstieg von v6.88), einmalig mit den 5 Basiswerten säen + evtl. alte v6.88-Werte (reines
  // String-Array) migrieren – danach ist ausschließlich der gespeicherte Stand autoritativ,
  // damit gelöschte/bearbeitete Einträge nicht bei jedem Laden wiederhergestellt werden.
  const storedQuelleTypen = await _idbGet('quelleTypen');
  if (Array.isArray(storedQuelleTypen)) {
    quelleTypen = storedQuelleTypen;
  } else {
    const legacyCustom = await _idbGet('customQuelleTypen'); // v6.88-Altdaten
    const migrated = Array.isArray(legacyCustom)
      ? legacyCustom.map(v => ({ id: 'qt_' + Date.now().toString(36) + Math.random().toString(36).slice(2,7), value: v, label: v, builtin: false }))
      : [];
    quelleTypen = [...QUELLE_TYP_BUILTIN_SEED, ...migrated];
    await saveQuelleTypen();
  }
  const storedDeletedQuelleTypenIds = await _idbGet('deletedQuelleTypenIds');
  if (Array.isArray(storedDeletedQuelleTypenIds)) deletedQuelleTypenIds = storedDeletedQuelleTypenIds;
}

// ── Speichern ─────────────────────────────────────────────────────────────
async function saveSessions() {
  try {
    await _idbSet('sessions', sessions);
    // Kleines Flag damit auth.js ohne IDB-Zugriff prüfen kann ob Daten vorhanden
    localStorage.setItem('distill_has_sessions', sessions.length > 0 ? '1' : '0');
  } catch(e) {
    console.error('[storage] saveSessions Fehler:', e);
  }
}

async function saveProjects({ skipDriveSync = false } = {}) {
  try {
    await _idbSet('projects', projects);
    // Drive-Sync sofort (kein Debounce – Projekte ändern sich selten, v4.94)
    if (!skipDriveSync && typeof saveSettingsToDrive === 'function' && typeof driveToken !== 'undefined' && driveToken && typeof driveFolderId !== 'undefined' && driveFolderId) {
      saveSettingsToDrive().catch(e => console.warn('[projects] Drive-Sync:', e.message));
    }
  } catch(e) {
    console.error('[storage] saveProjects Fehler:', e);
  }
}

// v6.71: Lösch-Listen persistieren (Tombstones für Projekt-/Kontakt-Sync-Merge)
async function saveDeletedProjectIds() {
  try { await _idbSet('deletedProjectIds', deletedProjectIds); }
  catch(e) { console.error('[storage] saveDeletedProjectIds Fehler:', e); }
}

async function saveDeletedContactIds() {
  try { await _idbSet('deletedContactIds', deletedContactIds); }
  catch(e) { console.error('[storage] saveDeletedContactIds Fehler:', e); }
}

// v6.89: Quellentypen persistieren
async function saveQuelleTypen() {
  try { await _idbSet('quelleTypen', quelleTypen); }
  catch(e) { console.error('[storage] saveQuelleTypen Fehler:', e); }
}

async function saveDeletedQuelleTypenIds() {
  try { await _idbSet('deletedQuelleTypenIds', deletedQuelleTypenIds); }
  catch(e) { console.error('[storage] saveDeletedQuelleTypenIds Fehler:', e); }
}
