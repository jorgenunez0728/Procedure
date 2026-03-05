// ══════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════
let procedures = JSON.parse(localStorage.getItem('kmx_procedures') || '[]');
let currentProcId = null;
let attachedImages = []; // {dataUrl, base64, mimeType, name}
let isTyping = false;

// ── IMAGE STORE (IndexedDB) ──────────────────────────────────────────────────
// Stores step images separately from localStorage to avoid 5MB limit.
// Key format: "{procId}_step_{stepNumber}" or "{procId}_pending_{timestamp}"
const ImageStore = (() => {
  let db = null;
  const DB_NAME = 'kmx_proc_images', STORE = 'images', VERSION = 1;

  async function open() {
    if (db) return db;
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(STORE);
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = e => rej(e.target.error);
    });
  }

  async function set(key, value) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => res(true);
      tx.onerror = e => rej(e.target.error);
    });
  }

  async function get(key) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = e => res(e.target.result || null);
      req.onerror = e => rej(e.target.error);
    });
  }

  // FIX: use Promise.all() instead of sequential awaits for better performance
  async function getAll(prefix) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = async e => {
        const keys = e.target.result.filter(k => k.startsWith(prefix));
        const values = await Promise.all(keys.map(k => get(k)));
        const entries = {};
        keys.forEach((k, i) => entries[k] = values[i]);
        res(entries);
      };
      req.onerror = e => rej(e.target.error);
    });
  }

  async function remove(key) {
    const d = await open();
    return new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => res(true);
      tx.onerror = e => rej(e.target.error);
    });
  }

  return { set, get, getAll, remove };
})();

// ══════════════════════════════════════════════
// SYSTEM PROMPT
// ══════════════════════════════════════════════
const SYSTEM_PROMPT = `Eres un asistente especializado en documentar procedimientos técnicos para el Laboratorio de Emisiones KMX de KIA México.

Tu rol es actuar como un **entrevistador inteligente**: haces preguntas en lenguaje natural, una o pocas a la vez, para capturar toda la información necesaria para generar un procedimiento técnico formal.

La estructura del procedimiento que debes capturar es:
1. **Propósito** — Para qué sirve, qué objetivo tiene
2. **Alcance** — A qué equipos, vehículos, o situaciones aplica
3. **Definiciones** — Términos técnicos clave
4. **Responsabilidades** — Quién ejecuta, quién supervisa, quién autoriza
5. **Procedimiento paso a paso** — Pasos numerados, con notas de seguridad o precaución cuando aplique
6. **Criterios de aceptación** — Cómo saber si el procedimiento se realizó correctamente
7. **Registros** — Qué documentos o formatos se llenan

**Instrucciones de comportamiento:**
- Sé conversacional, amigable, y habla en español
- Haz máximo 2-3 preguntas a la vez, nunca abrumes con un cuestionario completo
- Al completar una sección, haz un breve resumen de lo capturado y pregunta si está correcto
- Detecta si el procedimiento que se está describiendo es similar a alguno en la biblioteca (te pasaré la lista de procedimientos existentes)
- Si detectas similitud, menciona cuál es el procedimiento similar y pregunta en qué difiere este nuevo, para no repetir preguntas innecesarias
- Cuando ya tengas suficiente información para generar el documento, indica que estás listo para exportar y genera un resumen completo en formato JSON estructurado

**Detección automática de imágenes en pasos:**
Mientras el usuario describe cada paso, analiza si ese paso involucra:
- Una acción en pantalla o interfaz (hacer clic en un botón/icono/menú, seleccionar una opción, leer un valor en pantalla)
- Una manipulación física de equipo donde la posición o el resultado es importante ver
- Un estado visible que debe verificarse visualmente

Si detectas alguno de estos casos, al terminar de registrar ese paso, pregunta de forma natural:
"He notado que el paso [número] involucra [acción]. ¿Tienes una captura o foto que muestre esto, o prefieres agregarla después?"
- Si responde que la adjuntará después: marca el paso con `"hasImage": true, "imageId": null` y en `"imageContext"` escribe una descripción breve de qué debería mostrar la imagen (ej. "Captura de la pantalla con el icono Quality Check resaltado")
- Si adjunta la imagen en ese momento: pregunta "¿Confirmas que esta imagen es para el paso [número]?" y si confirma, usa ese número en `"imageId"`

**Si el usuario adjunta imágenes:**
- SIEMPRE pregunta explícitamente: "¿A qué paso pertenece esta imagen?" y espera la respuesta
- Cuando el usuario responda con el número, usa ese número en `"imageId"` del paso correspondiente
- Si sube varias imágenes a la vez, pregunta de qué paso es cada una por separado

**Cuando el usuario pregunte qué falta** (ej. "¿qué falta?", "muéstrame el esquema", "¿qué imágenes faltan?", "¿qué hay pendiente?"):
Responde con una lista clara y ordenada:
1. Pasos marcados como pendientes de imagen (número, título, qué debería mostrar la foto)
2. Secciones del procedimiento que aún no se han capturado

**Al final, cuando tengas toda la información, responde con un bloque especial:**
<PROCEDURE_DATA>
{JSON con todos los campos}
</PROCEDURE_DATA>

El JSON debe tener esta estructura exacta:
{
  "title": "Nombre del procedimiento",
  "code": "Código ej. COP15-P31",
  "revision": "1",
  "date": "fecha actual",
  "author": "",
  "purpose": "texto",
  "scope": "texto",
  "definitions": [{"term": "", "definition": ""}],
  "responsibilities": [{"role": "", "responsibility": "", "authority": ""}],
  "steps": [{"number": 1, "title": "", "description": "", "notes": "", "hasImage": false, "imageId": null, "imageContext": ""}],
  "acceptance_criteria": "texto",
  "records": "texto",
  "related_procedures": []
}`;

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
window.onload = () => {
  const savedKey = localStorage.getItem('kmx_api_key');
  if (savedKey) document.getElementById('api-key-input').value = savedKey;
  renderProcList();
};

