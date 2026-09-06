// ═══════════════════════════════════════════════════
// SETTINGS – zentrale Einstellungen-Seite (v6.88, erweitert v6.89)
// ═══════════════════════════════════════════════════
// Erster Baustein: Quellentypen für den Obsidian-Ingest (quelle_typ-Feld im MD-Frontmatter,
// siehe updateSessionQuelle()/_buildMdFrontmatter() in claude.js). Weitere Grundeinstellungen
// können hier als eigene Sektionen ergänzt werden.

// v6.89: Saat für den allerersten Start – danach ist ausschließlich der gespeicherte Stand
// (quelleTypen, storage.js) autoritativ, damit gelöschte/bearbeitete Basiswerte nicht bei
// jedem Neuladen wiederhergestellt werden. builtin dient nur noch der optischen Kennzeichnung
// (dezenterer Chip-Stil) – editierbar UND löschbar wie eigene Typen (mit Daniel abgestimmt).
const QUELLE_TYP_BUILTIN_SEED = [
  { id: 'qt_gespraech', value: 'gespraech', label: 'Gespräch',  builtin: true },
  { id: 'qt_meeting',   value: 'meeting',   label: 'Meeting',   builtin: true },
  { id: 'qt_webinar',   value: 'webinar',   label: 'Webinar',   builtin: true },
  { id: 'qt_tutorial',  value: 'tutorial',  label: 'Tutorial',  builtin: true },
  { id: 'qt_reflexion', value: 'reflexion', label: 'Reflexion', builtin: true },
];

// Von _renderQuelleTypOptions() (claude.js) genutzt, um #editQuelleTyp zu befüllen.
function getQuelleTypOptions() {
  return (typeof quelleTypen !== 'undefined' ? quelleTypen : []).map(o => ({ value: o.value, label: o.label }));
}

