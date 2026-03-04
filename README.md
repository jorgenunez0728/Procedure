# KMX Procedure Creator 📋

**Herramienta de documentación de procedimientos técnicos con IA para el Laboratorio de Emisiones KMX — KIA México.**

Un entrevistador inteligente que captura procedimientos en lenguaje natural, acepta fotos en cualquier paso, y exporta documentos con el formato oficial del departamento.

---

## ¿Qué hace?

En lugar de abrir Word y escribir desde cero, describes el procedimiento en conversación. La IA te hace preguntas una por una, tú respondes naturalmente, adjuntas fotos donde las necesites, y al final genera el documento con la estructura oficial KMX:

```
I.   Propósito
II.  Alcance
III. Definiciones
IV.  Responsabilidades
V.   Procedimiento paso a paso (con fotos)
VI.  Criterios de aceptación
VII. Registros y documentos
VIII. Procedimientos relacionados
IX.  Control de cambios
```

---

## Stack técnico

| Capa | Tecnología | Razón |
|---|---|---|
| UI | HTML + CSS + JS vanilla | Sin dependencias, corre offline |
| IA | Claude API (`claude-sonnet-4-5`) | NLP en español, visión para fotos |
| Datos texto | `localStorage` | Persistencia sin backend |
| Datos imágenes | `IndexedDB` | Sin límite de 5MB del localStorage |
| Exportación | HTML → PDF (print) | Sin servidor requerido |
| Exportación avanzada | `docx` npm (Node.js) | Word nativo opcional |

> **Restricción IT KMX:** Sin servicios externos de nube. Todo corre en el navegador. La única llamada externa es a la API de Anthropic para el chat.

---

## Estructura del repo

```
kmx-procedure-creator/
├── procedure-creator.html   # App principal — todo en un solo archivo
├── generate_docx.js         # Script Node.js para exportar .docx nativo (opcional)
├── package.json             # Solo para generate_docx.js
├── README.md
├── CHANGELOG.md
└── .gitignore
```

---

## Instalación y uso

### Opción A — Solo el HTML (recomendada, sin instalación)

1. Descarga `procedure-creator.html`
2. Ábrelo en Chrome o Edge
3. Ingresa tu API Key de Anthropic en la barra superior
4. Crea un nuevo procedimiento con el botón `+`

No requiere servidor, npm, ni instalación de ningún tipo.

### Opción B — Con exportación Word nativa

```bash
# Requiere Node.js >= 16
npm install

# Generar un .docx desde un JSON de procedimiento
node generate_docx.js ./mi_procedimiento.json ./output.docx
```

---

## API Key — cómo obtenerla