// ══════════════════════════════════════════════
// API KEY
// ══════════════════════════════════════════════
function saveApiKey() {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) { showNotif('Ingresa una API key válida'); return; }
  localStorage.setItem('kmx_api_key', key);
  showNotif('✓ API Key guardada');
}

function getApiKey() {
  return localStorage.getItem('kmx_api_key') || document.getElementById('api-key-input').value.trim();
}

// ══════════════════════════════════════════════
// PROCEDURES CRUD
// ══════════════════════════════════════════════
function saveProcedures() {
  localStorage.setItem('kmx_procedures', JSON.stringify(procedures));
}

function openNewProcModal() {
  document.getElementById('modal-proc-name').value = '';
  document.getElementById('modal-proc-code').value = '';
  document.getElementById('new-proc-modal').classList.add('open');
  setTimeout(() => document.getElementById('modal-proc-name').focus(), 50);
}

function closeModal() {
  document.getElementById('new-proc-modal').classList.remove('open');
}

function createNewProc() {
  const name = document.getElementById('modal-proc-name').value.trim() || 'Nuevo Procedimiento';
  const code = document.getElementById('modal-proc-code').value.trim() || `KMX-P${String(Date.now()).slice(-4)}`;
  const proc = {
    id: Date.now().toString(),
    name,
    code,
    createdAt: new Date().toLocaleDateString('es-MX'),
    messages: [],
    data: {},
    complete: false
  };
  procedures.unshift(proc);
  saveProcedures();
  closeModal();
  renderProcList();
  loadProc(proc.id);
  // Auto-start chat if name was provided
  setTimeout(() => {
    if (proc.name && proc.name !== 'Nuevo Procedimiento') {
      document.getElementById('chat-input').value = proc.name;
      sendMessage();
    }
  }, 300);
}

