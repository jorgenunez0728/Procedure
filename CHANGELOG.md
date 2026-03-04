# Changelog

Todas las versiones notables de este proyecto están documentadas aquí.  
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [1.0.0] — 2026-03-04

### Primera versión funcional completa (MVP)

#### Agregado
- **Chat con Claude API** — entrevistador inteligente en español que captura procedimientos en lenguaje natural, haciendo 2-3 preguntas a la vez
- **Biblioteca de procedimientos** — sidebar con lista de todos los procedimientos guardados, con código, nombre y fecha
- **Detección de similitud** — la IA compara el procedimiento nuevo con los existentes y reutiliza información para no repetir preguntas
- **Sistema de imágenes (IndexedDB)** — almacenamiento de fotos sin límite de tamaño, separado del localStorage
- **Adjuntar fotos en el chat** — botón 📎 para enviar imágenes directamente en la conversación; Claude pregunta a qué paso pertenecen
- **Modal "Asignar foto a paso"** — interfaz drag & drop para vincular fotos a pasos específicos en cualquier momento del proceso
- **Fotos pendientes** — si se asignan fotos antes de completar la entrevista, se resuelven automáticamente al exportar
- **Vista previa en tiempo real** — panel derecho que muestra las secciones capturadas y barra de progreso (0-100%)
- **Exportación HTML imprimible** — documento con formato KMX (colores azul/rojo, tablas de definiciones y responsabilidades, pasos numerados) con fotos embebidas, listo para Ctrl+P → PDF
- **Exportación JSON** — backup automático de los datos estructurados del procedimiento
- **Script Node.js `generate_docx.js`** — generador de .docx nativo con header, footer, tablas y estilos KMX (requiere Node.js)
- **Guía de API Key integrada** — modal con instrucciones paso a paso para obtener y configurar la API Key de Anthropic
- **Modo sin procedimiento activo** — se puede escribir directamente en el chat para crear un procedimiento sobre la marcha

#### Estructura del documento exportado
- I. Propósito / Purpose
- II. Alcance / Scope
- III. Definiciones / Definitions (tabla)
- IV. Responsabilidades / Responsibilities (tabla)
- V. Procedimiento paso a paso (con fotos embebidas)
- VI. Criterios de Aceptación
- VII. Registros y Documentos
- VIII. Procedimientos Relacionados
- IX. Control de Cambios / Change Description (tabla)

#### Técnico
- App 100% offline-first, sin backend requerido
- Single HTML file (~1,800 líneas), sin dependencias externas en runtime
- localStorage para texto/metadata, IndexedDB para imágenes
- Compatible con Chrome, Edge (Chromium)
- System prompt optimizado para español técnico de laboratorio

---

## [0.3.0] — 2026-03-03 *(pre-release)*

### Exportación HTML + guía API Key

#### Agregado
- Exportación de documento en formato HTML imprimible con estilos KMX
- Modal de guía para obtener API Key con instrucciones detalladas y costos
- Botón "❓ ¿Qué es esto?" en la barra superior

#### Cambiado
- Exportación anterior (solo JSON) reemplazada por HTML + JSON simultáneamente

---

## [0.2.0] — 2026-03-02 *(pre-release)*

### Entrevistador con API Claude

#### Agregado
- Integración con Claude API (`claude-sonnet-4-5`)
- Sistema de mensajes multi-turno con historial completo
- Extracción automática de `<PROCEDURE_DATA>` del JSON al completar la entrevista
- Indicador de escritura (typing indicator) animado
- Vista previa con las secciones capturadas en tiempo real
- Adjuntar imágenes en mensajes (base64 + vision API)
- Detección de procedimientos similares en el system prompt

#### Técnico
- `SYSTEM_PROMPT` con instrucciones detalladas de entrevistador
- Parseo de bloque `<PROCEDURE_DATA>{JSON}</PROCEDURE_DATA>` en respuesta del modelo
- Manejo de errores de API con mensajes en español

---

## [0.1.0] — 2026-03-01 *(pre-release)*

### MVP inicial — estructura y UI

#### Agregado
- Interfaz de 3 paneles: sidebar (biblioteca), chat central, vista previa
- Barra superior con campo de API Key
- Sidebar con lista de procedimientos y botón "+"
- Modal de nuevo procedimiento (nombre + código)
- Área de chat con input de texto y soporte de Shift+Enter
- Barra de progreso en panel de vista previa
- Notificaciones toast
- Paleta de colores KMX (azul `#1A3A6B`, rojo `#C8380A`)
- Fuentes IBM Plex Sans + IBM Plex Mono
- Persistencia básica en localStorage
