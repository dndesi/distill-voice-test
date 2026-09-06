// ═══════════════════════════════════════════════════
// SETTINGS – zentrale Einstellungen-Seite (v6.88)
// ═══════════════════════════════════════════════════
// Erster Baustein: Quellentypen für den Obsidian-Ingest (quelle_typ-Feld im MD-Frontmatter,
// siehe updateSessionQuelle()/_buildMdFrontmatter() in claude.js). Weitere Grundeinstellungen
// können hier als eigene Sektionen ergänzt werden.

// 5 feste Basiswerte – bewusst nicht löschbar (vom Obsidian-Ingest fest erwartet, siehe v6.85).
const QUELLE_TYP_BUILTIN = [
  { value: 'gespraech', label: 'Gespräch' },
  { value: 'meeting',   label: 'Meeting'  },
  { value: 'webinar',   label: 'Webinar'  },
  { value: 'tutorial',  label: 'Tutorial' },
  { value: 'reflexion', label: 'Reflexion' },
];

// Kombinierte Liste (Basis + eigene) – von _renderQuelleTypOptions() (claude.js) genutzt.
// Eigene Typen: Anzeigetext = interner Wert (bewusst kein Slugify, freier Wert mit Daniel abgestimmt).
function getQuelleTypOptions() {
  const custom = (typeof customQuelleTypen !== 'undefined' ? customQuelleTypen : [])
    .map(v => ({ value: v, label: v }));
  return [...QUELLE_TYP_BUILTIN, ...custom];
}

function addCustomQuelleTyp() {
  const input = document.getElementById('newQuelleTypInput');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const existing = getQuelleTypOptions().map(o => o.value.toLowerCase());
  if (existing.includes(val.toLowerCase())) {
    showToast('Dieser Quellentyp existiert bereits.', 'warning');
    return;
  }
  customQuelleTypen.push(val);
  deletedQuelleTypen = deletedQuelleTypen.filter(v => v !== val); // falls zuvor gelöscht, jetzt neu angelegt
  saveCustomQuelleTypen();
  saveDeletedQuelleTypen();
  if (typeof queueSettingsSave === 'function') queueSettingsSave();
  input.value = '';
  renderSettingsView();
  showToast('Quellentyp hinzugefügt ✓', 'success');
}

function deleteCustomQuelleTyp(value) {
  customQuelleTypen = customQuelleTypen.filter(v => v !== value);
  deletedQuelleTypen.push(value);
  saveCustomQuelleTypen();
  saveDeletedQuelleTypen();
  if (typeof queueSettingsSave === 'function') queueSettingsSave();
  renderSettingsView();
}

function renderSettingsView() {
  const el = document.getElementById('settingsView');
  if (!el) return;

  const customChips = customQuelleTypen.map(v => `
    <span style="display:inline-flex; align-items:center; gap:6px; padding:5px 10px; border-radius:8px;
      background: color-mix(in srgb, var(--accent) 10%, transparent); border:1px solid color-mix(in srgb, var(--accent) 30%, transparent);
      font-size:0.8rem; margin:0 6px 6px 0">
      ${escHtml(v)}
      <button onclick="deleteCustomQuelleTyp('${v.replace(/'/g, "\\'")}')" title="Löschen"
        style="background:none; border:none; color:var(--muted); cursor:pointer; font-size:0.9rem; line-height:1; padding:0">×</button>
    </span>`).join('');

  const builtinChips = QUELLE_TYP_BUILTIN.map(o => `
    <span style="display:inline-block; padding:5px 10px; border-radius:8px; background:var(--surface2);
      border:1px solid var(--border); font-size:0.8rem; color:var(--muted); margin:0 6px 6px 0">
      ${escHtml(o.label)}
    </span>`).join('');

  el.innerHTML = `<div style="max-width:700px; margin:0 auto; padding:4px 0 32px">
    <h2 style="font-size:1.1rem; font-weight:700; display:flex;align-items:center;gap:7px; margin-bottom:20px">
      ${iconLucide('settings',16)} Einstellungen
    </h2>

    <div style="border:1px solid var(--border); border-radius:12px; padding:18px 20px; margin-bottom:16px">
      <div style="font-size:0.92rem; font-weight:700; margin-bottom:4px; display:flex;align-items:center;gap:7px">
        ${icon('tag',14)} Quellentypen
        <button class="help-icon" data-help="Werte für das quelle_typ-Feld im MD-Frontmatter (Obsidian-Ingest). Die 5 Basiswerte sind fest vorgegeben. Eigene Typen: der eingegebene Text wird 1:1 als interner Wert gespeichert." onclick="showHelpTooltip(this)">?</button>
      </div>
      <div style="font-size:0.8rem; color:var(--muted); margin-bottom:14px">
        Werte für das Feld „Quelle-Typ" im Transkript-Header. Die 5 Basiswerte sind fest, eigene Typen kannst du hier ergänzen.
      </div>
      <div style="margin-bottom:10px">${builtinChips}</div>
      ${customChips ? `<div style="margin-bottom:10px">${customChips}</div>` : ''}
      <div style="display:flex; gap:8px; margin-top:4px">
        <input type="text" id="newQuelleTypInput" placeholder="Eigener Quellentyp…"
          class="speaker-name-input" style="flex:1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();addCustomQuelleTyp();}" autocomplete="off" />
        <button onclick="addCustomQuelleTyp()" class="btn btn-ghost" style="padding:8px 14px; font-size:0.82rem">
          ${icon('plus',13,'margin-right:4px;vertical-align:middle')}Hinzufügen
        </button>
      </div>
    </div>
  </div>`;

  if (window.lucide) lucide.createIcons({ nodes: [el] });
}