1. Ve a [console.anthropic.com](https://console.anthropic.com)
2. Crea una cuenta con tu email
3. Menú izquierdo → **API Keys** → **Create Key**
4. Copia la clave (`sk-ant-api03-...`)
5. Pégala en la barra superior de la app → **Guardar**

**Costo:** ~$0.008 USD por procedimiento completo. Anthropic regala $5 USD al registrarte (≈ 600 procedimientos gratis).

La API key se guarda solo en tu navegador (`localStorage`). No se envía a ningún servidor propio.

---

## Flujo de uso

```
1. Crear procedimiento (+)
        ↓
2. Chat con la IA
   - Describe el procedimiento en lenguaje natural
   - Responde las preguntas de la IA una por una
   - Adjunta fotos con 📎 en cualquier momento
   - O usa "📷 Asignar foto" para vincular fotos a pasos específicos
        ↓
3. IA genera el JSON estructurado automáticamente
        ↓
4. Vista previa en tiempo real (panel derecho)
        ↓
5. Exportar Word → abre en nueva pestaña → Ctrl+P → Guardar PDF
```

### Tip: Detección de procedimientos similares

Cuando describes un procedimiento nuevo, la IA compara con los ya documentados en tu biblioteca. Si detecta similitud (ej. "Calibración Dinamómetro A" vs "Calibración Dinamómetro B"), solo pregunta lo que es diferente — ahorra 70% del tiempo de captura.

---

## Formato del JSON interno

Cada procedimiento se guarda con esta estructura:

```json
{
  "title": "Calibración Deadweight de Dinamómetro",
  "code": "COP15-P31",
  "revision": "1",
  "date": "04/03/2026",
  "author": "Jorge Martínez",
  "purpose": "...",
  "scope": "...",
  "definitions": [
    { "term": "Deadweight", "definition": "..." }
  ],
  "responsibilities": [
    { "role": "Técnico", "responsibility": "...", "authority": "..." }
  ],
  "steps": [
    { "number": 1, "title": "Preparación", "description": "...", "notes": "...", "hasImage": true, "imageId": 1 }
  ],
  "acceptance_criteria": "...",
  "records": "...",
  "related_procedures": ["COP15-P30"]
}
```

Las imágenes **no** se guardan en el JSON — se almacenan en IndexedDB con la clave `{procId}_step_{stepNumber}`.

---

## Datos persistentes

| Dato | Dónde | Formato |
|---|---|---|
| Procedimientos (texto + metadata) | `localStorage['kmx_procedures']` | JSON array |
| API Key | `localStorage['kmx_api_key']` | String |
| Imágenes de pasos | `IndexedDB['kmx_proc_images']` | `{dataUrl, mimeType, name}` |

---

## Roadmap

### v1.0 (actual)
- [x] Chat con Claude API en español
- [x] Biblioteca de procedimientos con localStorage
- [x] Adjuntar fotos durante el chat
- [x] Asignar fotos a pasos específicos (modal drag & drop)
- [x] IndexedDB para imágenes (sin límite de tamaño)
- [x] Detección de procedimientos similares
- [x] Vista previa en tiempo real
- [x] Exportación HTML imprimible con fotos embebidas
- [x] Exportación JSON backup
- [x] Script Node.js para .docx nativo

### v1.1 (próximo)
- [ ] Modo edición del procedimiento capturado (editar JSON visual)
- [ ] Firma digital de técnico y supervisor
- [ ] Número de folio automático por departamento

### v1.2
- [ ] Exportación .docx nativa directamente desde el navegador (sin Node.js)
- [ ] Exportación PDF con header/footer de KMX

### v2.0
- [ ] Sync con Firebase (modo multi-usuario en red local)
- [ ] Búsqueda full-text en biblioteca
- [ ] Control de revisiones (diff entre versiones)

---

## Para Claude Code

Si vas a trabajar en este proyecto con Claude Code, aquí el contexto clave:

- **Archivo principal:** `procedure-creator.html` — app de ~1,800 líneas, todo en un solo archivo (HTML + CSS + JS inline). Esta es una decisión de diseño intencional para facilitar el despliegue offline.
- **Sin framework:** JS vanilla puro, sin React/Vue/bundler.
- **Datos sensibles:** No hardcodear API keys. El usuario las ingresa en la UI.
- **localStorage key protegida:** `kmx_procedures` — no renombrar sin migración.
- **Restricción crítica:** No agregar dependencias externas en el HTML (CDN ok, npm no).
- **Idioma:** La UI y el system prompt de Claude están en español. Mantener así.
- **Sistema de imágenes:** IndexedDB wrapper en `ImageStore` — no migrar a otra solución sin considerar compatibilidad con datos existentes.

---

## Contexto del laboratorio

- **Laboratorio:** KMX Emissions Lab — KIA México, Pesquería, NL
- **Departamento:** QA / Emisiones
- **Uso:** Documentar procedimientos operativos que actualmente existen solo en la memoria del equipo o en formatos de papel
- **Volumen estimado:** 50-100 procedimientos por documentar inicialmente
- **Formato de referencia:** `COP15-P30_COP_Testing_Procedure.docx` — ver sección IX para estructura de change log

---

## Licencia

MIT — libre para uso interno en KMX.