function loadProc(id) {
  currentProcId = id;
  const proc = procedures.find(p => p.id === id);
  if (!proc) return;

  // Update header
  document.getElementById('header-code').textContent = proc.code;
  document.getElementById('header-name').textContent = proc.name;
  document.getElementById('btn-export').style.display = proc.complete ? 'block' : 'none';
  document.getElementById('btn-reset').style.display = 'block';
  document.getElementById('btn-assign-img').style.display = 'block';

  // Highlight active item in sidebar
  document.querySelectorAll('.proc-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-id="${id}"]`)?.classList.add('active');

  renderMessages(proc);
  renderPreview(proc);

  // If new procedure (no messages), send initial greeting
  if (proc.messages.length === 0) {
    const existingTitles = procedures.filter(p => p.id !== id).map(p => p.name).join(', ');
    const initMsg = `Hola! Voy a ayudarte a documentar el procedimiento "${proc.name}" (${proc.code}).

${existingTitles ? `Procedimientos ya documentados en tu biblioteca: ${existingTitles}.` : ''}

Para empezar, cuéntame: **¿cuál es el objetivo principal de este procedimiento?** ¿Para qué sirve y cuándo se ejecuta?`;
    proc.messages.push({ role: 'assistant', content: initMsg });
    saveProcedures();
    renderMessages(proc);
  }
}

function getCurrentProc() {
  return procedures.find(p => p.id === currentProcId);
}

function resetCurrentProc() {
  const proc = getCurrentProc();
  if (!proc) return;
  if (!confirm('¿Reiniciar el chat de este procedimiento? Los datos capturados se perderán.')) return;
  proc.messages = [];
  proc.data = {};
  proc.complete = false;
  saveProcedures();
  loadProc(proc.id);
}

function renderProcList() {
  const list = document.getElementById('proc-list');
  if (procedures.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="icon">📂</div><div>Ningún procedimiento<br>aún. Crea uno nuevo.</div></div>`;
    return;
  }
  list.innerHTML = procedures.map(p => `
    <div class="proc-item${p.id === currentProcId ? ' active' : ''}" data-id="${p.id}" onclick="loadProc('${p.id}')">
      <div class="proc-item-code">${p.code} ${p.complete ? '✓' : ''}</div>
      <div class="proc-item-name">${p.name}</div>
      <div class="proc-item-meta">${p.createdAt}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════
// MESSAGES RENDER
// ══════════════════════════════════════════════
function renderMessages(proc) {
  const container = document.getElementById('messages');
  if (!proc || proc.messages.length === 0) {
    container.innerHTML = `<div class="welcome-card">
      <h2>Entrevistador de Procedimientos</h2>
      <p>Dime en lenguaje natural qué procedimiento quieres documentar.</p>
      <div class="examples">
        <div class="example-chip" onclick="useExample(this)">"Procedimiento para calibración Deadweight de Dinamómetro"</div>
        <div class="example-chip" onclick="useExample(this)">"Arranque y verificación del analizador de gases HORIBA"</div>
        <div class="example-chip" onclick="useExample(this)">"Procedimiento de purga del sistema de muestreo"</div>
      </div>
    </div>`;
    return;
  }

  container.innerHTML = proc.messages.map(m => renderMsg(m)).join('');
  container.scrollTop = container.scrollHeight;
}

function renderMsg(m) {
  const isUser = m.role === 'user';
  let contentHtml = '';

  if (typeof m.content === 'string') {
    contentHtml = formatText(m.content);
  } else if (Array.isArray(m.content)) {
    const textPart = m.content.find(c => c.type === 'text');
    const imgParts = m.content.filter(c => c.type === 'image');
    if (textPart) contentHtml = formatText(textPart.text);
    imgParts.forEach(img => {
      contentHtml += `<img src="data:${img.source.media_type};base64,${img.source.data}" class="msg-image">`;
    });
  }

  return `<div class="msg ${isUser ? 'user' : 'assistant'}">
    <div class="msg-avatar">${isUser ? '👤' : 'AI'}</div>
    <div class="msg-bubble">${contentHtml}</div>
  </div>`;
}

function formatText(text) {
  // Remove PROCEDURE_DATA blocks from the chat display
  text = text.replace(/<PROCEDURE_DATA>[\s\S]*?<\/PROCEDURE_DATA>/g, '✅ <strong>¡Datos completos! Puedes exportar el procedimiento con el botón "Exportar Word".</strong>');
  // Basic markdown
  text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
  text = text.replace(/\n\n/g, '</p><p>');
  text = text.replace(/\n/g, '<br>');
  // Numbered lists
  text = text.replace(/^(\d+)\.\s(.+)$/gm, '<li>$2</li>');
  text = text.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
  return `<p>${text}</p>`;
}

function addTypingIndicator() {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg assistant';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-avatar">AI</div><div class="msg-bubble"><div class="typing"><span></span><span></span><span></span></div></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

// ══════════════════════════════════════════════
// SEND MESSAGE
// ══════════════════════════════════════════════
async function sendMessage() {
  if (isTyping) return;
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text && attachedImages.length === 0) return;

  const apiKey = getApiKey();
  if (!apiKey) { showNotif('⚠ Ingresa tu API Key primero'); return; }

  // If no proc selected, create one on the fly
  if (!currentProcId) {
    const proc = {
      id: Date.now().toString(),
      name: text.length > 50 ? text.slice(0, 50) + '…' : text,
      code: `KMX-P${String(Date.now()).slice(-4)}`,
      createdAt: new Date().toLocaleDateString('es-MX'),
      messages: [],
      data: {},
      complete: false
    };
    procedures.unshift(proc);
    saveProcedures();
    renderProcList();
    currentProcId = proc.id;
    document.getElementById('header-code').textContent = proc.code;
    document.getElementById('header-name').textContent = proc.name;
    document.getElementById('btn-reset').style.display = 'block';
  }

  const proc = getCurrentProc();

  // Build user message content (with images if attached)
  let userContent;
  if (attachedImages.length > 0) {
    userContent = [
      { type: 'text', text: text || '(imagen adjunta)' },
      ...attachedImages.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mimeType, data: img.base64 }
      }))
    ];
  } else {
    userContent = text;
  }

  proc.messages.push({ role: 'user', content: userContent });
  saveProcedures();

  input.value = '';
  autoResize(input);
  clearAttachments();
  renderMessages(proc);

  isTyping = true;
  document.getElementById('btn-send').disabled = true;
  addTypingIndicator();

  try {
    const existingProcsTitles = procedures
      .filter(p => p.id !== currentProcId && p.name)
      .map(p => `"${p.name}" (${p.code})`)
      .join(', ');

    const systemWithContext = SYSTEM_PROMPT + (existingProcsTitles
      ? `\n\nProcedimientos ya existentes en la biblioteca del usuario: ${existingProcsTitles}`
      : '');

    // Send up to the last 20 messages to keep token usage reasonable
    const recentMessages = proc.messages.slice(-20);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemWithContext,
        messages: recentMessages
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const assistantText = data.content.find(c => c.type === 'text')?.text || '';

    proc.messages.push({ role: 'assistant', content: assistantText });

    // Extract and apply PROCEDURE_DATA if present
    const dataMatch = assistantText.match(/<PROCEDURE_DATA>([\s\S]*?)<\/PROCEDURE_DATA>/);
    if (dataMatch) {
      try {
        const parsed = JSON.parse(dataMatch[1].trim());
        proc.data = parsed;
        proc.complete = true;
        if (parsed.title) proc.name = parsed.title;
        if (parsed.code) proc.code = parsed.code;
        document.getElementById('header-name').textContent = proc.name;
        document.getElementById('header-code').textContent = proc.code;
        document.getElementById('btn-export').style.display = 'block';
        assignImagesToSteps(proc).catch(e => console.warn('Image assignment failed:', e));
      } catch(e) { console.warn('Could not parse PROCEDURE_DATA', e); }
    }

    saveProcedures();
    removeTypingIndicator();
    renderMessages(proc);
    renderPreview(proc);
    renderProcList();

  } catch(err) {
    removeTypingIndicator();
    proc.messages.push({ role: 'assistant', content: `❌ Error: ${err.message}` });
    saveProcedures();
    renderMessages(proc);
    showNotif('Error: ' + err.message);
  } finally {
    isTyping = false;
    document.getElementById('btn-send').disabled = false;
  }
}