function _quelleTypUid() {
  return 'qt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

let _quelleTypEditingId = null; // welcher Eintrag gerade inline bearbeitet wird (Label+Wert-Formular)

function addQuelleTyp() {
  const labelEl = document.getElementById('newQuelleTypLabel');
  const valueEl = document.getElementById('newQuelleTypValue');
  if (!labelEl || !valueEl) return;
  const label = labelEl.value.trim();
  const value = valueEl.value.trim();
  if (!label || !value) { showToast('Bitte Label und Wert ausfüllen.', 'warning'); return; }
  if (quelleTypen.some(o => o.value.toLowerCase() === value.toLowerCase())) {
    showToast('Dieser interne Wert existiert bereits.', 'warning');
    return;
  }
  quelleTypen.push({ id: _quelleTypUid(), value, label, builtin: false });
  saveQuelleTypen();
  if (typeof queueSettingsSave === 'function') queueSettingsSave();
  labelEl.value = '';
  valueEl.value = '';
  renderSettingsView();
  showToast('Quellentyp hinzugefügt ✓', 'success');
}

function startEditQuelleTyp(id) {
  _quelleTypEditingId = id;
  renderSettingsView();
}

function cancelEditQuelleTyp() {
  _quelleTypEditingId = null;
  renderSettingsView();
}

function saveEditQuelleTyp(id) {
  const labelEl = document.getElementById('editQuelleTypLabel_' + id);
  const valueEl = document.getElementById('editQuelleTypValue_' + id);
  if (!labelEl || !valueEl) return;
  const label = labelEl.value.trim();
  const value = valueEl.value.trim();
  if (!label || !value) { showToast('Bitte Label und Wert ausfüllen.', 'warning'); return; }
  if (quelleTypen.some(o => o.id !== id && o.value.toLowerCase() === value.toLowerCase())) {
    showToast('Dieser interne Wert wird bereits verwendet.', 'warning');
    return;
  }
  const entry = quelleTypen.find(o => o.id === id);
  if (entry) { entry.label = label; entry.value = value; }
  saveQuelleTypen();
  if (typeof queueSettingsSave === 'function') queueSettingsSave();
  _quelleTypEditingId = null;
  renderSettingsView();
  showToast('Quellentyp gespeichert ✓', 'success');
}

// v6.89: auf Wunsch alle Einträge löschbar, auch die 5 ursprünglichen Basiswerte – bereits
// gespeicherte Sitzungen behalten ihren zum Zeitpunkt der Auswahl gespeicherten quelle_typ-String,
// nur die künftige Auswahl im Dropdown ändert sich.
function deleteQuelleTyp(id) {
  quelleTypen = quelleTypen.filter(o => o.id !== id);
  deletedQuelleTypenIds.push(id);
  saveQuelleTypen();
  saveDeletedQuelleTypenIds();
  if (typeof queueSettingsSave === 'function') queueSettingsSave();
  renderSettingsView();
}

function renderSettingsView() {
  const el = document.getElementById('settingsView');
  if (!el) return;

  const rows = quelleTypen.map(o => {
    if (o.id === _quelleTypEditingId) {
      return `
        <div style="display:flex; gap:8px; align-items:center; margin:0 6px 8px 0; flex-wrap:wrap">
          <input type="text" id="editQuelleTypLabel_${o.id}" value="${escHtml(o.label)}" placeholder="Anzeige-Label"
            class="speaker-name-input" style="flex:1; min-width:120px" autocomplete="off" />
          <input type="text" id="editQuelleTypValue_${o.id}" value="${escHtml(o.value)}" placeholder="Interner Wert"
            class="speaker-name-input" style="flex:1; min-width:120px" autocomplete="off" />
          <button onclick="saveEditQuelleTyp('${o.id}')" title="Speichern" class="btn btn-ghost" style="padding:6px 10px; font-size:0.78rem">${icon('check',13)}</button>
          <button onclick="cancelEditQuelleTyp()" title="Abbrechen" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;padding:0 4px">×</button>
        </div>`;
    }
    return `
      <span style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:8px;
        background: ${o.builtin ? 'var(--surface2)' : 'color-mix(in srgb, var(--accent) 10%, transparent)'};
        border:1px solid ${o.builtin ? 'var(--border)' : 'color-mix(in srgb, var(--accent) 30%, transparent)'};
        font-size:0.8rem; margin:0 6px 6px 0">
        ${escHtml(o.label)} <span style="color:var(--muted); font-size:0.72rem">(${escHtml(o.value)})</span>
        <button onclick="startEditQuelleTyp('${o.id}')" title="Bearbeiten"
          style="background:none; border:none; color:var(--muted); cursor:pointer; padding:0; display:inline-flex">${icon('edit-2',11)}</button>
        <button onclick="deleteQuelleTyp('${o.id}')" title="Löschen"
          style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:0.9rem; line-height:1; padding:0">×</button>
      </span>`;
  }).join('');

  el.innerHTML = `<div style="max-width:700px; margin:0 auto; padding:4px 0 32px">
    <h2 style="font-size:1.1rem; font-weight:700; display:flex;align-items:center;gap:7px; margin-bottom:20px">
      ${iconLucide('settings',16)} Einstellungen
    </h2>

    <div style="border:1px solid var(--border); border-radius:12px; padding:18px 20px; margin-bottom:16px">
      <div style="font-size:0.92rem; font-weight:700; margin-bottom:4px; display:flex;align-items:center;gap:7px">
        ${icon('tag',14)} Quellentypen
        <button class="help-icon" data-help="Werte für das quelle_typ-Feld im MD-Frontmatter (Obsidian-Ingest). Label = Anzeigetext im Dropdown, Wert = intern gespeicherter String. Alle Einträge (auch die 5 Standard-Typen) sind editier- und löschbar – Änderungen wirken sich nur auf künftig ausgewählte Sitzungen aus, nicht rückwirkend auf schon gespeicherte." onclick="showHelpTooltip(this)">?</button>
      </div>
      <div style="font-size:0.8rem; color:var(--muted); margin-bottom:14px">
        Werte für das Feld „Quelle-Typ" im Transkript-Header. Label = Anzeigetext, Wert = intern gespeicherter String – beides frei editierbar und löschbar.
      </div>
      <div style="margin-bottom:10px">${rows || '<span style="color:var(--muted); font-size:0.8rem">Keine Quellentypen vorhanden.</span>'}</div>
      <div style="display:flex; gap:8px; margin-top:4px; flex-wrap:wrap">
        <input type="text" id="newQuelleTypLabel" placeholder="Anzeige-Label…"
          class="speaker-name-input" style="flex:1; min-width:140px" autocomplete="off" />
        <input type="text" id="newQuelleTypValue" placeholder="Interner Wert…"
          class="speaker-name-input" style="flex:1; min-width:140px"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addQuelleTyp();}" autocomplete="off" />
        <button onclick="addQuelleTyp()" class="btn btn-ghost" style="padding:8px 14px; font-size:0.82rem">
          ${icon('plus',13,'margin-right:4px;vertical-align:middle')}Hinzufügen
        </button>
      </div>
    </div>
  </div>`;

  if (window.lucide) lucide.createIcons({ nodes: [el] });
}