// ══════════════════════════════════════════════
// IMAGES
// ══════════════════════════════════════════════
function handleImages(event) {
  const files = Array.from(event.target.files);
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      const pendingId = `pending_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      const imgObj = { dataUrl, base64, mimeType: file.type, name: file.name, pendingId };
      attachedImages.push(imgObj);

      // Save to ImageStore with a pending key (will be re-keyed to step when assigned)
      if (currentProcId) {
        await ImageStore.set(`${currentProcId}_${pendingId}`, { dataUrl, mimeType: file.type, name: file.name });
      }
      renderThumbs();
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}

// Called after PROCEDURE_DATA is parsed — link pending images to their steps (FIFO)
async function assignImagesToSteps(proc) {
  if (!proc?.data?.steps) return;
  for (const step of proc.data.steps) {
    if (!step.imageId) continue;
    const allImgs = await ImageStore.getAll(`${proc.id}_pending_`);
    const keys = Object.keys(allImgs);
    if (keys.length === 0) break;

    keys.sort();
    const oldKey = keys[0];
    const imgData = allImgs[oldKey];
    const newKey = `${proc.id}_step_${step.imageId}`;
    await ImageStore.set(newKey, imgData);
    await ImageStore.remove(oldKey);
    step.imageSaved = true;
  }
}

function renderThumbs() {
  const row = document.getElementById('attachments-row');
  const list = document.getElementById('thumb-list');
  if (attachedImages.length === 0) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  list.innerHTML = attachedImages.map((img, i) => `
    <div class="attach-preview">
      <img src="${img.dataUrl}" alt="${img.name}">
      <div class="remove-img" onclick="removeImg(${i})">×</div>
    </div>
  `).join('');
}

function removeImg(i) {
  attachedImages.splice(i, 1);
  renderThumbs();
}

function clearAttachments() {
  attachedImages = [];
  renderThumbs();
}

// ══════════════════════════════════════════════
// PREVIEW PANEL
// ══════════════════════════════════════════════
function renderPreview(proc) {
  const body = document.getElementById('preview-body');
  const d = proc?.data || {};

  let filled = 0, total = 7;
  if (d.purpose) filled++;
  if (d.scope) filled++;
  if (d.definitions?.length) filled++;
  if (d.responsibilities?.length) filled++;
  if (d.steps?.length) filled++;
  if (d.acceptance_criteria) filled++;
  if (d.records) filled++;

  const pct = Math.round((filled / total) * 100);
  document.getElementById('preview-completeness').textContent = `${pct}%`;

  if (!proc || !Object.keys(d).length) {
    body.innerHTML = `<div style="color:var(--muted); font-size:13px; text-align:center; padding:32px 0;">La información capturada aparecerá aquí en tiempo real.</div>`;
    return;
  }

  body.innerHTML = `
    <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    <div style="height:16px"></div>

    <div class="preview-section">
      <div class="preview-section-title">Encabezado</div>
      <div class="preview-field">
        <div class="preview-label">TÍTULO</div>
        <div class="preview-value ${!d.title ? 'empty' : ''}">${d.title || 'Pendiente…'}</div>
      </div>
      <div class="preview-field">
        <div class="preview-label">CÓDIGO</div>
        <div class="preview-value ${!d.code ? 'empty' : ''}">${d.code || 'Pendiente…'}</div>
      </div>
    </div>

    <div class="preview-section">
      <div class="preview-section-title">I. Propósito</div>
      <div class="preview-value ${!d.purpose ? 'empty' : ''}">${d.purpose || 'Pendiente…'}</div>
    </div>

    <div class="preview-section">
      <div class="preview-section-title">II. Alcance</div>
      <div class="preview-value ${!d.scope ? 'empty' : ''}">${d.scope || 'Pendiente…'}</div>
    </div>

    ${d.definitions?.length ? `
    <div class="preview-section">
      <div class="preview-section-title">III. Definiciones</div>
      ${d.definitions.map(def => `
        <div class="preview-field">
          <div class="preview-label">${def.term}</div>
          <div class="preview-value">${def.definition}</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${d.responsibilities?.length ? `
    <div class="preview-section">
      <div class="preview-section-title">IV. Responsabilidades</div>
      ${d.responsibilities.map(r => `
        <div class="preview-field">
          <div class="preview-label">${r.role}</div>
          <div class="preview-value">${r.responsibility}</div>
        </div>
      `).join('')}
    </div>` : ''}

    ${d.steps?.length ? `
    <div class="preview-section">
      <div class="preview-section-title">V. Procedimiento (${d.steps.length} pasos)</div>
      <div class="step-list">
        ${d.steps.map(s => `
          <div class="step-row">
            <div class="step-num">${s.number}.</div>
            <div style="flex:1; font-size:12px;">${s.title || s.description?.slice(0, 60) || ''}${(s.hasImage || s.imageId) ? ' <span style="color:var(--accent2)" title="Este paso tiene foto">📷</span>' : ''}</div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    ${d.acceptance_criteria ? `
    <div class="preview-section">
      <div class="preview-section-title">VI. Criterios</div>
      <div class="preview-value">${d.acceptance_criteria}</div>
    </div>` : ''}
  `;

  renderPendingPanel(proc);
}

// ══════════════════════════════════════════════
// EXPORT — generates HTML document for print-to-PDF
// ══════════════════════════════════════════════
async function exportDocx() {
  const proc = getCurrentProc();
  if (!proc?.data || !proc.complete) {
    showNotif('Completa la entrevista primero'); return;
  }
  showNotif('⏳ Generando documento Word…');

  const d = proc.data;
  const today = d.date || new Date().toLocaleDateString('es-MX');

  // Build a full HTML document mimicking the Word format
  const htmlDoc = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${d.code || 'KMX'} - ${d.title || 'Procedimiento'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&display=swap');
  body { font-family: 'Source Sans 3', Arial, sans-serif; font-size: 11pt; color: #1a1a18; margin: 0; background: white; }
  @page { size: Letter; margin: 1.8cm 1.2cm 1.2cm 1.2cm; }
  @media print { .no-print { display: none !important; } body { margin: 0; } }

  .header-bar { border-bottom: 3px solid #1A3A6B; padding-bottom: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header-left h1 { font-size: 13pt; color: #1A3A6B; font-weight: 700; margin: 0 0 2px 0; }
  .header-left p { font-size: 9pt; color: #555; margin: 0; }
  .header-right { font-size: 8pt; color: #444; line-height: 1.7; text-align: right; }
  .header-right strong { color: #1A3A6B; }

  h2.section { font-size: 12pt; color: #1A3A6B; font-weight: 700; margin: 20px 0 6px 0; padding-bottom: 4px; border-bottom: 2px solid #C8380A; }
  h2.section span { color: #C8380A; margin-right: 4px; }

  p { margin: 0 0 8px 0; line-height: 1.6; text-align: justify; }

  table { width: 100%; border-collapse: collapse; margin: 8px 0 14px 0; font-size: 10pt; }
  th { background: #1A3A6B; color: white; padding: 6px 10px; text-align: left; font-weight: 600; }
  td { padding: 5px 10px; border: 1px solid #ccc; vertical-align: top; }
  tr:nth-child(even) td { background: #f4f3ef; }

  .step { margin-bottom: 14px; }
  .step-title { font-weight: 700; color: #1A3A6B; margin-bottom: 4px; }
  .step-title .step-num { color: #C8380A; margin-right: 4px; }
  .step-note { background: #fff8e6; border-left: 3px solid #C8380A; padding: 5px 10px; font-size: 9.5pt; color: #7a5c00; margin-top: 4px; }
  .step img { max-width: 480px; max-height: 320px; width: auto; height: auto; display: block; border: 1px solid #ddd; border-radius: 4px; margin: 8px 0; page-break-inside: avoid; }

  .print-btn { position: fixed; bottom: 20px; right: 20px; background: #1A3A6B; color: white; border: none; padding: 12px 22px; border-radius: 6px; font-size: 13px; cursor: pointer; font-family: inherit; font-weight: 600; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
  .print-btn:hover { background: #122d55; }
</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>

<div class="header-bar">
  <div class="header-left">
    <h1>${d.title || 'Procedimiento Técnico'}</h1>
    <p>Laboratorio de Emisiones · KMX · Departamento QA</p>
  </div>
  <div class="header-right">
    <strong>Document#:</strong> ${d.code || '—'}<br>
    <strong>Revision:</strong> ${d.revision || '1'}<br>
    <strong>Date:</strong> ${today}<br>
    <strong>Dept:</strong> QA / Emisiones
  </div>
</div>

<h2 class="section"><span>I.</span> Propósito / Purpose</h2>
<p>${d.purpose || '—'}</p>

<h2 class="section"><span>II.</span> Alcance / Scope</h2>
<p>${d.scope || '—'}</p>

${d.definitions && d.definitions.length ? `
<h2 class="section"><span>III.</span> Definiciones / Definitions</h2>
<table>
  <tr><th>Término / Element</th><th>Definición / Definition</th></tr>
  ${d.definitions.map(def => `<tr><td><strong>${def.term || ''}</strong></td><td>${def.definition || ''}</td></tr>`).join('')}
</table>` : ''}

${d.responsibilities && d.responsibilities.length ? `
<h2 class="section"><span>IV.</span> Responsabilidades / Responsibilities</h2>
<table>
  <tr><th>Posición</th><th>Responsabilidad</th><th>Autoridad</th></tr>
  ${d.responsibilities.map(r => `<tr><td><strong>${r.role || ''}</strong></td><td>${r.responsibility || ''}</td><td>${r.authority || ''}</td></tr>`).join('')}
</table>` : ''}

${d.steps && d.steps.length ? `
<h2 class="section"><span>V.</span> Procedimiento / Procedure</h2>
${d.steps.map(s => `
<div class="step">
  <div class="step-title"><span class="step-num">${s.number || ''}.</span>${s.title || ''}</div>
  <p>${s.description || ''}</p>
  ${s.notes ? `<div class="step-note">⚠ Nota: ${s.notes}</div>` : ''}
  ${s.hasImage || s.imageId ? `<img id="step-img-${s.number || s.imageId}" style="max-width:100%;border:1px solid #ddd;border-radius:4px;margin:8px 0;display:block;" src="" alt="Foto paso ${s.number}" onerror="this.style.display='none'">` : ''}
</div>`).join('')}` : ''}

${d.acceptance_criteria ? `
<h2 class="section"><span>VI.</span> Criterios de Aceptación</h2>
<p>${d.acceptance_criteria}</p>` : ''}

${d.records ? `
<h2 class="section"><span>VII.</span> Registros y Documentos</h2>
<p>${d.records}</p>` : ''}

${d.related_procedures && d.related_procedures.length ? `
<h2 class="section"><span>VIII.</span> Procedimientos Relacionados</h2>
${d.related_procedures.map(r => `<p>• ${r}</p>`).join('')}` : ''}

<h2 class="section"><span>IX.</span> Control de Cambios / Change Description</h2>
<table>
  <tr><th>Rev.</th><th>Fecha</th><th>Elaboró</th><th>Sección</th><th>Descripción del Cambio</th></tr>
  <tr>
    <td>${d.revision || '1'}</td>
    <td>${today}</td>
    <td>${d.author || ''}</td>
    <td>Documento completo</td>
    <td>Creación del documento</td>
  </tr>
</table>

</body>
</html>`;

  // Resolve any pending image assignments (images added before proc was complete)
  if (proc.pendingImages?.length && d.steps) {
    for (const pi of proc.pendingImages) {
      const step = d.steps.find(s => s.number == pi.stepNum);
      if (step) { step.hasImage = true; step.imageId = pi.stepNum; step.imageSaved = true; }
    }
    proc.pendingImages = [];
    saveProcedures();
  }

  // Load images from IndexedDB and embed as base64 before opening
  if (d.steps) {
    await Promise.all(d.steps.map(async step => {
      if (step.hasImage || step.imageId) {
        const key = `${proc.id}_step_${step.imageId || step.number}`;
        try {
          const imgData = await ImageStore.get(key);
          if (imgData?.dataUrl) step._imgDataUrl = imgData.dataUrl;
        } catch(e) { /* image not found, will show placeholder */ }
      }
    }));
  }

  // Rebuild htmlDoc with actual images embedded
  const htmlDocFinal = htmlDoc.replace(
    /(<img id="step-img-(\d+)"[^>]*) src=""([^>]*>)/g,
    (match, prefix, stepNum, suffix) => {
      const step = d.steps?.find(s => (s.number || s.imageId) == stepNum);
      if (step?._imgDataUrl) {
        return `${prefix} src="${step._imgDataUrl}"${suffix}`;
      }
      const context = step?.imageContext || `Foto del paso ${stepNum}`;
      return `<div style="border:2px dashed #C8380A;background:#fff8e6;padding:20px;text-align:center;border-radius:6px;margin:10px 0;page-break-inside:avoid;">
  <div style="font-size:26px;margin-bottom:6px;">📷</div>
  <div style="font-weight:700;color:#C8380A;font-size:10pt;margin-bottom:6px;">IMAGEN PENDIENTE — Paso ${stepNum}</div>
  <div style="font-size:9pt;color:#7a5c00;font-style:italic;">${context}</div>
</div>`;
    }
  );

  // Open in new tab — user can Print → Save as PDF
  const blob = new Blob([htmlDocFinal], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);

  // Also download JSON backup
  const jsonBlob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);
  const a = document.createElement('a');
  a.href = jsonUrl;
  a.download = `${d.code || 'procedimiento'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(jsonUrl), 5000);

  showNotif('✓ Documento generado con fotos — imprime o guarda como PDF');
}

// ══════════════════════════════════════════════
// API KEY GUIDE MODAL
// ══════════════════════════════════════════════
function showApiGuide() {
  document.getElementById('api-guide-modal').classList.add('open');
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function useExample(el) {
  const text = el.textContent.replace(/[""]/g, '');
  document.getElementById('chat-input').value = text;
  document.getElementById('chat-input').focus();
}

function showNotif(msg) {
  const n = document.getElementById('notif');
  n.textContent = msg;
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 2800);
}

// ══════════════════════════════════════════════
// PENDING PANEL
// ══════════════════════════════════════════════
function switchPreviewTab(tab) {
  const isPreview = tab === 'preview';
  document.getElementById('tab-preview').classList.toggle('active', isPreview);
  document.getElementById('tab-pending').classList.toggle('active', !isPreview);
  document.getElementById('preview-body').style.display = isPreview ? 'block' : 'none';
  document.getElementById('pending-body').style.display = isPreview ? 'none' : 'block';
}

function renderPendingPanel(proc) {
  const d = proc?.data || {};
  const pendingImgs = (d.steps || []).filter(s => s.hasImage && !s.imageSaved);

  const badge = document.getElementById('pending-badge');
  if (badge) {
    badge.textContent = pendingImgs.length;
    badge.style.display = pendingImgs.length > 0 ? 'inline-flex' : 'none';
  }

  const body = document.getElementById('pending-body');
  if (!body) return;

  const missingSections = [];
  if (!d.purpose) missingSections.push('Propósito');
  if (!d.scope) missingSections.push('Alcance');
  if (!d.definitions?.length) missingSections.push('Definiciones');
  if (!d.responsibilities?.length) missingSections.push('Responsabilidades');
  if (!d.steps?.length) missingSections.push('Pasos del procedimiento');
  if (!d.acceptance_criteria) missingSections.push('Criterios de aceptación');
  if (!d.records) missingSections.push('Registros');

  if (!pendingImgs.length && !missingSections.length) {
    body.innerHTML = `<div style="color:var(--muted);text-align:center;padding:32px 16px;font-size:13px;line-height:1.6;">✓ Sin pendientes<br><span style="font-size:11px;">El procedimiento está completo.</span></div>`;
    return;
  }

  let html = '';

  if (pendingImgs.length) {
    html += `<div class="pending-section-title">📷 Fotos pendientes (${pendingImgs.length})</div>`;
    html += pendingImgs.map(s => `
      <div class="pending-img-card">
        <div class="pending-step-num">Paso ${s.number}</div>
        <div class="pending-step-title">${s.title || '(sin título)'}</div>
        ${s.imageContext ? `<div class="pending-img-context">"${s.imageContext}"</div>` : ''}
        <button class="pending-assign-btn" onclick="openAssignImageModalForStep(${s.number})">+ Asignar foto</button>
      </div>
    `).join('');
  }

  if (missingSections.length) {
    html += `<div class="pending-section-title" style="margin-top:${pendingImgs.length ? 16 : 0}px;">📋 Secciones incompletas</div>`;
    html += missingSections.map(s => `<div class="pending-missing-section">• ${s}</div>`).join('');
  }

  body.innerHTML = html;
}

// ══════════════════════════════════════════════
// ASSIGN IMAGE TO STEP
// ══════════════════════════════════════════════
let assignPendingImg = null;

function openAssignImageModal() {
  assignPendingImg = null;
  document.getElementById('assign-preview').style.display = 'none';
  document.getElementById('assign-placeholder').style.display = 'block';
  document.getElementById('assign-step-num').value = '';
  document.getElementById('assign-step-preview').textContent = '';
  document.getElementById('assign-img-modal').classList.add('open');
}

function openAssignImageModalForStep(stepNum) {
  openAssignImageModal();
  const input = document.getElementById('assign-step-num');
  input.value = stepNum;
  input.dispatchEvent(new Event('input'));
}

function closeAssignModal() {
  document.getElementById('assign-img-modal').classList.remove('open');
}

function handleAssignDrop(event) {
  event.preventDefault();
  document.getElementById('assign-drop-zone').style.borderColor = 'var(--border)';
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) loadAssignFile(file);
}

function handleAssignFileSelect(event) {
  const file = event.target.files[0];
  if (file) loadAssignFile(file);
  event.target.value = '';
}

function loadAssignFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    assignPendingImg = { dataUrl: e.target.result, mimeType: file.type, name: file.name };
    document.getElementById('assign-img-preview').src = e.target.result;
    document.getElementById('assign-img-name').textContent = file.name;
    document.getElementById('assign-preview').style.display = 'block';
    document.getElementById('assign-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

// Show step title preview when user types a step number
document.addEventListener('input', (e) => {
  if (e.target.id !== 'assign-step-num') return;
  const num = parseInt(e.target.value);
  const proc = getCurrentProc();
  const preview = document.getElementById('assign-step-preview');
  if (!num || !proc?.data?.steps) { preview.textContent = ''; return; }
  const step = proc.data.steps.find(s => s.number == num);
  if (step) {
    preview.innerHTML = '<span style="color:var(--accent2)">Paso ' + num + ':</span> ' + (step.title || step.description?.slice(0,60) || '(sin título)');
  } else {
    preview.innerHTML = '<span style="color:var(--muted)">Paso ' + num + ' no encontrado en el procedimiento</span>';
  }
});

async function saveAssignedImage() {
  if (!assignPendingImg) { showNotif('Selecciona una imagen primero'); return; }
  const stepNum = parseInt(document.getElementById('assign-step-num').value);
  if (!stepNum || stepNum < 1) { showNotif('Ingresa un número de paso válido'); return; }
  const proc = getCurrentProc();
  if (!proc) { showNotif('No hay procedimiento activo'); return; }

  const key = proc.id + '_step_' + stepNum;
  await ImageStore.set(key, { dataUrl: assignPendingImg.dataUrl, mimeType: assignPendingImg.mimeType, name: assignPendingImg.name });

  if (proc.data?.steps) {
    const step = proc.data.steps.find(s => s.number == stepNum);
    if (step) { step.hasImage = true; step.imageId = stepNum; step.imageSaved = true; }
    else {
      if (!proc.pendingImages) proc.pendingImages = [];
      proc.pendingImages.push({ stepNum, key });
    }
  } else {
    if (!proc.pendingImages) proc.pendingImages = [];
    proc.pendingImages.push({ stepNum, key });
  }

  saveProcedures();
  renderPreview(proc);
  closeAssignModal();
  showNotif('✓ Foto guardada para el paso ' + stepNum);
}
