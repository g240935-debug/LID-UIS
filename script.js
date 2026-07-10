/* ═══════════════════════════════════════════════════════
   LID — script.js
   Conexión al backend: https://lid-uis.onrender.com/api/chat
   No modificar URL_BACKEND sin actualizar el servidor.

   MAPA DE PÁGINAS:
   0  → Portada
   1  → Cap I · Presentación
   2  → Cap I · Actividad: frec. absoluta + relativa  (IA: freq_A_*)
   3  → Cap I · Actividad: Curcio N3/N4              (IA: freq_B_*)
   4  → Cap I · Actividad: frec. acumuladas           (IA: freq_C_* + freq_D_*)
   5  → Cap I · Síntesis
   6  → Cap II · Presentación
   7  → Cap II · Actividad tablas contingencia        (IA: default)
   8  → Cap II · Síntesis
   9  → Cap III · Formas parciales
   10 → Cap III · Actividad IA                       (IA: cap3_*)
   11 → Cap IV · Ejemplos dinámicos
   12 → Cap IV · Formulación (Problemas A)
   13 → Cap IV · Validación (Problemas B)
   14 → Cap V  · Exploración libre chi               (IA: chi_*)
═══════════════════════════════════════════════════════ */

const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';
let sessionId = localStorage.getItem('lid_uid');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('lid_uid', sessionId);
}

// ── Persistencia local por dispositivo (localStorage nunca se sincroniza entre
// dispositivos, y cada llave incluye sessionId para que una sesión nueva en el
// mismo equipo nunca recoja datos de una sesión anterior) ──
function guardarEstadoLocal(clave, obj) {
  try { localStorage.setItem(`lid_${sessionId}_${clave}`, JSON.stringify(obj)); }
  catch (e) { /* almacenamiento lleno o no disponible: no interrumpe la app */ }
}
function leerEstadoLocal(clave) {
  try {
    const raw = localStorage.getItem(`lid_${sessionId}_${clave}`);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

// ════════════════════════════════════════════════
// SOFT GATE — ruptura explícita del contrato didáctico
// Nunca bloquea el avance: solo expone la consecuencia cognitiva de saltar una
// situación de aprendizaje, y si el estudiante decide avanzar de todos modos,
// registra el hito incompleto en el backend para la trazabilidad de la
// investigación (no solo en localStorage, que nunca llegaría al investigador).
// ════════════════════════════════════════════════
const MENSAJE_GATE_COMPLETITUD = 'Estás a punto de avanzar sin haber completado esta situación de aprendizaje. La construcción del concepto que trabajamos aquí depende de que la resuelvas antes de continuar — saltarla ahora puede dejarte sin la base que necesitas más adelante.\n\nAun así, tú decides.';
const MENSAJE_GATE_INTERACCION = 'Estás a punto de avanzar sin haber interactuado con el tutor en esta página. La exploración con el tutor es donde se construye el razonamiento de esta situación — sin ella, es probable que te falte una base importante más adelante.\n\nAun así, tú decides.';

function mostrarSoftGate(mensaje) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('soft-gate-overlay');
    const msgEl = document.getElementById('soft-gate-mensaje');
    const btnVolver = document.getElementById('soft-gate-btn-volver');
    const btnContinuar = document.getElementById('soft-gate-btn-continuar');
    if (!overlay || !msgEl || !btnVolver || !btnContinuar) { resolve(true); return; }
    msgEl.textContent = mensaje;
    overlay.style.display = 'flex';
    const limpiar = () => {
      overlay.style.display = 'none';
      btnVolver.onclick = null;
      btnContinuar.onclick = null;
    };
    btnVolver.onclick = () => { limpiar(); resolve(false); };
    btnContinuar.onclick = () => { limpiar(); resolve(true); };
  });
}

function registrarHitoIncompleto(pagina, hito) {
  try {
    fetch(URL_BACKEND.replace('/api/chat', '/api/log/hito_incompleto'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, pagina, hito, timestamp: new Date().toISOString() })
    }).catch(() => {});
  } catch (e) { /* un fallo de registro nunca debe interrumpir la navegación */ }
}

// Verifica si hubo al menos una interacción del estudiante en un chat (para
// páginas sin una señal formal de "completado" — diálogos abiertos por diseño).
function huboInteraccion(chatBoxId) {
  const box = document.getElementById(chatBoxId);
  return !!(box && box.querySelector('.msg-user'));
}

// Función central del Soft Gate. Si `estaCompleto` es true, avanza directo sin
// ningún aviso. Si es false, expone el aviso — y solo si el estudiante decide
// avanzar de todos modos, se registra el hito incompleto y se navega.
async function intentarAvanzarConGate(destino, estaCompleto, pagina, hito, mensaje) {
  if (estaCompleto) { irAPagina(destino); return; }
  const continuar = await mostrarSoftGate(mensaje || MENSAJE_GATE_INTERACCION);
  if (continuar) {
    registrarHitoIncompleto(pagina, hito);
    irAPagina(destino);
  }
}

// ════════════════════════════════════════════════
// MICROCALCULADORA — botón flotante global, para que el estudiante haga
// cálculos rápidos sin salir del libro. Sin eval() sobre strings: la
// aritmética se resuelve con un switch explícito.
// ════════════════════════════════════════════════
let calcDisplayValor    = '0';
let calcOperandoGuardado = null;
let calcOperadorPendiente = null;
let calcEsperandoNuevo   = false;

function calcToggle() {
  const panel = document.getElementById('calc-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

// Posiciona el botón (y el panel) junto al número de página de la página
// ACTUALMENTE visible — no requiere tocar el encabezado de cada página, se
// recalcula en vivo con la posición real del elemento .page-num en pantalla.
function calcPosicionarBoton() {
  const btn = document.getElementById('calc-toggle-btn');
  const panel = document.getElementById('calc-panel');
  if (!btn) return;

  const paginaEl = document.getElementById(`page-${paginaActual}`);
  const pageNumEl = paginaEl ? paginaEl.querySelector('.page-num') : null;

  if (!pageNumEl) {
    // Sin número de página visible en esta página: posición por defecto discreta
    btn.style.top = '14px';
    btn.style.left = '';
    btn.style.right = '14px';
  } else {
    const rect = pageNumEl.getBoundingClientRect();
    const btnAncho = 30;
    let left = rect.left - btnAncho - 8;
    if (left < 4) left = rect.right + 8; // si no cabe a la izquierda, va a la derecha del número
    btn.style.top   = `${Math.max(4, rect.top - 6)}px`;
    btn.style.left  = `${left}px`;
    btn.style.right = '';
  }

  if (panel) {
    const btnRect = btn.getBoundingClientRect();
    panel.style.top  = `${btnRect.bottom + 8}px`;
    let panelLeft = btnRect.left - 190 + btnRect.width; // alinear el borde derecho del panel con el botón
    if (panelLeft < 4) panelLeft = 4;
    panel.style.left  = `${panelLeft}px`;
    panel.style.right = '';
  }
}
window.addEventListener('resize', () => calcPosicionarBoton());

function calcActualizarDisplay() {
  const el = document.getElementById('calc-display');
  if (el) el.textContent = calcDisplayValor;
}

function calcDigito(d) {
  if (calcEsperandoNuevo || calcDisplayValor === '0') {
    calcDisplayValor = d;
    calcEsperandoNuevo = false;
  } else {
    if (calcDisplayValor.replace('-','').replace('.','').length >= 12) return; // evitar overflow visual
    calcDisplayValor += d;
  }
  calcActualizarDisplay();
}

function calcDecimal() {
  if (calcEsperandoNuevo) { calcDisplayValor = '0.'; calcEsperandoNuevo = false; calcActualizarDisplay(); return; }
  if (!calcDisplayValor.includes('.')) {
    calcDisplayValor += '.';
    calcActualizarDisplay();
  }
}

function calcClear() {
  calcDisplayValor = '0';
  calcOperandoGuardado = null;
  calcOperadorPendiente = null;
  calcEsperandoNuevo = false;
  calcActualizarDisplay();
}

function calcSigno() {
  if (calcDisplayValor === '0') return;
  calcDisplayValor = calcDisplayValor.startsWith('-') ? calcDisplayValor.slice(1) : '-' + calcDisplayValor;
  calcActualizarDisplay();
}

function calcPorcentaje() {
  calcDisplayValor = String(parseFloat(calcDisplayValor) / 100);
  calcActualizarDisplay();
}

function calcCuadrado() {
  const v = parseFloat(calcDisplayValor);
  calcDisplayValor = calcFormatearResultado(v * v);
  calcEsperandoNuevo = true;
  calcActualizarDisplay();
}

function calcOperar(a, op, b) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return b === 0 ? NaN : a / b;
    default:  return b;
  }
}

function calcFormatearResultado(n) {
  if (isNaN(n)) return 'Error';
  if (!isFinite(n)) return 'Error';
  // Redondeo suave para evitar artefactos de coma flotante, sin perder precisión útil
  const redondeado = Math.round(n * 1e10) / 1e10;
  return String(redondeado);
}

function calcOperador(op) {
  const actual = parseFloat(calcDisplayValor);
  if (calcOperadorPendiente !== null && !calcEsperandoNuevo) {
    const resultado = calcOperar(calcOperandoGuardado, calcOperadorPendiente, actual);
    calcDisplayValor = calcFormatearResultado(resultado);
    calcOperandoGuardado = parseFloat(calcDisplayValor);
  } else {
    calcOperandoGuardado = actual;
  }
  calcOperadorPendiente = op;
  calcEsperandoNuevo = true;
  calcActualizarDisplay();
}

function calcIgual() {
  if (calcOperadorPendiente === null || calcOperandoGuardado === null) return;
  const actual = parseFloat(calcDisplayValor);
  const resultado = calcOperar(calcOperandoGuardado, calcOperadorPendiente, actual);
  calcDisplayValor = calcFormatearResultado(resultado);
  calcOperandoGuardado = null;
  calcOperadorPendiente = null;
  calcEsperandoNuevo = true;
  calcActualizarDisplay();
}

// ── Estado global ──
let graficoActual  = null;
let vistaActual    = 'tabla';
let paginaActual   = 0;

// Flags de inicialización por tutor
let chatCap2Iniciado   = false;  // pág 7
let cap2Completado     = false;  // para el Soft Gate
let cap3Completado     = false;  // para el Soft Gate
let freqUnifCompletado = false;  // para el Soft Gate
let chatCap3Iniciado   = false;  // pág 10
let chatChiIniciado    = false;  // pág 14
let chatFreqAIniciado  = false;  // pág 2
let chatFreqBIniciado  = false;  // pág 3 (legacy)
let chatFreqCIniciado  = false;  // pág 4 (fase C: frec. abs. acumulada)
let chatFreqDIniciado  = false;  // pág 4 (fase D: frec. rel. acumulada)
let chatFreqUnifIniciado = false; // pág 3 unificada

let freqCCompletado = false;     // true cuando la IA de fase C termina
let chiActual       = 0;

/* ════════════════════════════════
   SISTEMA DE AUDIO — Web Speech API
   Cada tutor tiene su propio toggle independiente.
   audioState[chatId] = { on: bool, speaking: bool }
════════════════════════════════ */

// Mapa: chatId → { btnId, wavesId }
const AUDIO_MAP = {
  'freq-unif': { btn: 'audio-btn-freq-unif', waves: 'audio-waves-freq-unif' },
  'cap2':      { btn: 'audio-btn-cap2',      waves: 'audio-waves-cap2'      },
  'cap3':      { btn: 'audio-btn-cap3',      waves: 'audio-waves-cap3'      },
  'cap3b':     { btn: 'audio-btn-cap3b',     waves: 'audio-waves-cap3b'     },
  'chi':       { btn: 'audio-btn-chi',       waves: 'audio-waves-chi'       },
  '5d':        { btn: 'audio-btn-5d',        waves: 'audio-waves-5d'        },
  'contA':     { btn: 'audio-btn-contA',     waves: 'audio-waves-contA'     },
  'contB':     { btn: 'audio-btn-contB',     waves: 'audio-waves-contB'     },
};

// Estado ON/OFF por tutor
const audioState = {};
Object.keys(AUDIO_MAP).forEach(k => { audioState[k] = false; });

// Mapeo chatBox → chatId para hablarTexto desde agregarMensajeGen
const BOX_TO_AUDIO = {
  'chat-freq-unif': 'freq-unif',
  'chat-box':       'cap2',
  'chat-box2':      'cap3',
  'chat-cap3b':     'cap3b',
  'chat-chi':       'chi',
  'chat-5d':        '5d',
  'chat-contA':     'contA',
  'chat-contB':     'contB',
};

function toggleAudio(chatId) {
  const cfg = AUDIO_MAP[chatId];
  if (!cfg) return;
  const isOn = !audioState[chatId];
  audioState[chatId] = isOn;

  const btn   = document.getElementById(cfg.btn);
  const icon  = btn?.querySelector('.audio-icon');

  if (isOn) {
    btn?.classList.add('audio-on');
    if (icon) icon.textContent = '🔊';
    btn?.setAttribute('title', 'Desactivar lectura en voz alta');
    btn?.setAttribute('data-label', 'Voz activada');
  } else {
    btn?.classList.remove('audio-on', 'audio-speaking');
    if (icon) icon.textContent = '🔇';
    btn?.setAttribute('title', 'Activar lectura en voz alta');
    btn?.setAttribute('data-label', 'Voz desactivada');
    // Detener cualquier lectura en curso de este tutor
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}

function hablarTexto(texto, chatId) {
  if (!audioState[chatId]) return;
  if (!window.speechSynthesis) return;

  // Cancelar lectura previa del mismo tutor
  window.speechSynthesis.cancel();

  // Limpiar el texto de markdown y símbolos especiales
  const limpio = texto
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/fᵢ/g, 'fi').replace(/fᵣ/g, 'hi')
    .replace(/Fᵢ/g, 'Fi').replace(/Fᵣ/g, 'Hi')
    .replace(/[<>]/g, '').replace(/\n+/g, '. ')
    .trim();

  const utterance = new SpeechSynthesisUtterance(limpio);
  utterance.lang  = 'es-CO'; // español colombiano; fallback a es-ES
  utterance.rate  = 0.95;
  utterance.pitch = 1.0;

  // Intentar seleccionar una voz en español
  const voices = window.speechSynthesis.getVoices();
  const vozEs  = voices.find(v => v.lang.startsWith('es'));
  if (vozEs) utterance.voice = vozEs;

  const cfg = AUDIO_MAP[chatId];
  const btn = cfg ? document.getElementById(cfg.btn) : null;

  utterance.onstart = () => { btn?.classList.add('audio-speaking'); };
  utterance.onend   = () => { btn?.classList.remove('audio-speaking'); };
  utterance.onerror = () => { btn?.classList.remove('audio-speaking'); };

  window.speechSynthesis.speak(utterance);
}

// Las voces pueden cargar de forma asíncrona en algunos navegadores
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { /* voces listas */ };
}

// Datos por defecto para el gráfico de contingencia Cap II
let datosGrafico = {
  labels:  ['Deportes', 'Danza', 'Música'],
  hombres: [30, 5, 15],
  mujeres: [10, 25, 15]
};

/* ════════════════════════════════
   PAGINACIÓN — soporta IDs mixtos (número o string como '5b')
════════════════════════════════ */

// Orden lógico de páginas para determinar dirección de animación
const ORDEN_PAGINAS = [0,1,3,5,'5b','5c','5d',6,7,8,9,10,'10b',11,12,13,14,'14b',15,16,17,18,19,20,21,22,23,24,25];

function irAPagina(n) {
  if (n === paginaActual) return;

  const pVieja = document.getElementById(`page-${paginaActual}`);
  const pNueva = document.getElementById(`page-${n}`);
  if (!pVieja || !pNueva) return;

  const idxVieja = ORDEN_PAGINAS.indexOf(paginaActual);
  const idxNueva = ORDEN_PAGINAS.indexOf(n);
  const avanza   = idxNueva > idxVieja;

  pNueva.style.transform = avanza ? 'translateX(48px)' : 'translateX(-48px)';
  pNueva.style.opacity   = '0';

  pVieja.style.transform  = avanza ? 'translateX(-48px)' : 'translateX(48px)';
  pVieja.style.opacity    = '0';
  pVieja.style.transition = 'opacity .38s ease, transform .38s ease';
  pVieja.classList.remove('active');

  requestAnimationFrame(() => {
    pNueva.style.transition = 'opacity .38s ease, transform .38s ease';
    pNueva.classList.add('active');
    pNueva.style.transform = 'translateX(0)';
    pNueva.style.opacity   = '1';
  });

  setTimeout(() => {
    pVieja.style.transform  = '';
    pVieja.style.opacity    = '';
    pVieja.style.transition = '';
    pNueva.style.transition = '';
  }, 420);

  paginaActual = n;
  actualizarIndicadores();
  calcPosicionarBoton();

  // ── Inicialización de tutores al llegar a cada página ──

  // Cap I — Actividad unificada (pág 3): construye tabla completa en un solo chat
  // Se difiere hasta que el estudiante complete la exploración inicial de datos libres
  // (ver p3PrepararPagina / p3ExploracionContinuar2).
  if (n === 3) {
    setTimeout(p3PrepararPagina, 200);
  }

  // Cap I — Ejemplos Dinámicos (pág 5b)
  if (n === '5b') {
    setTimeout(inicializarEjemplosDinamicos, 300);
  }

  // Cap I — Problemas: completar tabla (pág 5c)
  if (n === '5c') {
    setTimeout(() => p5cCargarProblema(p5cProblemaActual), 300);
  }

  // Cap I — Problema libre: construir y analizar (pág 5d)
  if (n === '5d') {
    setTimeout(() => p5dCargarSituacion(p5dSituacionActual), 300);
  }

  // Cap II — Tablas de contingencia
  if (n === 7 && !chatCap2Iniciado) {
    chatCap2Iniciado = true;
    setTimeout(inicializarChatCap2, 400);
  }

  // Cap II — Formulación (pág 12): re-renderizar tabla al entrar
  if (n === 12) {
    setTimeout(() => { renderizarProbA(); }, 300);
  }

  // Cap II — Validación (pág 13): re-renderizar tabla al entrar
  if (n === 13) {
    setTimeout(() => { renderizarProbB(); }, 300);
  }

  // Cap III — Formas parciales con IA (pág 9 visible / page-10 interno)
  // El tutor YA NO se inicia automáticamente: espera a que el estudiante
  // responda las 3 preguntas y las envíe (ver cap3EnviarPreguntasIniciales).
  if (n === 10) {
    setTimeout(renderizarCap3ActTable, 300);
  }

  // Puente hacia asociación/independencia (nueva página 10b)
  if (n === '10b') {
    setTimeout(inicializarCap3Puente, 300);
  }

  // Cap V — Exploración chi
  if (n === 14 && !chatChiIniciado) {
    chatChiIniciado = true;
    setTimeout(inicializarTutorChi, 400);
  }

  // Cap III — Chi-cuadrado (págs 15-24)
  if (n === 8)  setTimeout(ctxExplorerInit,  200);
  if (n === 16) {
    chi3P16Intentos = 0; chi3P16FormulaResuelta = false;
    setTimeout(() => {
      chi3P16Render();
      const card = document.getElementById('chi3-p16-institucionalizacion');
      if (card) { card.style.display = 'none'; card.innerHTML = ''; }
      const inp = document.getElementById('input-chi3-p16');
      if (inp) { inp.disabled = false; inp.placeholder = 'Continúa el diálogo…'; }
      const inputArea = document.querySelector('#chi3-p16-tutor .chat-input-area');
      if (inputArea) inputArea.style.opacity = '1';
    }, 300);
  }
  if (n === 17) setTimeout(chi3P17Init,   300);
  if (n === 18) { chi3P18Intentos = 0; chi3P18DescubrimientoResuelto = false; setTimeout(chi3P18Render, 300); }
  if (n === 19) setTimeout(chi3P19Render, 300);
  if (n === 20) setTimeout(chi3P20Render, 300);
  if (n === 21) setTimeout(chi3P21Init,   300);
  if (n === 22) setTimeout(chi3P22Render, 300);
  if (n === 23) setTimeout(chi3P23Render, 300);
  if (n === 24) setTimeout(chi3P24Render, 300);
  if (n === 25) setTimeout(p25Init,       300);
}

function actualizarIndicadores() {
  const dots = document.querySelectorAll('.pi-dot');
  const idx  = ORDEN_PAGINAS.indexOf(paginaActual);
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

/* ════════════════════════════════
   INDICADOR VISUAL DE FASE — Cap II
════════════════════════════════ */
function actualizarFaseCap2(texto) {
  const dot   = document.getElementById('phaseIndicator')?.querySelector('.phase-dot');
  const label = document.getElementById('phaseLabel');
  if (!dot || !label) return;

  const esB = texto.includes('Frecuencia Marginal') || texto.includes('bordes de la tabla') ||
               texto.includes('total de mujeres') || texto.includes('total general');
  const esC = texto.includes('titular impactante') || texto.includes('cambiar la forma') ||
               texto.includes('Frecuencia Relativa Condicionada') || texto.includes('proporción') ||
               texto.includes('porcentaje');
  const fin  = texto.includes('Sesión terminada');

  if (fin) {
    dot.className     = 'phase-dot phase-done';
    label.textContent = 'Institucionalización';
  } else if (esC) {
    dot.className     = 'phase-dot phase-c';
    label.textContent = 'Transnumeración';
    mostrarBotonTransnum();
  } else if (esB) {
    dot.className     = 'phase-dot phase-b';
    label.textContent = 'Frecuencias marginales';
  } else {
    dot.className     = 'phase-dot phase-a';
    label.textContent = 'Exploración';
  }
}

// Reemplazo determinístico de actualizarFaseCap2 para la conversación EN VIVO: lee
// la señal estructurada (JSON) del backend en vez de escanear el texto por palabras
// clave. actualizarFaseCap2 se conserva solo para reconstruir el estado al
// restaurar el historial de una sesión previa.
function _cap2AplicarSenalEstructurada(data) {
  if (data.fase_actual === 'completa') cap2Completado = true;
  const dot   = document.getElementById('phaseIndicator')?.querySelector('.phase-dot');
  const label = document.getElementById('phaseLabel');
  if (!dot || !label) return;
  const fase = data.fase_actual;
  if (fase === 'completa') {
    dot.className     = 'phase-dot phase-done';
    label.textContent = 'Institucionalización';
  } else if (fase === 'C') {
    dot.className     = 'phase-dot phase-c';
    label.textContent = 'Transnumeración';
    mostrarBotonTransnum();
  } else if (fase === 'B') {
    dot.className     = 'phase-dot phase-b';
    label.textContent = 'Frecuencias marginales';
  } else {
    dot.className     = 'phase-dot phase-a';
    label.textContent = 'Exploración';
  }
}

/* ════════════════════════════════
   INDICADORES VISUALES — Cap I (frecuencias)
════════════════════════════════ */
function actualizarFaseFreqA(texto) {
  const dot   = document.getElementById('freqPhaseDot');
  const label = document.getElementById('freqPhaseLabel');
  if (!dot || !label) return;

  const completado = texto.includes('A continuación se muestra la tabla de frecuencias con la frecuencia relativa');
  const tieneRelativa = texto.includes('Frecuencia Relativa') || texto.includes('h_i') || texto.includes('fᵣ');

  if (completado) {
    dot.className     = 'phase-dot phase-done';
    label.textContent = 'Completado';
    // Mostrar tabla expandida con fᵣ
    const tablaHi = document.getElementById('freq-tabla-hi');
    if (tablaHi) tablaHi.style.display = 'block';
    // Habilitar botón siguiente
    const btn = document.getElementById('btn-freq-a-next');
    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  } else if (tieneRelativa) {
    dot.className     = 'phase-dot phase-b';
    label.textContent = 'Frec. relativa';
  } else {
    dot.className     = 'phase-dot phase-a';
    label.textContent = 'Frec. absoluta';
  }
}

function actualizarFaseFreqB(texto) {
  const completado = texto.includes('¡Bien hecho! Has completado la primera fase.');
  if (completado) {
    const dot   = document.getElementById('freqPhaseDotB');
    const label = document.getElementById('freqPhaseLabelB');
    if (dot) dot.className = 'phase-dot phase-done';
    if (label) label.textContent = 'Completado';
    const btn = document.getElementById('btn-freq-b-next');
    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  }
}

function actualizarFaseFreqC(texto) {
  const completadoC = texto.includes('A continuación, se muestra la tabla de frecuencias con la frecuencia absoluta acumulada:');
  if (completadoC) {
    // Mostrar tabla Fᵢ y ocultar tabla de referencia
    const tablaFi  = document.getElementById('freq-tabla-Fi');
    const tablaRef = document.getElementById('freq-tabla-ref-acum');
    if (tablaFi)  tablaFi.style.display  = 'block';
    if (tablaRef) tablaRef.style.display = 'none';
    // Iniciar tutor Fase D si no ha empezado
    freqCCompletado = true;
    if (!chatFreqDIniciado) {
      chatFreqDIniciado = true;
      setTimeout(inicializarChatFreqD, 600);
    }
  }
}

function actualizarFaseFreqD(texto) {
  const completadoD = texto.includes('¡Excelente trabajo! A continuación se muestra la tabla de frecuencias con la frecuencia relativa acumulada:');
  if (completadoD) {
    const tablaHi = document.getElementById('freq-tabla-Hi');
    const tablaFi = document.getElementById('freq-tabla-Fi');
    if (tablaHi) tablaHi.style.display = 'block';
    if (tablaFi) tablaFi.style.display = 'none';
  }
}

/* ════════════════════════════════
   TRANSNUMERACIÓN — Cap II
════════════════════════════════ */
function mostrarBotonTransnum() {
  const zona = document.getElementById('transnum-zone');
  if (zona && zona.style.display === 'none') {
    zona.style.display = 'flex';
  }
}

function toggleVisualizacion() {
  const tablaEl   = document.getElementById('tabla-container');
  const graficoEl = document.getElementById('grafico-container');
  const btnLabel  = document.getElementById('btn-transnum-label');
  const btnEl     = document.getElementById('btn-transnum');
  const repDot    = document.getElementById('rep-dot');
  const repText   = document.getElementById('rep-text');

  if (vistaActual === 'tabla') {
    tablaEl.classList.add('fade-out');
    setTimeout(() => {
      tablaEl.style.display   = 'none';
      tablaEl.classList.remove('fade-out');
      graficoEl.style.display = 'block';
      graficoEl.classList.add('fade-in');
      renderizarGraficoCap2();
      setTimeout(() => graficoEl.classList.remove('fade-in'), 400);
    }, 250);
    vistaActual          = 'grafico';
    btnLabel.textContent = 'Ver como Tabla de Contingencia';
    btnEl.classList.add('is-chart');
    repDot.className     = 'rep-dot is-grafico';
    repText.textContent  = 'Diagrama de barras activo';
  } else {
    graficoEl.classList.add('fade-out');
    setTimeout(() => {
      graficoEl.style.display = 'none';
      graficoEl.classList.remove('fade-out');
      tablaEl.style.display   = 'block';
      tablaEl.classList.add('fade-in');
      setTimeout(() => tablaEl.classList.remove('fade-in'), 400);
    }, 250);
    vistaActual          = 'tabla';
    btnLabel.textContent = 'Ver como Diagrama de Barras';
    btnEl.classList.remove('is-chart');
    repDot.className     = 'rep-dot is-tabla';
    repText.textContent  = 'Representación tabular activa';
  }
}

function renderizarGraficoCap2() {
  const ctx = document.getElementById('miGrafico')?.getContext('2d');
  if (!ctx) return;
  if (graficoActual) graficoActual.destroy();

  graficoActual = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: datosGrafico.labels,
      datasets: [
        { label: 'Hombres', data: datosGrafico.hombres, backgroundColor: 'rgba(26,58,90,.83)', borderRadius: 3 },
        { label: 'Mujeres', data: datosGrafico.mujeres, backgroundColor: 'rgba(46,107,79,.83)', borderRadius: 3 }
      ]
    },
    options: {
      responsive: true,
      animation: { duration: 550, easing: 'easeOutQuart' },
      plugins: {
        legend: { position: 'top', labels: { font: { family: 'Inter', size: 11 }, boxWidth: 12 } },
        title: { display: true, text: 'Actividades extracurriculares por género — Bucaramanga', font: { family: 'Playfair Display', size: 12 }, color: '#1A3A5A', padding: { bottom: 10 } }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.05)' }, ticks: { font: { family: 'JetBrains Mono', size: 10 } } },
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }
      }
    }
  });
}

/* ════════════════════════════════
   TABLA DE CONTINGENCIA — Cap II
════════════════════════════════ */
function actualizarTablaCap2(matriz, cabeceras) {
  let html = '<table><thead><tr>';
  cabeceras.forEach((h, i) => { html += `<th${i === 0 ? ' style="text-align:left"' : ''}>${h}</th>`; });
  html += '</tr></thead><tbody>';
  matriz.forEach(fila => {
    html += '<tr>';
    fila.forEach(celda => { html += `<td>${celda}</td>`; });
    html += '</tr>';
  });
  html += '</tbody></table>';
  const cont = document.getElementById('tabla-container');
  if (cont) cont.innerHTML = html;
}

/* ════════════════════════════════
   TUTORES — CAP I: TABLAS DE FRECUENCIA
════════════════════════════════ */

// ── Fase A: frecuencia absoluta + relativa (pág 2) ──
async function inicializarChatFreqA() {
  setStatusFreq('tutor-status-freq-a', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, estoy listo para aprender sobre tablas de frecuencia.', session_id: `freq_A_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) {
      agregarMensajeGen('chat-freq-a', data.reply, 'tutor');
      actualizarFaseFreqA(data.reply);
    }
    setStatusFreq('tutor-status-freq-a', 'En línea');
  } catch (err) {
    agregarMensajeGen('chat-freq-a', '¡Hola! Miremos juntos la tabla. ¿Cuántos estudiantes eligieron Café Negro?', 'tutor');
    setStatusFreq('tutor-status-freq-a', 'En línea');
  }
}

async function enviarMensajeFreqA() {
  const input = document.getElementById('input-freq-a');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-freq-a', texto, 'user');
  const tid = agregarTypingGen('chat-freq-a');
  setStatusFreq('tutor-status-freq-a', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `freq_A_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-a', 'En línea');
    if (data.reply) {
      agregarMensajeGen('chat-freq-a', data.reply, 'tutor');
      actualizarFaseFreqA(data.reply);
    }
  } catch (err) {
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-a', 'En línea');
    agregarMensajeGen('chat-freq-a', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

// ── Fase B: Curcio N3/N4 (pág 3) ──
async function inicializarChatFreqB() {
  renderizarP3Tabla(); // inicializar tabla con solo fᵢ
  setStatusFreq('tutor-status-freq-b', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Continúo el análisis. Ya aprendí sobre frecuencia absoluta y relativa.', session_id: `freq_B_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) {
      agregarMensajeGen('chat-freq-b', data.reply, 'tutor');
      actualizarFaseFreqB(data.reply);
      detectarInstitucionalizacionP3(data.reply);
    }
    setStatusFreq('tutor-status-freq-b', 'En línea');
  } catch (err) {
    agregarMensajeGen('chat-freq-b', '¡Bien! Ahora que ya conoces las frecuencias, ¿qué crees que pasaría si se encuestaran más estudiantes?', 'tutor');
    setStatusFreq('tutor-status-freq-b', 'En línea');
  }
}

async function enviarMensajeFreqB() {
  const input = document.getElementById('input-freq-b');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-freq-b', texto, 'user');
  const tid = agregarTypingGen('chat-freq-b');
  setStatusFreq('tutor-status-freq-b', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `freq_B_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-b', 'En línea');
    if (data.reply) {
      agregarMensajeGen('chat-freq-b', data.reply, 'tutor');
      actualizarFaseFreqB(data.reply);
      detectarInstitucionalizacionP3(data.reply); // ← tabla dinámica
    }
  } catch (err) {
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-b', 'En línea');
    agregarMensajeGen('chat-freq-b', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}



// ══════════════════════════════════════════════════════
// TUTOR UNIFICADO — Página 3: construye la tabla completa
// en un ÚNICO chat, columna por columna (fᵢ→fᵣ→Fᵢ→Fᵣ)
// ══════════════════════════════════════════════════════

// Seguimiento de fases del chat unificado
let p3FaseActual = 'fi'; // 'fi' | 'hi' | 'Fi' | 'Hi' | 'completa'

const P3_FASES = {
  fi:      { titulo: 'Fase 1: Frecuencia Absoluta (fᵢ)',          desc: 'El tutor te guía para entender el conteo directo de cada categoría.' },
  hi:      { titulo: 'Fase 2: Frecuencia Relativa (fᵣ)',           desc: 'Aprende a calcular la proporción de cada categoría respecto al total N.' },
  Fi:      { titulo: 'Fase 3: Frec. Absoluta Acumulada (Fᵢ)',      desc: 'Suma progresiva de frecuencias absolutas: ¿cuántos hasta esta categoría?' },
  Hi:      { titulo: 'Fase 4: Frec. Relativa Acumulada (Fᵣ)',      desc: 'Proporción acumulada: Fᵣ = Fᵢ/N. La tabla completa está casi lista.' },
  completa:{ titulo: '¡Tabla completa! 🎉',                         desc: 'Has construido las cuatro columnas de la tabla de frecuencias con el tutor.' },
};

const P3_COLORES_FASE = { fi: 'phase-a', hi: 'phase-b', Fi: 'phase-c', Hi: 'phase-done', completa: 'phase-done' };

function _p3ActualizarFaseVisual(fase) {
  p3FaseActual = fase;
  const dot   = document.getElementById('freqPhaseDotUnif');
  const label = document.getElementById('freqPhaseLabelUnif');
  const notaEl     = document.getElementById('p3-fase-nota');
  const notaTitulo = document.getElementById('p3-fase-titulo');
  const notaDesc   = document.getElementById('p3-fase-desc');
  const strip      = document.getElementById('p3-context-strip');
  const wrapper    = document.getElementById('p3-tabla-wrapper');
  const info = P3_FASES[fase] || P3_FASES.fi;

  if (dot)   { dot.className = 'phase-dot ' + (P3_COLORES_FASE[fase] || 'phase-a'); }
  if (label) { label.textContent = fase === 'completa' ? 'Completa ✓' : fase + ' activa'; }

  // Animar transición de nota
  if (notaTitulo) { notaTitulo.style.opacity = '0'; setTimeout(() => { notaTitulo.textContent = '📌 ' + info.titulo; notaTitulo.style.opacity = '1'; }, 200); }
  if (notaDesc)   { notaDesc.style.opacity   = '0'; setTimeout(() => { notaDesc.textContent   = info.desc;           notaDesc.style.opacity   = '1'; }, 250); }

  // Clases de color para la nota y el strip
  if (notaEl) { notaEl.className = `note-card fase-${fase}`; }
  if (strip)  { strip.className  = `strip-${fase}`; }

  const mensajes = {
    fi:       '📊 Observa la tabla inicial con fᵢ. Responde las preguntas del tutor.',
    hi:       '➗ Nueva columna: fᵣ = fᵢ / N. Calcula la proporción de cada bebida.',
    Fi:       '➕ Nueva columna: Fᵢ acumula las frecuencias. Suma paso a paso.',
    Hi:       '📈 Última columna: Fᵣ = Fᵢ / N. ¡Ya casi terminas!',
    completa: '✅ ¡Tabla de 4 columnas construida! Puedes avanzar a la Síntesis.',
  };
  if (strip) { strip.style.opacity='0'; setTimeout(() => { strip.textContent = mensajes[fase] || ''; strip.style.opacity='1'; }, 300); }

  // Pulso celebración al completar
  if (fase === 'completa' && wrapper) {
    wrapper.classList.add('completa');
  }
}

function _p3DetectarFaseEnRespuesta(texto) {
  // Detectar y revelar fᵣ
  if (!p3Columnas.hi && (
    texto.includes('frecuencia relativa') || texto.includes('fᵣ') || texto.includes('h_i') ||
    texto.includes('dividir entre N') || texto.includes('dividir entre el total') ||
    texto.includes('proporción')
  )) {
    p3Columnas.hi = true;
    setTimeout(renderizarP3Tabla, 300);
    _p3MostrarNotificacion('fᵣ — Frecuencia Relativa');
    _p3ActualizarFaseVisual('hi');
  }
  // Detectar y revelar Fᵢ
  if (!p3Columnas.Fi && (
    texto.includes('absoluta acumulada') || texto.includes('Fᵢ') || texto.includes('F_i') ||
    texto.includes('acumulando') || texto.includes('suma progresiva') || texto.includes('frecuencia acumulada')
  )) {
    p3Columnas.Fi = true;
    setTimeout(renderizarP3Tabla, 600);
    _p3MostrarNotificacion('Fᵢ — Frecuencia Absoluta Acumulada');
    _p3ActualizarFaseVisual('Fi');
  }
  // Detectar y revelar Fᵣ
  if (!p3Columnas.Hi && (
    texto.includes('relativa acumulada') || texto.includes('Fᵣ') || texto.includes('H_i') ||
    texto.includes('proporción acumulada') || texto.includes('fracción acumulada')
  )) {
    p3Columnas.Hi = true;
    setTimeout(renderizarP3Tabla, 900);
    _p3MostrarNotificacion('Fᵣ — Frecuencia Relativa Acumulada');
    _p3ActualizarFaseVisual('Hi');
  }
  // Detectar tabla completa / finalización
  const tablaCompleta = p3Columnas.fi && p3Columnas.hi && p3Columnas.Fi && p3Columnas.Hi;
  if (tablaCompleta && p3FaseActual !== 'completa' && (
    texto.includes('completa') || texto.includes('¡Excelente') || texto.includes('has construido') ||
    texto.includes('tabla completa') || texto.includes('todas las columnas')
  )) {
    _p3ActualizarFaseVisual('completa');
    const btn = document.getElementById('btn-freq-unif-next');
    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  }
  // Si ya tenemos las 4 columnas, habilitar siempre el botón siguiente
  if (tablaCompleta) {
    const btn = document.getElementById('btn-freq-unif-next');
    if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
  }
}

// Reemplazo determinístico de _p3DetectarFaseEnRespuesta para la conversación EN VIVO:
// lee las señales estructuradas (JSON) que devuelve el backend en vez de escanear
// el texto en busca de palabras clave. _p3DetectarFaseEnRespuesta se conserva solo
// como reconstrucción de estado al restaurar el historial de una sesión previa.
function _p3AplicarSenalEstructurada(data) {
  const concepto = data.concepto_institucionalizado;
  if (concepto === 'fr' && !p3Columnas.hi) {
    p3Columnas.hi = true;
    setTimeout(renderizarP3Tabla, 300);
    _p3MostrarNotificacion('fᵣ — Frecuencia Relativa');
    _p3ActualizarFaseVisual('hi');
  } else if (concepto === 'Fi' && !p3Columnas.Fi) {
    p3Columnas.Fi = true;
    setTimeout(renderizarP3Tabla, 300);
    _p3MostrarNotificacion('Fᵢ — Frecuencia Absoluta Acumulada');
    _p3ActualizarFaseVisual('Fi');
  } else if (concepto === 'Hi' && !p3Columnas.Hi) {
    p3Columnas.Hi = true;
    setTimeout(renderizarP3Tabla, 300);
    _p3MostrarNotificacion('Fᵣ — Frecuencia Relativa Acumulada');
    _p3ActualizarFaseVisual('Hi');
  }

  const tablaCompleta = p3Columnas.fi && p3Columnas.hi && p3Columnas.Fi && p3Columnas.Hi;
  if (data.analisis_completo === true && tablaCompleta) {
    freqUnifCompletado = true;
    if (p3FaseActual !== 'completa') {
      _p3ActualizarFaseVisual('completa');
      const btn = document.getElementById('btn-freq-unif-next');
      if (btn) { btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
    }
  }
}

async function inicializarChatFreqUnif() {
  setStatusFreq('tutor-status-freq-unif', 'Conectando…');
  _p3ActualizarFaseVisual('fi');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hola, estoy listo para construir la tabla de frecuencias completa paso a paso. Empecemos desde la frecuencia absoluta.',
        session_id: `freq_unif_${sessionId}`
      })
    });
    const data = await res.json();
    if (data.reply) {
      agregarMensajeGen('chat-freq-unif', data.reply, 'tutor');
      _p3AplicarSenalEstructurada(data);
    }
    setStatusFreq('tutor-status-freq-unif', 'En línea');
  } catch (err) {
    agregarMensajeGen('chat-freq-unif', '¡Hola! Vamos a construir juntos la tabla de frecuencias completa. Observa la tabla: ¿cuántos jóvenes eligieron Café Negro?', 'tutor');
    setStatusFreq('tutor-status-freq-unif', 'En línea');
  }
}

async function enviarMensajeFreqUnif() {
  const input = document.getElementById('input-freq-unif');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-freq-unif', texto, 'user');
  const tid = agregarTypingGen('chat-freq-unif');
  setStatusFreq('tutor-status-freq-unif', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `freq_unif_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-unif', 'En línea');
    if (data.reply) {
      agregarMensajeGen('chat-freq-unif', data.reply, 'tutor');
      _p3AplicarSenalEstructurada(data);
    }
  } catch (err) {
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-unif', 'En línea');
    agregarMensajeGen('chat-freq-unif', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

// ── Fase C: frec. absoluta acumulada (pág 4) ──
async function inicializarChatFreqC() {
  setStatusFreq('tutor-status-freq-c', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Estoy listo para aprender sobre frecuencias acumuladas.', session_id: `freq_C_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) {
      agregarMensajeGen('chat-freq-c', data.reply, 'tutor');
      actualizarFaseFreqC(data.reply);
    }
    setStatusFreq('tutor-status-freq-c', 'En línea');
  } catch (err) {
    agregarMensajeGen('chat-freq-c', '¡Muy bien! Ahora vamos a explorar las frecuencias acumuladas. ¿Estás listo?', 'tutor');
    setStatusFreq('tutor-status-freq-c', 'En línea');
  }
}

async function enviarMensajeFreqC() {
  // Si Fase C ya terminó y Fase D está activa, redirige al chat de Fase D
  if (freqCCompletado) {
    enviarMensajeFreqD();
    return;
  }
  const input = document.getElementById('input-freq-c');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-freq-c', texto, 'user');
  const tid = agregarTypingGen('chat-freq-c');
  setStatusFreq('tutor-status-freq-c', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `freq_C_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-c', 'En línea');
    if (data.reply) {
      agregarMensajeGen('chat-freq-c', data.reply, 'tutor');
      actualizarFaseFreqC(data.reply);
    }
  } catch (err) {
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-c', 'En línea');
    agregarMensajeGen('chat-freq-c', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

// ── Fase D: frec. relativa acumulada (pág 4, continúa en mismo chat) ──
async function inicializarChatFreqD() {
  setStatusFreq('tutor-status-freq-c', 'Conectando fase D…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Ya entendí la frecuencia absoluta acumulada. Listo para continuar.', session_id: `freq_D_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) {
      agregarMensajeGen('chat-freq-c', data.reply, 'tutor');
      actualizarFaseFreqD(data.reply);
    }
    setStatusFreq('tutor-status-freq-c', 'En línea');
  } catch (err) {
    setStatusFreq('tutor-status-freq-c', 'En línea');
  }
}

async function enviarMensajeFreqD() {
  const input = document.getElementById('input-freq-c');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-freq-c', texto, 'user');
  const tid = agregarTypingGen('chat-freq-c');
  setStatusFreq('tutor-status-freq-c', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `freq_D_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-c', 'En línea');
    if (data.reply) {
      agregarMensajeGen('chat-freq-c', data.reply, 'tutor');
      actualizarFaseFreqD(data.reply);
    }
  } catch (err) {
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-c', 'En línea');
    agregarMensajeGen('chat-freq-c', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

/* ════════════════════════════════
   TUTORES — CAP II: TABLAS DE CONTINGENCIA (pág 7)
════════════════════════════════ */
async function inicializarChatCap2() {
  setStatusGen('tutor-status-text', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, estoy listo para aprender.', session_id: sessionId })
    });
    const data = await res.json();
    if (data.reply) {
      agregarMensajeGen('chat-box', data.reply, 'tutor');
      _cap2AplicarSenalEstructurada(data);
    }
    if (data.table)        actualizarTablaCap2(data.table, data.headers);
    if (data.grafico_data) sincronizarDatosGrafico(data.grafico_data);
    setStatusGen('tutor-status-text', 'En línea');
  } catch (err) {
    agregarMensajeGen('chat-box', '¡Hola! Estoy aquí para guiarte. Escribe tu primera respuesta para comenzar.', 'tutor');
    setStatusGen('tutor-status-text', 'En línea');
  } finally {
    ocultarLoading();
  }
}

async function enviarMensaje() {
  const input = document.getElementById('user-input');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-box', texto, 'user');
  const tid = agregarTypingGen('chat-box');
  setStatusGen('tutor-status-text', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: sessionId })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text', 'En línea');
    if (data.reply) {
      agregarMensajeGen('chat-box', data.reply, 'tutor');
      _cap2AplicarSenalEstructurada(data);
    }
    if (data.table)        actualizarTablaCap2(data.table, data.headers);
    if (data.grafico_data) sincronizarDatosGrafico(data.grafico_data);
    if (vistaActual === 'grafico') renderizarGraficoCap2();
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text', 'En línea');
    agregarMensajeGen('chat-box', 'Hubo un problema de conexión. Por favor intenta de nuevo.', 'tutor');
  }
}

/* ════════════════════════════════
   TUTORES — CAP III: FORMAS PARCIALES (pág 10)
════════════════════════════════ */
async function inicializarChatCap3() {
  setStatusGen('tutor-status-text2', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, inicio Cap 3.', session_id: `cap3_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) agregarMensajeGen('chat-box2', data.reply, 'tutor');
    setStatusGen('tutor-status-text2', 'En línea');
  } catch (err) {
    agregarMensajeGen('chat-box2', '¡Hola! Continuemos con las formas parciales. ¿Listo?', 'tutor');
    setStatusGen('tutor-status-text2', 'En línea');
  }
}

// Reemplazo determinístico de texto para cap3 (página 9): lee la señal estructurada
// del backend. De paso conecta el indicador phaseIndicator2/phaseDot2/phaseLabel2
// que existía en el HTML pero ningún JS actualizaba.
function _cap3AplicarSenalEstructurada(data) {
  if (data.fase_actual === 'completa') cap3Completado = true;
  const dot   = document.getElementById('phaseDot2');
  const label = document.getElementById('phaseLabel2');
  if (!dot || !label) return;
  const fase = data.fase_actual;
  if (fase === 'completa') {
    dot.className     = 'phase-dot phase-done';
    label.textContent = 'Institucionalización';
  } else if (fase === 'C') {
    dot.className     = 'phase-dot phase-c';
    label.textContent = 'Distribución por columna';
  } else if (fase === 'B') {
    dot.className     = 'phase-dot phase-b';
    label.textContent = 'Distribución por fila';
  } else {
    dot.className     = 'phase-dot phase-a';
    label.textContent = 'Distribución conjunta';
  }
}

async function enviarMensaje2() {
  const input = document.getElementById('user-input2');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-box2', texto, 'user');
  const tid = agregarTypingGen('chat-box2');
  setStatusGen('tutor-status-text2', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `cap3_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2', 'En línea');
    if (data.reply) agregarMensajeGen('chat-box2', data.reply, 'tutor');
    _cap3AplicarSenalEstructurada(data);
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2', 'En línea');
    agregarMensajeGen('chat-box2', 'Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

/* ════════════════════════════════
   HELPERS GENÉRICOS
════════════════════════════════ */
function sincronizarDatosGrafico(arr) {
  if (arr && arr.length >= 2) {
    datosGrafico.hombres = [30, arr[0], 15];
    datosGrafico.mujeres = [10, arr[1], 15];
  }
}

function agregarMensajeGen(boxId, texto, tipo) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const div = document.createElement('div');
  div.className = tipo === 'user' ? 'msg-user' : 'msg-tutor';
  div.innerHTML = texto
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;

  // Audio: leer en voz alta si el tutor lo tiene activado
  if (tipo === 'tutor') {
    const chatId = BOX_TO_AUDIO[boxId];
    if (chatId) hablarTexto(texto, chatId);
  }
}

function agregarTypingGen(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return null;
  const id  = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id = id; div.className = 'msg-typing';
  div.textContent = 'El tutor está escribiendo…';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function quitarTypingGen(id) { if (id) document.getElementById(id)?.remove(); }

function setStatusGen(elId, txt) {
  const el = document.getElementById(elId);
  if (el) el.textContent = txt;
}

function setStatusFreq(elId, txt) { setStatusGen(elId, txt); }

function ocultarLoading() {
  document.getElementById('loadingOverlay')?.classList.add('hidden');
}

/* ════════════════════════════════
   RECUPERAR HISTORIAL
════════════════════════════════ */
async function cargarHistorial(idSesion, contenedorId) {
  try {
    const res  = await fetch(URL_BACKEND.replace('/api/chat', '/api/chat/historial'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: idSesion })
    });
    const data = await res.json();
    if (data.history && data.history.length > 0) {
      const box = document.getElementById(contenedorId);
      if (!box) return false;
      box.innerHTML = '';
      data.history.forEach(msg => {
        if (msg.role === 'user')      agregarMensajeGen(contenedorId, msg.content, 'user');
        else if (msg.role === 'assistant') agregarMensajeGen(contenedorId, msg.content, 'tutor');
      });
      // Actualizar fase visual según último mensaje
      const ultimo = data.history[data.history.length - 1].content;
      if (contenedorId === 'chat-box')  actualizarFaseCap2(ultimo);
      if (contenedorId === 'chat-freq-a') actualizarFaseFreqA(ultimo);
      if (contenedorId === 'chat-freq-b') {
        actualizarFaseFreqB(ultimo);
        // Replay all messages for p3 column detection
        data.history.forEach(m => {
          if (m.role === 'assistant') detectarInstitucionalizacionP3(m.content);
        });
      }
      if (contenedorId === 'chat-freq-c') { actualizarFaseFreqC(ultimo); actualizarFaseFreqD(ultimo); }
      if (contenedorId === 'chat-freq-unif') {
        // Replay all AI messages to rebuild table columns and phase state
        data.history.forEach(m => {
          if (m.role === 'assistant') _p3DetectarFaseEnRespuesta(m.content);
        });
        renderizarP3Tabla();
      }
      // Hubo conversación previa: quien llama debe marcar su bandera "ya inicié"
      // como true, para que la página NO dispare de nuevo su saludo automático.
      return true;
    }
    return false;
  } catch (err) { console.error(`Error al recuperar historial ${idSesion}:`, err); return false; }
}

/* ════════════════════════════════════════════════
   CAP III — TABLA INTERACTIVA (página 9)
   Dataset: 120 estudiantes UIS
════════════════════════════════════════════════ */
const FP_DATA = {
  filas:    ['Bajo', 'Medio', 'Alto'],
  columnas: ['< 5h', '5–10h', '> 10h'],
  matriz: [[22, 10, 3], [12, 28, 10], [4, 17, 14]],
  N: 120
};

const FP_PREGUNTAS = {
  absoluta: '¿Cuántos estudiantes tienen rendimiento Alto y estudian más de 10h semanales?',
  total:    '¿Qué porcentaje de toda la muestra tiene rendimiento Alto y estudia más de 10h?',
  fila:     'Del grupo con rendimiento Alto, ¿qué porcentaje estudia más de 10h?',
  columna:  'De quienes estudian más de 10h, ¿qué porcentaje tiene rendimiento Alto?'
};

const FP_HIGHLIGHT = [2, 2];
let fpTipoActual = 'absoluta';

function cambiarTipoTabla(tipo) {
  fpTipoActual = tipo;
  document.querySelectorAll('.fp-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tipo}`)?.classList.add('active');
  renderizarFPTabla(tipo);
  document.querySelectorAll('.fpe-content').forEach(c => c.classList.add('hidden'));
  document.getElementById(`fpe-${tipo}`)?.classList.remove('hidden');
  const qEl  = document.getElementById('fp-question-text');
  if (qEl) qEl.textContent = FP_PREGUNTAS[tipo];
  const qBox = document.getElementById('fp-question-box');
  if (qBox) {
    const colores = { absoluta: 'var(--navy)', total: 'var(--slate)', fila: 'var(--moss)', columna: 'var(--gold)' };
    qBox.style.borderLeftColor = colores[tipo] || 'var(--navy)';
  }
}

function calcularCelda(tipo, valor, totalFila, totalCol, N) {
  if (tipo === 'absoluta') return valor;
  if (tipo === 'total')    return (valor / N * 100).toFixed(1) + '%';
  if (tipo === 'fila')     return (valor / totalFila * 100).toFixed(1) + '%';
  if (tipo === 'columna')  return (valor / totalCol * 100).toFixed(1) + '%';
  return valor;
}

function calcularCeldaNum(tipo, val, totalFila, totalCol, N) {
  if (tipo === 'absoluta') return val;
  if (tipo === 'total')    return parseFloat((val / N * 100).toFixed(1));
  if (tipo === 'fila')     return parseFloat((val / totalFila * 100).toFixed(1));
  if (tipo === 'columna')  return parseFloat((val / totalCol * 100).toFixed(1));
  return val;
}

function calcularMarginalFila(tipo, totalFila, N) {
  if (tipo === 'absoluta') return totalFila;
  if (tipo === 'total')    return (totalFila / N * 100).toFixed(1) + '%';
  if (tipo === 'fila')     return '100%';
  if (tipo === 'columna')  return (totalFila / N * 100).toFixed(1) + '%';
}

function calcularMarginalCol(tipo, totalCol, N) {
  if (tipo === 'absoluta') return totalCol;
  if (tipo === 'total')    return (totalCol / N * 100).toFixed(1) + '%';
  if (tipo === 'fila')     return (totalCol / N * 100).toFixed(1) + '%';
  if (tipo === 'columna')  return '100%';
}

function renderizarFPTabla(tipo) {
  const { filas, columnas, matriz, N } = FP_DATA;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr><th>Rendimiento \\ Horas</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total fila</th></tr></thead><tbody>';

  matriz.forEach((fila, i) => {
    html += '<tr>';
    html += `<td>${filas[i]}</td>`;
    fila.forEach((val, j) => {
      const esHighlight = i === FP_HIGHLIGHT[0] && j === FP_HIGHLIGHT[1];
      const celda = calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N);
      html += `<td${esHighlight ? ' class="td-highlight"' : ''}>${celda}</td>`;
    });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });

  html += '<tr><td>Total columna</td>';
  totalesCol.forEach(tc => { html += `<td>${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td>${tipo === 'absoluta' ? N : '100%'}</td></tr></tbody></table>`;

  const wrapper = document.getElementById('fp-tabla-wrapper');
  if (wrapper) {
    wrapper.style.opacity = '0';
    setTimeout(() => { wrapper.innerHTML = html; wrapper.style.opacity = '1'; wrapper.style.transition = 'opacity .25s ease'; }, 120);
  }
}

function renderizarFPRefTable() {
  const { filas, columnas, matriz } = FP_DATA;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr><th>Rendimiento \\ Horas</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';
  matriz.forEach((fila, i) => {
    html += `<tr><td>${filas[i]}</td>`;
    fila.forEach(v => { html += `<td>${v}</td>`; });
    html += `<td>${totalesFila[i]}</td></tr>`;
  });
  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td>${tc}</td>`; });
  html += `<td>${FP_DATA.N}</td></tr></tbody></table>`;

  const el = document.getElementById('fp-ref-table');
  if (el) el.innerHTML = html;
}

/* ════════════════════════════════════════════════
   CAP II — ACTIVIDAD (página 9 visible / page-10 interno)
   Tabla: Color favorito × Personalidad, N=400.
   El estudiante responde 3 preguntas abiertas ANTES de que el tutor
   hable — sus respuestas se envían como contexto inicial de la sesión.
════════════════════════════════════════════════ */
const CAP3_ACT_DATA = {
  filas:    ['Introvertida', 'Extrovertida'],
  columnas: ['Rojo', 'Amarillo', 'Verde', 'Azul'],
  matriz:   [[20, 6, 30, 44], [180, 34, 50, 36]],
  N: 400
};

// Respuestas del estudiante en pág 9, reutilizadas como contexto en pág 10b
let cap3RespuestasIniciales = { p1: '', p2: '', p3: '' };
let chatCap3PuenteIniciado  = false;
let chi3P16Intentos         = 0;      // piloto: cuenta intentos de descubrir Eᵢⱼ, gobierna el código, no el modelo
let chi3P16FormulaResuelta  = false;
let cap3PuenteInstitucionalizado = false;
let chi3P18Intentos = 0;
let chi3P18DescubrimientoResuelto = false;

function renderizarCap3ActTable() {
  const { filas, columnas, matriz, N } = CAP3_ACT_DATA;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr><th>Personalidad \\ Color</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';
  matriz.forEach((fila, i) => {
    html += `<tr><td>${filas[i]}</td>`;
    fila.forEach(v => { html += `<td>${v}</td>`; });
    html += `<td>${totalesFila[i]}</td></tr>`;
  });
  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td>${tc}</td>`; });
  html += `<td>${N}</td></tr></tbody></table>`;

  const el = document.getElementById('fp-ref-table');
  if (el) el.innerHTML = html;

  // Estado de la UI: si ya se enviaron las preguntas antes (misma sesión),
  // saltar directo al panel del tutor en vez de mostrar el bloque otra vez.
  const preguntasBlock = document.getElementById('cap3-preguntas-block');
  const tutorPh        = document.getElementById('cap3-tutor-placeholder');
  const tutorPanel      = document.getElementById('cap3-tutor-panel');
  if (chatCap3Iniciado) {
    if (preguntasBlock) preguntasBlock.style.display = 'none';
    if (tutorPh) tutorPh.style.display = 'none';
    if (tutorPanel) tutorPanel.style.display = 'flex';
  } else {
    if (preguntasBlock) preguntasBlock.style.display = 'block';
    if (tutorPh) tutorPh.style.display = 'flex';
    if (tutorPanel) tutorPanel.style.display = 'none';
  }
}

// El estudiante responde las 3 preguntas y las envía — SOLO entonces arranca el tutor.
async function cap3EnviarPreguntasIniciales() {
  const p1 = document.getElementById('cap3-preg1')?.value.trim();
  const p2 = document.getElementById('cap3-preg2')?.value.trim();
  const p3 = document.getElementById('cap3-preg3')?.value.trim();
  if (!p1 || !p2 || !p3) {
    alert('Responde las tres preguntas antes de enviarlas al tutor — no hay respuesta incorrecta, es tu primer acercamiento a los datos.');
    return;
  }
  cap3RespuestasIniciales = { p1, p2, p3 };
  chatCap3Iniciado = true;

  const preguntasBlock = document.getElementById('cap3-preguntas-block');
  const tutorPh        = document.getElementById('cap3-tutor-placeholder');
  const tutorPanel      = document.getElementById('cap3-tutor-panel');
  if (preguntasBlock) preguntasBlock.style.display = 'none';
  if (tutorPh) tutorPh.style.display = 'none';
  if (tutorPanel) tutorPanel.style.display = 'flex';

  const contexto = `[CONTEXTO — Respuestas iniciales del estudiante]
1) Primera impresión sobre la relación entre color y personalidad: ${p1}
2) Reflexión sobre la tensión de comparar Extrovertida-Rojo (180) vs Introvertida-Azul (44): ${p2}
3) Apuesta inicial (¿relacionadas o independientes?) y en qué patrón se basa: ${p3}`;

  agregarMensajeGen('chat-box2', '📋 Envié mis respuestas iniciales al tutor…', 'user');
  const tid = agregarTypingGen('chat-box2');
  setStatusGen('tutor-status-text2', 'Analizando tus respuestas…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: contexto, session_id: `cap3_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2', 'En línea');
    if (data.reply) agregarMensajeGen('chat-box2', data.reply, 'tutor');
    _cap3AplicarSenalEstructurada(data);
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2', 'En línea');
    agregarMensajeGen('chat-box2', 'Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }
  setTimeout(() => tutorPanel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
}

/* ════════════════════════════════════════════════
   CAP II — PUENTE HACIA ASOCIACIÓN E INDEPENDENCIA
   (nueva página '10b', entre Actividad y Ejemplos dinámicos)
   Reutiliza CAP3_ACT_DATA. Gráfico: % de Introvertida por columna.
════════════════════════════════════════════════ */
function _cap3PuenteCalcularPorColumna() {
  const { filas, columnas, matriz } = CAP3_ACT_DATA;
  const totalesCol = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  // % de Introvertida (fila 0) dentro de cada columna
  return columnas.map((c, j) => +(matriz[0][j] / totalesCol[j] * 100).toFixed(1));
}

let cap3PuenteChart = null;
let cap3PuenteRefVisible = false;

function cap3PuenteRenderChart() {
  const ctx = document.getElementById('cap3-puente-canvas')?.getContext('2d');
  if (!ctx) return;
  if (cap3PuenteChart) { cap3PuenteChart.destroy(); cap3PuenteChart = null; }
  const { columnas } = CAP3_ACT_DATA;
  const pctIntrovertida = _cap3PuenteCalcularPorColumna();
  const datasets = [{
    label: '% Introvertida dentro de cada color',
    data: pctIntrovertida,
    backgroundColor: 'rgba(26,58,90,.8)',
    borderColor: 'rgba(26,58,90,1)',
    borderWidth: 1,
    borderRadius: 4,
  }];
  if (cap3PuenteRefVisible) {
    datasets.push({
      type: 'line',
      label: '% Introvertida en toda la muestra (25%)',
      data: columnas.map(() => 25),
      borderColor: 'rgba(200,168,75,1)',
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
    });
  }
  cap3PuenteChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: columnas, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: cap3PuenteRefVisible, position: 'bottom', labels: { font: { size: 10 } } },
        title: { display: true, text: '% de Introvertida dentro de cada color favorito', font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
      },
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
      animation: { duration: 500 }
    }
  });
}

function cap3PuenteToggleReferencia() {
  cap3PuenteRefVisible = !cap3PuenteRefVisible;
  const btn = document.getElementById('cap3-puente-toggle-ref');
  if (btn) btn.textContent = cap3PuenteRefVisible
    ? '🙈 Ocultar referencia sin relación'
    : '👁️ Mostrar referencia sin relación';
  cap3PuenteRenderChart();
}

async function inicializarCap3Puente() {
  cap3PuenteRenderChart();
  if (chatCap3PuenteIniciado) return;
  chatCap3PuenteIniciado = true;

  const { p1, p2, p3 } = cap3RespuestasIniciales;
  const contexto = (p1 || p3)
    ? `[CONTEXTO — Respuestas del estudiante en la página anterior]
Primera impresión sobre la relación entre color y personalidad: ${p1 || '(sin registrar)'}
Apuesta inicial (¿relacionadas o independientes?) y en qué patrón se basó: ${p3 || '(sin registrar)'}
Ahora el estudiante ve un gráfico de barras con el % de introvertidos dentro de cada color.`
    : `[CONTEXTO — El estudiante no registró respuestas previas en esta sesión]
Pide primero que formule, en sus propias palabras, si cree que el color favorito y la personalidad están relacionados, mirando el gráfico de barras que ahora tiene disponible.`;

  const chatBox = 'chat-cap3b';
  agregarMensajeGen(chatBox, '📋 Continuando con el análisis…', 'user');
  const tid = agregarTypingGen(chatBox);
  setStatusGen('tutor-status-text2b', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: contexto, session_id: `cap3b_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2b', 'En línea');
    if (data.reply) agregarMensajeGen(chatBox, data.reply, 'tutor');
    if (data.institucionalizado === true) cap3PuenteInstitucionalizado = true;
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2b', 'En línea');
    agregarMensajeGen(chatBox, 'Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

async function enviarMensajeCap3b() {
  const input = document.getElementById('user-input-cap3b');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-cap3b', texto, 'user');
  const tid = agregarTypingGen('chat-cap3b');
  setStatusGen('tutor-status-text2b', 'Escribiendo…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `cap3b_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2b', 'En línea');
    if (data.reply) agregarMensajeGen('chat-cap3b', data.reply, 'tutor');
    if (data.institucionalizado === true) cap3PuenteInstitucionalizado = true;
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-text2b', 'En línea');
    agregarMensajeGen('chat-cap3b', 'Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

/* ════════════════════════════════════════════════
   CAP IV — EJEMPLOS DINÁMICOS (página 11)
════════════════════════════════════════════════ */
const EJ_DATA = {
  filas:    ['Ciencias', 'Ingenierías', 'Humanidades'],
  columnas: ['Presencial', 'Virtual', 'Híbrida'],
  matriz:   [[18, 12, 20], [30, 8, 22], [14, 16, 10]],
  N: 150
};

const EJ_PREGUNTAS = {
  absoluta: '¿Cuántos estudiantes de Ingenierías prefieren la modalidad Presencial?',
  total:    '¿Qué porcentaje del total prefiere la modalidad Híbrida en Ciencias?',
  fila:     'Del grupo de Humanidades, ¿qué porcentaje prefiere la modalidad Virtual?',
  columna:  'De quienes prefieren modalidad Presencial, ¿qué porcentaje pertenece a Ingenierías?'
};

const EJ_EXPLICA = {
  absoluta: { tag: 'Tipo 1 · Frecuencias absolutas', texto: 'Muestra los <strong>conteos directos</strong>. Útil para saber cuántos hay, pero no permite comparar grupos de distinto tamaño.', alerta: '💡 Cambia el tipo y observa cómo cambia el gráfico automáticamente.' },
  total:    { tag: 'Tipo 2 · % sobre el total',      texto: 'Cada celda dividida entre <strong>N=150</strong>. Responde: ¿qué fracción del <em>total</em> representa cada combinación?', alerta: '⚠️ La suma de todas las celdas es 100%.' },
  fila:     { tag: 'Tipo 3a · % por fila',           texto: 'Cada celda dividida entre el <strong>total de su fila</strong>. Compara las modalidades <em>dentro de cada facultad</em>.', alerta: '⚠️ Cada fila suma 100%. Permite comparar filas entre sí.' },
  columna:  { tag: 'Tipo 3b · % por columna',        texto: 'Cada celda dividida entre el <strong>total de su columna</strong>. Compara las facultades <em>dentro de cada modalidad</em>.', alerta: '⚠️ Cada columna suma 100%. Permite comparar columnas entre sí.' }
};

let ejGraficoActual = null;
let ejTipoActual    = 'absoluta';

function cambiarEjemplo(tipo) {
  ejTipoActual = tipo;
  document.querySelectorAll('[id^="etab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById(`etab-${tipo}`)?.classList.add('active');
  renderizarEjTabla(tipo);
  renderizarEjGrafico(tipo);
  const q = document.getElementById('ej-question-text');
  if (q) q.textContent = EJ_PREGUNTAS[tipo];
  const info = EJ_EXPLICA[tipo];
  const tag  = document.getElementById('ej-tag');
  const txt  = document.getElementById('ej-explain-text');
  const alt  = document.getElementById('ej-alert');
  if (tag) tag.textContent = info.tag;
  if (txt) txt.innerHTML   = info.texto;
  if (alt) alt.textContent = info.alerta;
}

function renderizarEjTabla(tipo) {
  const { filas, columnas, matriz, N } = EJ_DATA;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr><th>Facultad \\ Modalidad</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';
  matriz.forEach((fila, i) => {
    html += `<tr><td>${filas[i]}</td>`;
    fila.forEach((val, j) => { html += `<td>${calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N)}</td>`; });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });
  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td>${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td>${tipo === 'absoluta' ? N : '100%'}</td></tr></tbody></table>`;

  const w = document.getElementById('ej-tabla-wrapper');
  if (w) { w.style.opacity='0'; setTimeout(() => { w.innerHTML=html; w.style.opacity='1'; w.style.transition='opacity .2s'; }, 100); }
}

function renderizarEjGrafico(tipo) {
  const ctx = document.getElementById('ejGrafico')?.getContext('2d');
  if (!ctx) return;
  if (ejGraficoActual) ejGraficoActual.destroy();

  const { filas, columnas, matriz, N } = EJ_DATA;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));
  const COLORES = ['rgba(26,58,90,.8)','rgba(46,107,79,.8)','rgba(200,168,75,.8)'];

  let config;

  if (tipo === 'fila' || tipo === 'columna') {
    // Barras apiladas al 100%: la forma más clara de comparar distribuciones
    // condicionales. Si las variables son independientes, los límites entre
    // segmentos quedan a la misma altura en todas las barras; si hay asociación,
    // se desalinean visiblemente.
    const porFila = tipo === 'fila';
    const ejes    = porFila ? filas    : columnas;
    const series  = porFila ? columnas : filas;
    const totales = porFila ? totalesFila : totalesCol;

    const datasets = series.map((s, k) => ({
      label: s,
      data: ejes.map((_, e) => {
        const val = porFila ? matriz[e][k] : matriz[k][e];
        return +(val / totales[e] * 100).toFixed(1);
      }),
      backgroundColor: COLORES[k % COLORES.length],
      borderRadius: 2,
    }));

    config = {
      type: 'bar',
      data: { labels: ejes, datasets },
      options: {
        responsive: true,
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Inter', size: 10 }, boxWidth: 10 } },
          title: { display: true, text: `Facultad × Modalidad — % por ${porFila ? 'fila' : 'columna'} (apilado)`, font: { size: 11 }, color: '#1A3A5A' }
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } },
          y: { stacked: true, beginAtZero: true, max: 100, ticks: { callback: v => v + '%', font: { family: 'JetBrains Mono', size: 9 } } }
        }
      }
    };
  } else {
    // Absoluta y % sobre el total: barras agrupadas normales.
    const datasets = filas.map((fila, i) => ({
      label: fila,
      data: matriz[i].map((val, j) => parseFloat(String(calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N)).replace('%',''))),
      backgroundColor: COLORES[i],
      borderRadius: 3,
    }));
    config = {
      type: 'bar',
      data: { labels: columnas, datasets },
      options: {
        responsive: true,
        animation: { duration: 500, easing: 'easeOutQuart' },
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Inter', size: 10 }, boxWidth: 10 } },
          title: { display: true, text: `Facultad × Modalidad — ${tipo}`, font: { size: 11 }, color: '#1A3A5A' }
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'JetBrains Mono', size: 9 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } }
        }
      }
    };
  }

  ejGraficoActual = new Chart(ctx, config);
}

/* ════════════════════════════════════════════════
   CAP IV — PROBLEMAS TIPO A (página 12)
════════════════════════════════════════════════ */
const PROBLEMAS_A = [
  {
    enunciado: 'Se encuestaron <strong>90 estudiantes de la UIS</strong> sobre su <strong>facultad</strong> (Ciencias / Ingenierías / Humanidades) y su <strong>modalidad de estudio preferida</strong> (Individual / Grupal / Mixta). La tabla tiene algunas celdas ocultas.',
    pregunta: '¿Dentro de los estudiantes de Ingenierías, cuál es la modalidad más frecuente? ¿Ese porcentaje cambia si lo calculas respecto al total general?',
    filas: ['Ciencias', 'Ingenierías', 'Humanidades'],
    columnas: ['Individual', 'Grupal', 'Mixta'],
    matriz: [[14, 8, 8], [10, 18, 12], [6, 10, 4]],
    ocultas: [[0,2],[1,0],[1,2],[2,1]],
    respuestaCorrecta: 'fila',
    N: 90,
    justifCorrecta: 'fila',
    analisis: '¿Qué diferencia hay entre decir que "el 45% de Ingenierías prefiere grupal" y decir que "los de Ingenierías representan el 20% de los que prefieren grupal"? ¿Por qué importa ese matiz?'
  },
  {
    enunciado: 'Tabla de <strong>120 jóvenes de Bucaramanga</strong> cruzando <strong>nivel educativo del padre</strong> (Primaria / Bachillerato / Universidad) con <strong>acceso a internet en casa</strong> (Sí / No). Algunas celdas están ocultas.',
    pregunta: 'De todos los jóvenes encuestados, ¿qué proporción tiene padre con nivel universitario Y tiene acceso a internet?',
    filas: ['Primaria', 'Bachillerato', 'Universidad'],
    columnas: ['Sí', 'No'],
    matriz: [[18, 22], [24, 16], [32, 8]],
    ocultas: [[0,1],[1,0],[2,0]],
    respuestaCorrecta: 'total',
    N: 120,
    justifCorrecta: 'total',
    analisis: 'Con esa proporción, ¿puedes afirmar que el nivel educativo del padre determina el acceso a internet? ¿Qué información adicional necesitarías para hacer una afirmación más sólida?'
  },
  {
    enunciado: 'Encuesta a <strong>80 trabajadores</strong> de una empresa en Bucaramanga cruzando <strong>turno laboral</strong> (Mañana / Tarde / Noche) con <strong>nivel de estrés auto-reportado</strong> (Bajo / Medio / Alto). Algunas celdas están ocultas.',
    pregunta: 'De quienes trabajan en el turno de noche, ¿qué porcentaje reporta estrés alto? ¿Ese dato por sí solo te permite concluir que el turno nocturno causa más estrés?',
    filas: ['Mañana', 'Tarde', 'Noche'],
    columnas: ['Bajo', 'Medio', 'Alto'],
    matriz: [[12, 10, 8], [10, 12, 8], [4, 8, 8]],
    ocultas: [[0,0],[1,2],[2,1],[2,2]],
    respuestaCorrecta: 'fila',
    N: 80,
    justifCorrecta: 'fila',
    analisis: '¿Cambiaría tu interpretación si supieras que el turno nocturno tiene menos trabajadores? ¿Por qué comparar porcentajes por fila es más justo que comparar frecuencias absolutas cuando los grupos tienen distinto tamaño?'
  }
];

let probAActual   = 0;
let tipoEscogidoA = null;

function escogerTipoA(tipo) {
  tipoEscogidoA = tipo;
  document.querySelectorAll('#page-12 .pts-btn').forEach(b => {
    b.classList.remove('selected','correcto','incorrecto');
    if (b.dataset.tipo === tipo) b.classList.add('selected');
  });
  document.getElementById('probA-tipo-feedback').style.display = 'none';
  // Mostrar sección de tabla la primera vez que eligen tipo
  const sec = document.getElementById('probA-tabla-section');
  if (sec) sec.style.display = 'block';
  _renderizarTablaA();
  pAGuardarEstado();
}

function renderizarProbA() {
  const p = PROBLEMAS_A[probAActual];
  document.getElementById('probA-enunciado').innerHTML   = p.enunciado;
  document.getElementById('probA-pregunta').innerHTML    = p.pregunta;
  document.getElementById('probA-num-badge').textContent = probAActual + 1;
  document.getElementById('probA-feedback').style.display = 'none';
  tipoEscogidoA = null;
  document.querySelectorAll('#page-12 .pts-btn').forEach(b => b.classList.remove('selected','correcto','incorrecto'));
  document.getElementById('probA-tipo-feedback').style.display = 'none';
  const justif = document.getElementById('probA-justif');
  if (justif) justif.value = '';
  // Ocultar tabla y tutor hasta nueva selección
  const sec = document.getElementById('probA-tabla-section');
  if (sec) sec.style.display = 'none';
  const panel = document.getElementById('pA-tutor-panel');
  if (panel) panel.style.display = 'none';
  const box = document.getElementById('chat-contA');
  if (box) box.innerHTML = '';
  // Tras el reseteo, intentar restaurar el estado guardado de ESTE problema
  pARestaurarEstado();
}

function _renderizarTablaA() {
  const p    = PROBLEMAS_A[probAActual];
  const tipo = tipoEscogidoA || 'absoluta';
  const { filas, columnas, matriz, ocultas, N } = p;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr><th>↓ / →</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total</th></tr></thead><tbody>';
  matriz.forEach((fila, i) => {
    html += `<tr><td>${filas[i]}</td>`;
    fila.forEach((val, j) => {
      const esOculta      = ocultas.some(([oi,oj]) => oi===i && oj===j);
      const valorCorrecto = calcularCeldaNum(tipo, val, totalesFila[i], totalesCol[j], N);
      const celdaDisplay  = calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N);
      if (esOculta) {
        html += `<td><input type="number" step="any" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${valorCorrecto}" placeholder="?" oninput="pAGuardarEstado()"></td>`;
      } else { html += `<td>${celdaDisplay}</td>`; }
    });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });
  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td class="td-marg">${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td class="td-marg">${tipo === 'absoluta' ? N : '100%'}</td></tr></tbody></table>`;
  const w = document.getElementById('probA-tabla-wrapper');
  if (w) w.innerHTML = html;
}

// Guarda tipo escogido + valores de celdas + justificación, por problema y por sesión/dispositivo.
function pAGuardarEstado() {
  const celdas = {};
  document.querySelectorAll('#probA-tabla-wrapper .cell-input').forEach(inp => {
    celdas[`${inp.dataset.fila}-${inp.dataset.col}`] = inp.value;
  });
  guardarEstadoLocal(`pA_${probAActual}`, {
    tipo: tipoEscogidoA,
    celdas,
    justificacion: document.getElementById('probA-justif')?.value || '',
  });
}

// Restaura el estado guardado de ESTE problema específico (si existe) — nunca
// llama a escogerTipoA() para no disparar un guardado prematuro con celdas vacías.
function pARestaurarEstado() {
  const saved = leerEstadoLocal(`pA_${probAActual}`);

  if (saved) {
    if (saved.tipo) {
      tipoEscogidoA = saved.tipo;
      document.querySelectorAll('#page-12 .pts-btn').forEach(b => {
        b.classList.remove('selected','correcto','incorrecto');
        if (b.dataset.tipo === saved.tipo) b.classList.add('selected');
      });
      const sec = document.getElementById('probA-tabla-section');
      if (sec) sec.style.display = 'block';
      _renderizarTablaA();
    }

    if (saved.celdas) {
      document.querySelectorAll('#probA-tabla-wrapper .cell-input').forEach(inp => {
        const k = `${inp.dataset.fila}-${inp.dataset.col}`;
        if (saved.celdas[k]) inp.value = saved.celdas[k];
      });
    }

    const justif = document.getElementById('probA-justif');
    if (justif && saved.justificacion) justif.value = saved.justificacion;
  }

  // El chat se restaura SIEMPRE, sin importar si había o no estado local guardado.
  const sid = `cont_A_${probAActual}_${sessionId}`;
  cargarHistorial(sid, 'chat-contA').then(() => {
    const box = document.getElementById('chat-contA');
    const panel = document.getElementById('pA-tutor-panel');
    if (box && box.innerHTML.trim() !== '' && panel) panel.style.display = 'flex';
  });
}

function verificarProblemaA() {
  const p      = PROBLEMAS_A[probAActual];
  const fbTipo = document.getElementById('probA-tipo-feedback');
  if (!tipoEscogidoA) {
    fbTipo.style.display='block'; fbTipo.className='pts-feedback error';
    fbTipo.textContent='⚠️ Primero selecciona el sistema de representación adecuado.'; return;
  }
  const tipoOk = tipoEscogidoA === p.respuestaCorrecta;
  document.querySelectorAll('#page-12 .pts-btn').forEach(b => {
    b.classList.remove('correcto','incorrecto');
    if (b.dataset.tipo === tipoEscogidoA) b.classList.add(tipoOk ? 'correcto' : 'incorrecto');
  });
  fbTipo.style.display='block';
  fbTipo.className = tipoOk ? 'pts-feedback ok' : 'pts-feedback error';
  fbTipo.innerHTML = tipoOk
    ? `✅ ¡Correcto! El <strong>% por ${p.respuestaCorrecta}</strong> es el sistema adecuado para esta pregunta.`
    : `❌ El sistema <strong>${tipoEscogidoA}</strong> no es el más adecuado. Piensa: ¿quién es el "universo" de referencia de la pregunta?`;

  const inputs = document.querySelectorAll('#probA-tabla-wrapper .cell-input');
  let correctas=0, total=inputs.length;
  inputs.forEach(inp => {
    const val=parseFloat(inp.value), correcto=parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && Math.abs(val-correcto)<0.2) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value!=='') inp.classList.add('incorrecto');
  });
  const fb = document.getElementById('probA-feedback');
  fb.style.display='block';
  if (correctas===total && tipoOk)       { fb.className='prob-feedback ok';     fb.innerHTML='✅ ¡Perfecto! Sistema correcto y todas las celdas completadas. Ahora consulta al tutor para profundizar.'; }
  else if (correctas===total && !tipoOk) { fb.className='prob-feedback parcial'; fb.innerHTML='⚠️ Las celdas son correctas para el tipo que escogiste, pero ese sistema no responde la pregunta.'; }
  else                                   { fb.className='prob-feedback parcial'; fb.innerHTML=`⚠️ ${correctas} de ${total} celdas correctas. Las rojas tienen error.`; }
}

function cambiarProbA(idx) {
  if (idx < 0 || idx >= PROBLEMAS_A.length) return;
  probAActual = idx;
  document.querySelectorAll('#probA-tabs .p5c-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  tipoEscogidoA = null;
  renderizarProbA();
}

/* ════════════════════════════════════════════════
   CAP IV — PROBLEMAS TIPO B (página 13)
════════════════════════════════════════════════ */
const PROBLEMAS_B = [
  {
    enunciado: 'Se encuestaron <strong>90 estudiantes</strong> de la UIS sobre su <strong>medio de transporte</strong> (Bus / Bicicleta / A pie) y su <strong>puntualidad</strong> (Siempre / A veces / Nunca).',
    frases: [
      '30 estudiantes usan Bus.',
      'De los que usan Bus, 12 llegan A veces a tiempo.',
      'En total, 20 estudiantes usan Bicicleta.',
      'De quienes usan Bicicleta, la mitad llega Siempre a tiempo.',
      'De los que usan Bicicleta, 6 llegan A veces a tiempo.',
      '10 estudiantes van A pie y llegan A veces.',
      '15 estudiantes van A pie y Nunca llegan a tiempo.',
      'En total, 35 estudiantes llegan Siempre a tiempo.'
    ],
    pregunta: '¿Qué medio de transporte se asocia con mejor puntualidad?',
    filas: ['Bus','Bicicleta','A pie'], columnas: ['Siempre','A veces','Nunca'],
    solucion: [[10,12,8],[10,6,4],[15,10,15]], respuestaCorrecta: 'fila', N: 90,
    preguntas: [
      {
        id: 'pB0-q1', tipo: 'condicional',
        badge: '% por fila', color: 'var(--moss)',
        texto: 'Calcula el porcentaje de puntualidad "Siempre" dentro de cada medio de transporte. ¿Cuál tiene la proporción más alta? ¿Por qué no es suficiente comparar los conteos absolutos?',
        claves: ['bicicleta','50%','33%','mismo conteo','proporciones','grupos de distinto tamaño','base distinta'],
        retro: 'Bicicleta: 10/20 = 50%, Bus: 10/30 ≈ 33.3%, A pie: 15/40 = 37.5%. Bus y Bicicleta tienen el MISMO conteo absoluto de estudiantes puntuales (10 y 10), pero Bicicleta representa una proporción mucho mayor de su propio grupo. Los absolutos engañan si los grupos tienen distinto tamaño.'
      },
      {
        id: 'pB0-q2', tipo: 'conjunta',
        badge: '% total', color: 'var(--navy)',
        texto: 'Del total de 90 estudiantes, ¿qué porcentaje va en Bus Y llega Siempre? ¿Ese dato por sí solo te permite concluir que el bus es el mejor medio para ser puntual?',
        claves: ['11%','11.1','no es suficiente','no permite','contexto','comparar dentro','base'],
        retro: '10/90 ≈ 11.1%. Ese dato aislado no permite comparar: no sabes qué proporción del total de usuarios de bus llega siempre. Necesitas el % condicional por fila para una comparación justa.'
      },
      {
        id: 'pB0-q3', tipo: 'N4',
        badge: 'N4 · Causalidad', color: 'var(--gold)',
        texto: '¿Podría haber una variable que explique tanto la elección del transporte como la puntualidad, sin que una cause la otra directamente? Propón al menos una.',
        claves: ['distancia','zona','horario','disciplina','hábito','compromiso','otro factor','tercera variable','confusión'],
        retro: 'Posibles variables ocultas: distancia al campus (quien vive cerca va a pie y llega tarde porque subestima el tiempo), disciplina personal, horario de clase, etc. La asociación estadística no implica causalidad — ese es el núcleo del N4 de Curcio.'
      }
    ]
  },
  {
    enunciado: 'Se encuestaron <strong>60 estudiantes</strong> sobre su <strong>programa</strong> (Matemáticas / Física / Estadística) y el <strong>software estadístico</strong> que más usan (R / Python / SPSS).',
    frases: [
      '25 estudiantes son de Matemáticas.',
      'Solo 2 estudiantes de Matemáticas usan SPSS.',
      'En total, 20 estudiantes son de Física.',
      'El 40% de los estudiantes de Física usa R.',
      'De los de Física, 6 usan Python.',
      '8 estudiantes de Estadística usan Python.',
      'De los de Estadística, 5 usan SPSS.',
      'En total, 22 estudiantes usan Python.'
    ],
    pregunta: 'Dentro de cada programa, ¿cuál es el software más usado?',
    filas: ['Matemáticas','Física','Estadística'], columnas: ['R','Python','SPSS'],
    solucion: [[15,8,2],[8,6,6],[2,8,5]], respuestaCorrecta: 'fila', N: 60,
    preguntas: [
      {
        id: 'pB1-q1', tipo: 'condicional',
        badge: '% por fila', color: 'var(--moss)',
        texto: 'Compara el perfil de software de Matemáticas versus Estadística usando % por fila. ¿En qué son más diferentes? ¿Qué podría explicar esa diferencia desde el contexto de cada disciplina?',
        claves: ['estadística usa más python','estadística spss','matemáticas prefiere r','disciplina','currículum','contexto','herramientas del área'],
        retro: 'Matemáticas: R 60%, Python 32%, SPSS 8%. Estadística: R 13.3%, Python 53.3%, SPSS 33.3%. La diferencia en Python y SPSS es notable — Estadística los usa mucho más, quizás porque su currículo los incluye explícitamente, mientras Matemáticas se apoya más en R.'
      },
      {
        id: 'pB1-q2', tipo: 'marginal',
        badge: 'Marginal', color: 'var(--navy)',
        texto: 'Python lo usan 22 de 60 estudiantes (37%). ¿Eso significa que es el software más popular entre los tres programas? Usa las frecuencias marginales de columna para justificar tu respuesta.',
        claves: ['r tiene más','r es el más','marginal','total columna','37%','r 25','r tiene 25','no es el más popular'],
        retro: 'Marginal R: 15+8+2 = 25, Python: 8+6+8 = 22, SPSS: 2+6+5 = 13. R (25) supera a Python (22) en el total — Python parece "popular" por mencionarse en el enunciado, pero en realidad R lidera marginalmente. La marginal de columna revela el uso global, independiente del programa.'
      },
      {
        id: 'pB1-q3', tipo: 'N3',
        badge: 'N3 · Predicción', color: 'var(--gold)',
        texto: 'Si la UIS abriera un nuevo programa de Ciencia de Datos, ¿qué distribución de software esperarías? Justifica tu predicción con base en los patrones que observas en la tabla.',
        claves: ['python','datos','tendencia','similar a estadística','predominaría python','predicción','patrón','basado en'],
        retro: 'Es razonable predecir un perfil similar a Estadística (53.3% Python), dado que la Ciencia de Datos tiene fuerte orientación a programación. Esta es una lectura N3: usar los datos para extrapolar más allá de lo observado.'
      }
    ]
  },
  {
    enunciado: 'Se encuestaron <strong>75 estudiantes</strong> sobre su <strong>nivel de inglés</strong> (Básico / Intermedio / Avanzado) y su <strong>participación en intercambios internacionales</strong> (Sí / No).',
    frases: [
      '30 estudiantes tienen nivel Básico.',
      '20 estudiantes tienen nivel Avanzado.',
      'El 60% de los de nivel Avanzado participó en intercambio.',
      'Solo 3 estudiantes de nivel Básico participaron.',
      'En total, 25 estudiantes tienen nivel Intermedio.',
      '7 estudiantes de nivel Intermedio participaron en intercambio.',
      'En total, 22 estudiantes participaron en intercambio.'
    ],
    pregunta: 'De quienes participaron en intercambio, ¿de qué nivel son principalmente?',
    filas: ['Básico','Intermedio','Avanzado'], columnas: ['Sí','No'],
    solucion: [[3,27],[7,18],[12,8]], respuestaCorrecta: 'columna', N: 75,
    preguntas: [
      {
        id: 'pB2-q1', tipo: 'condicional-col',
        badge: '% por columna', color: 'var(--moss)',
        texto: 'Calcula qué porcentaje de los que SÍ participaron en intercambio tiene nivel Avanzado. ¿Por qué el % por columna es más útil aquí que el % por fila para responder la pregunta del enunciado?',
        claves: ['54%','avanzado','columna','universo','quienes participaron','base es el total de sí'],
        retro: 'Avanzado: 12/22 ≈ 54.5%. El % por columna tiene como base el total de quienes Sí participaron (22), que es el "universo" de la pregunta. El % por fila respondería otra pregunta: qué proporción de avanzados participó.'
      },
      {
        id: 'pB2-q2', tipo: 'doble-condicional',
        badge: 'Doble lectura', color: 'var(--navy)',
        texto: 'Calcula también el % por fila para el nivel Avanzado. Tendrás dos datos: "el 60% de los Avanzados participó" y "el 54% de quienes participaron son Avanzados". ¿Son la misma afirmación? ¿Cuándo usarías cada una?',
        claves: ['no son lo mismo','distintas preguntas','base diferente','distinto universo','60% de avanzados','54% de quienes participaron','complementarias'],
        retro: 'No son la misma. "60% de Avanzados participó" (fila) responde: ¿cuán propensos son los avanzados a participar? "54% de quienes participaron son Avanzados" (columna) responde: ¿quiénes conforman el grupo de participantes? Cada una responde una pregunta distinta.'
      },
      {
        id: 'pB2-q3', tipo: 'N4',
        badge: 'N4 · Causalidad', color: 'var(--gold)',
        texto: '¿El nivel de inglés determina la participación en intercambios, o podría haber otras variables que expliquen el patrón? Propón al menos dos factores alternativos y explica cómo podrían afectar los datos.',
        claves: ['recursos económicos','beca','acceso','motivación','programa','carrera','factor','variable','no necesariamente causa','asociación no es causalidad'],
        retro: 'Factores alternativos: recursos económicos (quien tiene nivel avanzado puede venir de contextos con más acceso), motivación (estudiantes con mayor interés académico estudian más inglés Y buscan intercambios), o exigencia del programa. La asociación entre nivel de inglés e intercambio puede ser espuria — ambas podrían ser consecuencia de un tercer factor.'
      }
    ]
  }
];

let probBActual   = 0;
let tipoEscogidoB = null;

function escogerTipoB(tipo) {
  tipoEscogidoB = tipo;
  document.querySelectorAll('#page-13 .pts-btn').forEach(b => {
    b.classList.remove('selected','correcto','incorrecto');
    if (b.dataset.tipo === tipo) b.classList.add('selected');
  });
  document.getElementById('probB-tipo-feedback').style.display = 'none';
  // Mostrar sección de tabla la primera vez que eligen tipo
  const sec = document.getElementById('probB-tabla-section');
  if (sec) sec.style.display = 'block';
  _renderizarTablaB();
  pBGuardarEstado();
}

function renderizarProbB() {
  const p = PROBLEMAS_B[probBActual];
  document.getElementById('probB-enunciado').innerHTML  = p.enunciado;
  document.getElementById('probB-pregunta').innerHTML   = p.pregunta;
  document.getElementById('probB-num').textContent      = probBActual + 1;
  document.getElementById('probB-feedback').style.display = 'none';
  const frasesEl = document.getElementById('probB-frases');
  if (frasesEl) frasesEl.innerHTML = p.frases.map(f => `<div class="prob-frase">• ${f}</div>`).join('');
  tipoEscogidoB = null;
  document.querySelectorAll('#page-13 .pts-btn').forEach(b => b.classList.remove('selected','correcto','incorrecto'));
  document.getElementById('probB-tipo-feedback').style.display = 'none';
  // Ocultar tabla y tutor hasta nueva selección
  const sec = document.getElementById('probB-tabla-section');
  if (sec) sec.style.display = 'none';
  const panel = document.getElementById('pB-tutor-panel');
  if (panel) panel.style.display = 'none';
  const box = document.getElementById('chat-contB');
  if (box) box.innerHTML = '';
  _renderizarPreguntasB(p);
  // Tras el reseteo, intentar restaurar el estado guardado de ESTE problema
  pBRestaurarEstado();
}

function _renderizarPreguntasB(p) {
  const list = document.getElementById('probB-preguntas-list');
  if (!list) return;
  list.innerHTML = p.preguntas.map((q, i) => `
    <div class="p5d-pregunta-card">
      <div class="p5d-preg-badge" style="background:${q.color}">${q.badge}</div>
      <p class="p5d-preg-texto"><strong>Pregunta ${i+1}:</strong> ${q.texto}</p>
      <textarea class="p5d-resp-input" id="${q.id}" rows="3" oninput="pBGuardarEstado()"
                placeholder="Escribe aquí tu análisis…"></textarea>
      <div class="p5d-retro" id="${q.id}-retro" style="display:none;"></div>
    </div>`).join('');
}

function _renderizarTablaB() {
  const p    = PROBLEMAS_B[probBActual];
  const tipo = tipoEscogidoB || 'absoluta';
  const { filas, columnas, N } = p;
  const totalesCol  = columnas.map((_, j) => p.solucion.reduce((s,r)=>s+r[j],0));
  const totalesFila = p.solucion.map(r => r.reduce((s,v)=>s+v,0));

  let html = '<table><thead><tr><th>↓ / →</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total fila</th></tr></thead><tbody>';
  filas.forEach((fila, i) => {
    html += `<tr><td>${fila}</td>`;
    columnas.forEach((_, j) => {
      const valorCorrecto = calcularCeldaNum(tipo, p.solucion[i][j], totalesFila[i], totalesCol[j], N);
      html += `<td><input type="number" step="any" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${valorCorrecto}" placeholder="?" oninput="pBGuardarEstado()"></td>`;
    });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });
  html += '<tr><td>Total col</td>';
  totalesCol.forEach(tc => { html += `<td class="td-marg">${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td class="td-marg">${tipo === 'absoluta' ? N : '100%'}</td></tr></tbody></table>`;
  const w = document.getElementById('probB-tabla-wrapper');
  if (w) w.innerHTML = html;
}

// Guarda tipo + celdas + las 3 preguntas de análisis, por problema y por sesión/dispositivo.
function pBGuardarEstado() {
  const celdas = {};
  document.querySelectorAll('#probB-tabla-wrapper .cell-input').forEach(inp => {
    celdas[`${inp.dataset.fila}-${inp.dataset.col}`] = inp.value;
  });
  const p = PROBLEMAS_B[probBActual];
  const respuestas = {};
  (p?.preguntas || []).forEach(q => { respuestas[q.id] = document.getElementById(q.id)?.value || ''; });
  guardarEstadoLocal(`pB_${probBActual}`, { tipo: tipoEscogidoB, celdas, respuestas });
}

// Restaura el estado guardado de ESTE problema (si existe) — nunca llama a
// escogerTipoB() para no disparar un guardado prematuro con celdas vacías.
function pBRestaurarEstado() {
  const saved = leerEstadoLocal(`pB_${probBActual}`);

  if (saved) {
    if (saved.tipo) {
      tipoEscogidoB = saved.tipo;
      document.querySelectorAll('#page-13 .pts-btn').forEach(b => {
        b.classList.remove('selected','correcto','incorrecto');
        if (b.dataset.tipo === saved.tipo) b.classList.add('selected');
      });
      const sec = document.getElementById('probB-tabla-section');
      if (sec) sec.style.display = 'block';
      _renderizarTablaB();
    }

    if (saved.celdas) {
      document.querySelectorAll('#probB-tabla-wrapper .cell-input').forEach(inp => {
        const k = `${inp.dataset.fila}-${inp.dataset.col}`;
        if (saved.celdas[k]) inp.value = saved.celdas[k];
      });
    }

    if (saved.respuestas) {
      Object.entries(saved.respuestas).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      });
    }
  }

  // El chat se restaura SIEMPRE, sin importar si había o no estado local guardado.
  const sid = `cont_B_${probBActual}_${sessionId}`;
  cargarHistorial(sid, 'chat-contB').then(() => {
    const box = document.getElementById('chat-contB');
    const panel = document.getElementById('pB-tutor-panel');
    if (box && box.innerHTML.trim() !== '' && panel) panel.style.display = 'flex';
  });
}

function verificarProblemaB() {
  const p      = PROBLEMAS_B[probBActual];
  const fbTipo = document.getElementById('probB-tipo-feedback');
  if (!tipoEscogidoB) {
    fbTipo.style.display='block'; fbTipo.className='pts-feedback error';
    fbTipo.textContent='⚠️ Primero selecciona el sistema de representación.'; return;
  }
  const tipoOk = tipoEscogidoB === p.respuestaCorrecta;
  document.querySelectorAll('#page-13 .pts-btn').forEach(b => {
    b.classList.remove('correcto','incorrecto');
    if (b.dataset.tipo === tipoEscogidoB) b.classList.add(tipoOk ? 'correcto' : 'incorrecto');
  });
  fbTipo.style.display='block';
  fbTipo.className = tipoOk ? 'pts-feedback ok' : 'pts-feedback error';
  fbTipo.innerHTML = tipoOk
    ? `✅ ¡Correcto! <strong>${p.respuestaCorrecta}</strong> es el sistema adecuado.`
    : `❌ El sistema <strong>${tipoEscogidoB}</strong> no es el adecuado. ¿Quién es el "universo" de comparación de la pregunta?`;

  const inputs = document.querySelectorAll('#probB-tabla-wrapper .cell-input');
  let correctas=0, total=inputs.length;
  inputs.forEach(inp => {
    const val=parseFloat(inp.value), correcto=parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && Math.abs(val-correcto)<0.2) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value!=='') inp.classList.add('incorrecto');
  });

  // NOTA TSD: las preguntas de análisis abiertas NO se autocalifican por palabras clave.
  // Su evaluación la hace el tutor IA (pBEnviarAlTutor), que responde al razonamiento
  // real del estudiante. Aquí solo validamos la tabla y el sistema de representación.

  const fb = document.getElementById('probB-feedback');
  fb.style.display='block';
  if (correctas===total && tipoOk)       { fb.className='prob-feedback ok';     fb.innerHTML='✅ ¡Excelente! Sistema correcto y tabla completa. Ahora pulsa "Consultar tutor" para que analice tus respuestas a las preguntas.'; }
  else if (correctas===total && !tipoOk) { fb.className='prob-feedback parcial'; fb.innerHTML='⚠️ Los valores son correctos pero el sistema no responde la pregunta planteada.'; }
  else                                   { fb.className='prob-feedback parcial'; fb.innerHTML=`⚠️ ${correctas} de ${total} celdas correctas.`; }
}

function cambiarProbB(idx) {
  if (idx < 0 || idx >= PROBLEMAS_B.length) return;
  probBActual = idx;
  document.querySelectorAll('#probB-tabs .p5c-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  tipoEscogidoB = null;
  renderizarProbB();
}

/* ════════════════════════════════════════════════
   CAP V — EXPLORACIÓN LIBRE CHI (página 14)
════════════════════════════════════════════════ */
const PROBLEMAS_CHI = [
  {
    badge: 'Situación 1',
    enunciado: 'En la UIS se quiere estudiar si existe relación entre el <strong>turno de clase preferido</strong> (Mañana / Tarde / Noche) y el <strong>rendimiento académico</strong> (Alto / Bajo). Se encuestaron <strong>90 estudiantes</strong>.',
    afirmacion: '"Los estudiantes que prefieren el turno de mañana tienden a tener mejor rendimiento académico."',
    filas: ['Mañana','Tarde','Noche'], columnas: ['Alto','Bajo'],
    totalesFila: [30, 35, 25], N: 90
  },
  {
    badge: 'Situación 2',
    enunciado: 'Se investiga si hay relación entre el <strong>tipo de alimentación</strong> (Casera / Restaurante / Cafetería UIS) y el <strong>nivel de energía auto-reportado</strong> (Alto / Medio / Bajo) en <strong>120 estudiantes</strong> de la UIS.',
    afirmacion: '"Los estudiantes que comen en casa tienen mayor nivel de energía que los que comen en restaurante o cafetería."',
    filas: ['Casera','Restaurante','Cafetería UIS'], columnas: ['Alto','Medio','Bajo'],
    totalesFila: [40, 45, 35], N: 120
  }
];

function cambiarProbChi(idx) {
  chiActual = idx;
  document.querySelectorAll('.chi-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  renderizarChi();
}

function renderizarChi() {
  const p = PROBLEMAS_CHI[chiActual];
  document.getElementById('chi-enunciado').innerHTML  = p.enunciado;
  document.getElementById('chi-afirmacion').innerHTML = p.afirmacion;
  document.getElementById('chi-badge').textContent    = p.badge;
  document.getElementById('chi-N-label').textContent  = p.N;
  document.getElementById('chi-N-display').textContent= p.N;
  document.getElementById('chi-feedback').style.display = 'none';

  const strip = document.getElementById('chi-totales-strip');
  if (strip) {
    strip.innerHTML = p.filas.map((f,i) =>
      `<div class="chi-total-item"><span class="chi-total-label">${f}</span><span class="chi-total-val">${p.totalesFila[i]} encuestados</span></div>`
    ).join('');
  }

  const { filas, columnas, totalesFila } = p;
  let html = '<table><thead><tr><th>Turno / Categoría</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total fila</th></tr></thead><tbody>';
  filas.forEach((fila, i) => {
    html += `<tr><td>${fila}</td>`;
    columnas.forEach((_, j) => {
      html += `<td><input type="number" min="0" class="cell-input chi-input" data-fila="${i}" data-col="${j}" placeholder="?" oninput="actualizarContadorChi()"></td>`;
    });
    html += `<td class="td-marg chi-total-fila" id="chi-marg-fila-${i}">${totalesFila[i]}</td></tr>`;
  });
  html += '<tr><td>Total col</td>';
  columnas.forEach((_, j) => { html += `<td class="td-marg" id="chi-marg-col-${j}">0</td>`; });
  html += `<td class="td-marg" id="chi-marg-total">${p.N}</td></tr></tbody></table>`;

  const w = document.getElementById('chi-tabla-wrapper');
  if (w) w.innerHTML = html;
  actualizarContadorChi();
}

function actualizarContadorChi() {
  const p = PROBLEMAS_CHI[chiActual];
  const inputs = document.querySelectorAll('.chi-input');
  let total = 0;
  const totalPorCol = p.columnas.map(() => 0);
  inputs.forEach(inp => {
    const val = parseInt(inp.value) || 0; total += val;
    totalPorCol[parseInt(inp.dataset.col)] += val;
  });
  p.columnas.forEach((_, j) => {
    const el = document.getElementById(`chi-marg-col-${j}`);
    if (el) el.textContent = totalPorCol[j];
  });
  const contador = document.getElementById('chi-total-contador');
  const barra    = document.getElementById('chi-progress-bar');
  if (contador) contador.textContent = total;
  if (barra) {
    const pct = Math.min(100, Math.round(total / p.N * 100));
    barra.style.width      = pct + '%';
    barra.style.background = total === p.N ? 'var(--moss)' : total > p.N ? '#dc3545' : 'var(--sky)';
  }
}

function enviarTablaChiAlTutor() {
  const p      = PROBLEMAS_CHI[chiActual];
  const inputs = document.querySelectorAll('.chi-input');
  const tabla  = p.filas.map((_, i) =>
    p.columnas.map((_, j) => parseInt(document.querySelector(`.chi-input[data-fila="${i}"][data-col="${j}"]`)?.value) || 0)
  );
  const total = tabla.flat().reduce((s,v)=>s+v,0);
  const fb    = document.getElementById('chi-feedback');
  if (total !== p.N) {
    fb.style.display='block'; fb.className='prob-feedback error';
    fb.innerHTML=`⚠️ La suma de tus celdas es <strong>${total}</strong>, pero deben ser <strong>${p.N}</strong>. Ajusta los valores.`;
    return;
  }
  fb.style.display = 'none';
  const porcentajesFila = tabla.map((fila, i) => fila.map(val => `${(val/p.totalesFila[i]*100).toFixed(1)}%`).join(' / '));
  const contexto = `[CONTEXTO AUTOMÁTICO]\nSituación: ${chiActual + 1}\nAfirmación a demostrar: ${p.afirmacion}\nEncuestados totales: ${p.N}\nColumnas: ${p.columnas.join(' / ')}\n\nFrecuencias absolutas y porcentaje por fila:\n${p.filas.map((f,i) => `  - ${f} (Total fila=${p.totalesFila[i]}): ${tabla[i].join(' / ')}  -->  [Equivale a: ${porcentajesFila[i]}]`).join('\n')}`;
  enviarContextoChi(contexto);
}

async function inicializarTutorChi() {
  setStatusGen('tutor-status-chi', 'Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, estoy en la sección de exploración libre. Quiero distribuir datos y discutir si puedo afirmar algo con certeza.', session_id: `chi_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) agregarMensajeGen('chat-chi', data.reply, 'tutor');
    setStatusGen('tutor-status-chi', 'En línea');
  } catch(e) {
    agregarMensajeGen('chat-chi', '¡Hola! Distribuye los datos en la tabla como creas que refleja la afirmación y envíamela.', 'tutor');
    setStatusGen('tutor-status-chi', 'En línea');
  }
}

async function enviarContextoChi(contexto) {
  setStatusGen('tutor-status-chi', 'Analizando…');
  const tid = agregarTypingGen('chat-chi');
  try {
    const res  = await fetch(URL_BACKEND, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: contexto, session_id: `chi_${sessionId}` }) });
    const data = await res.json();
    quitarTypingGen(tid);
    if (data.reply) agregarMensajeGen('chat-chi', data.reply, 'tutor');
    setStatusGen('tutor-status-chi', 'En línea');
  } catch(e) { quitarTypingGen(tid); setStatusGen('tutor-status-chi', 'En línea'); }
}

async function enviarMensajeChi() {
  const input = document.getElementById('input-chi');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-chi', texto, 'user');
  setStatusGen('tutor-status-chi', 'Escribiendo…');
  const tid = agregarTypingGen('chat-chi');
  try {
    const res  = await fetch(URL_BACKEND, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ message: texto, session_id: `chi_${sessionId}` }) });
    const data = await res.json();
    quitarTypingGen(tid);
    if (data.reply) agregarMensajeGen('chat-chi', data.reply, 'tutor');
    setStatusGen('tutor-status-chi', 'En línea');
  } catch(e) { quitarTypingGen(tid); setStatusGen('tutor-status-chi', 'En línea'); }
}

/* ════════════════════════════════════════════════
   PÁGINA 3 — TABLA DINÁMICA (columnas progresivas)
   Columnas aparecen al detectar institucionalización en la IA
════════════════════════════════════════════════ */

const P3_DATA = [
  { bebida: 'Café Negro',          fi: 18, hi: 0.45, Fi: 18, Hi: 0.45 },
  { bebida: 'Té / Aromática',      fi: 10, hi: 0.25, Fi: 28, Hi: 0.70 },
  { bebida: 'Jugo Natural',        fi:  8, hi: 0.20, Fi: 36, Hi: 0.90 },
  { bebida: 'Bebida Energizante',  fi:  4, hi: 0.10, Fi: 40, Hi: 1.00 },
];

// Estado de columnas visibles en página 3
let p3Columnas = { fi: true, hi: false, Fi: false, Hi: false };

// Estado de formato (decimal vs porcentaje) para columnas de proporción,
// independiente por tabla y por columna (fᵣ y Fᵣ se alternan por separado).
let formatoP3  = { hi: false, Hi: false };
let formatoEjf = { hi: false, Hi: false };
let formatoP5c = { hi: false, Hi: false };

// Formatea un valor de proporción según el modo activo (decimal 0.45 o 45%).
function formatearProporcion(valor, modoPorcentaje) {
  if (valor === undefined || valor === null || isNaN(valor)) return '—';
  return modoPorcentaje ? `${Math.round(valor * 100)}%` : valor.toFixed(2);
}

// Genera el botoncito de alternancia para un encabezado de columna.
function botonToggleFormato(onclickFn, activo) {
  return `<button class="toggle-fmt-btn${activo ? ' activo' : ''}" onclick="event.stopPropagation(); ${onclickFn}" title="Cambiar entre decimal y porcentaje">${activo ? '%' : '.00'}</button>`;
}

function renderizarP3Tabla() {
  const inner = document.getElementById('p3-tabla-inner');
  if (!inner) return;
  const { fi, hi, Fi, Hi } = p3Columnas;

  let html = '<table><thead><tr><th>Bebida</th>';
  if (fi) html += '<th>fᵢ</th>';
  if (hi) html += `<th class="col-nueva col-hi">fᵣ = fᵢ/N ${botonToggleFormato("toggleFormatoP3('hi')", formatoP3.hi)}</th>`;
  if (Fi) html += '<th class="col-nueva col-Fi">Fᵢ (acum.)</th>';
  if (Hi) html += `<th class="col-nueva col-Hi">Fᵣ (acum.) ${botonToggleFormato("toggleFormatoP3('Hi')", formatoP3.Hi)}</th>`;
  html += '</tr></thead><tbody>';

  P3_DATA.forEach(row => {
    html += `<tr><td>${row.bebida}</td>`;
    if (fi) html += `<td>${row.fi}</td>`;
    if (hi) html += `<td class="col-hi">${formatearProporcion(row.hi, formatoP3.hi)}</td>`;
    if (Fi) html += `<td class="col-Fi">${row.Fi}</td>`;
    if (Hi) html += `<td class="col-Hi">${formatearProporcion(row.Hi, formatoP3.Hi)}</td>`;
    html += '</tr>';
  });

  // Fila total
  html += '<tr class="freq-total-row"><td><strong>Total</strong></td>';
  if (fi) html += '<td><strong>40</strong></td>';
  if (hi) html += `<td class="col-hi"><strong>${formatearProporcion(1, formatoP3.hi)}</strong></td>`;
  if (Fi) html += '<td class="col-Fi"><strong>40</strong></td>';
  if (Hi) html += `<td class="col-Hi"><strong>${formatearProporcion(1, formatoP3.Hi)}</strong></td>`;
  html += '</tr></tbody></table>';

  inner.innerHTML = html;

  // Actualizar badges de progreso
  _p3ActualizarBadges();
}

function toggleFormatoP3(col) {
  formatoP3[col] = !formatoP3[col];
  renderizarP3Tabla();
}

function _p3ActualizarBadges() {
  const badgeHi = document.getElementById('p3-badge-hi');
  const badgeFi = document.getElementById('p3-badge-Fi');
  const badgeHi2= document.getElementById('p3-badge-Hi');
  if (badgeHi)  badgeHi.classList.toggle('active',  p3Columnas.hi);
  if (badgeFi)  badgeFi.classList.toggle('active',  p3Columnas.Fi);
  if (badgeHi2) badgeHi2.classList.toggle('active', p3Columnas.Hi);

  // Actualizar etiqueta
  const label = document.getElementById('p3-tabla-label');
  if (!label) return;
  const cols = [];
  if (p3Columnas.fi) cols.push('fᵢ');
  if (p3Columnas.hi) cols.push('fᵣ');
  if (p3Columnas.Fi) cols.push('Fᵢ');
  if (p3Columnas.Hi) cols.push('Fᵣ');
  label.textContent = `Distribución de la variable Bebida Favorita al momento de estudiar — ${cols.join(', ')} (N = 40)`;
}

// Detectar institucionalización en respuestas del tutor de página 3
function detectarInstitucionalizacionP3(texto) {
  // fᵣ: frecuencia relativa institucionalizada
  if (!p3Columnas.hi && (
    texto.includes('frecuencia relativa') ||
    texto.includes('fᵣ') || texto.includes('h_i') ||
    texto.includes('dividir entre N') || texto.includes('dividir entre el total')
  )) {
    p3Columnas.hi = true;
    setTimeout(renderizarP3Tabla, 300);
    _p3MostrarNotificacion('fᵣ — Frecuencia Relativa');
  }
  // Fᵢ: absoluta acumulada
  if (!p3Columnas.Fi && (
    texto.includes('absoluta acumulada') || texto.includes('Fᵢ') || texto.includes('F_i') ||
    texto.includes('acumulando') || texto.includes('suma progresiva')
  )) {
    p3Columnas.Fi = true;
    setTimeout(renderizarP3Tabla, 600);
    _p3MostrarNotificacion('Fᵢ — Frecuencia Absoluta Acumulada');
  }
  // Fᵣ: relativa acumulada
  if (!p3Columnas.Hi && (
    texto.includes('relativa acumulada') || texto.includes('Fᵣ') || texto.includes('H_i') ||
    texto.includes('proporción acumulada') || texto.includes('fracción acumulada')
  )) {
    p3Columnas.Hi = true;
    setTimeout(renderizarP3Tabla, 900);
    _p3MostrarNotificacion('Fᵣ — Frecuencia Relativa Acumulada');
  }
}

function _p3MostrarNotificacion(nombre) {
  const wrapper = document.getElementById('p3-tabla-wrapper');
  if (!wrapper) return;
  const notif = document.createElement('div');
  notif.style.cssText = 'background:var(--moss);color:white;font-size:.75rem;padding:5px 12px;border-radius:3px;margin-bottom:6px;animation:colEntra .4s ease;font-family:Inter,sans-serif;';
  notif.textContent = `✨ Nueva columna añadida: ${nombre}`;
  wrapper.insertBefore(notif, wrapper.firstChild);
  setTimeout(() => notif.remove(), 3500);
}

/* ════════════════════════════════════════════════
   PÁGINA 5b — EJEMPLOS DINÁMICOS TABLAS DE FRECUENCIA
════════════════════════════════════════════════ */

const EJF_DATA = [
  { bebida: 'Café Negro',         fi: 18, hi: 0.45, Fi: 18, Hi: 0.45 },
  { bebida: 'Té / Aromática',     fi: 10, hi: 0.25, Fi: 28, Hi: 0.70 },
  { bebida: 'Jugo Natural',       fi:  8, hi: 0.20, Fi: 36, Hi: 0.90 },
  { bebida: 'Bebida Energizante', fi:  4, hi: 0.10, Fi: 40, Hi: 1.00 },
];

// Variable cuantitativa: horas diarias de conexión a internet, 50 estudiantes UIS (datos agrupados)
const EJF_DATA_CUANT = [
  { bebida: '[0 - 2)',  marca: 1, fi: 6,  hi: 0.12, Fi: 6,  Hi: 0.12 },
  { bebida: '[2 - 4)',  marca: 3, fi: 14, hi: 0.28, Fi: 20, Hi: 0.40 },
  { bebida: '[4 - 6)',  marca: 5, fi: 18, hi: 0.36, Fi: 38, Hi: 0.76 },
  { bebida: '[6 - 8)',  marca: 7, fi: 9,  hi: 0.18, Fi: 47, Hi: 0.94 },
  { bebida: '[8 - 10]', marca: 9, fi: 3,  hi: 0.06, Fi: 50, Hi: 1.00 },
];

const EJF_PREGUNTAS_CUALI = [
  {
    texto: 'Usa la Vista personalizada y muestra solo <strong>fᵢ</strong> filtrando únicamente Café y Té. ¿Qué porcentaje del total de encuestados representan esas dos bebidas juntas? Calcúlalo tú mismo con la tabla.',
    modelo: 'Café: fᵢ=18, Té: fᵢ=10. Juntas suman 28 de 40 encuestados → fᵣ = 28/40 = 0.70 (70%). Compara este cálculo con el tuyo: ¿coincide el 70%?',
  },
  {
    texto: 'Activa solo las columnas <strong>fᵣ</strong> y <strong>Fᵣ</strong>. ¿En qué categoría se supera el 50% acumulado? ¿Qué significa eso sobre las preferencias del grupo?',
    modelo: 'Orden de la tabla: Café(0.45) → Té(0.70 acumulado) → Jugo(0.90) → Energizante(1.00). El 50% se supera en la 2ª categoría (Té), ya que Fᵣ pasa de 0.45 a 0.70. Esto significa que más de la mitad del grupo prefiere Café o Té.',
  },
];

const EJF_PREGUNTAS_CUANT = [
  {
    texto: 'Usa la Vista personalizada y filtra solo los intervalos donde la conexión diaria supera las 4 horas. ¿Qué porcentaje del total de estudiantes representa ese grupo? Súmalo con los datos filtrados.',
    modelo: 'Intervalos [4-6), [6-8) y [8-10]: fᵢ = 18+9+3 = 30 de 50 estudiantes → fᵣ = 30/50 = 0.60 (60%). Compara este cálculo con el tuyo.',
  },
  {
    texto: 'Activa únicamente <strong>fᵣ</strong> y <strong>Fᵣ</strong>. ¿En qué intervalo se acumula el 50% de los estudiantes? ¿Qué te dice eso sobre el uso típico de internet en este grupo?',
    modelo: 'Fᵣ acumulada: [0-2)=0.12 → [2-4)=0.40 → [4-6)=0.76. El 50% se supera en el intervalo [4-6), ya que Fᵣ pasa de 0.40 a 0.76. Esto indica que el uso "típico" (la mitad del grupo) está entre 4 y 6 horas diarias.',
  },
];

let ejfVariableActual= 'cualitativa';// 'cualitativa' | 'cuantitativa'
let ejfChart         = null;

function inicializarEjemplosDinamicos() {
  // Inicializar checkboxes de categorías
  const catBox = document.getElementById('ejf-cat-checks');
  if (catBox && !catBox.dataset.init) {
    catBox.dataset.init = '1';
    catBox.innerHTML = EJF_DATA.map((r, i) =>
      `<label class="ejf-check"><input type="checkbox" class="ejf-cat-chk" data-idx="${i}" checked onchange="ejfActualizarVista()"><span>${r.bebida}</span></label>`
    ).join('');
  }
  // Preguntas de reflexión (estado inicial: cualitativa)
  EJF_PREGUNTAS_CUALI.forEach((p, i) => {
    const el = document.getElementById(`ejf-preg-${i+1}`);
    if (el) el.innerHTML = p.texto;
  });
  ejfActualizarVista();
}

function ejfCambiarVariable(variable) {
  ejfVariableActual = variable;
  document.getElementById('ejf-var-cual').classList.toggle('active', variable === 'cualitativa');
  document.getElementById('ejf-var-cuant').classList.toggle('active', variable === 'cuantitativa');

  // Reconstruir checkboxes de categorías/intervalos para el nuevo dataset
  const catBox = document.getElementById('ejf-cat-checks');
  const data = variable === 'cualitativa' ? EJF_DATA : EJF_DATA_CUANT;
  if (catBox) {
    catBox.innerHTML = data.map((r, i) =>
      `<label class="ejf-check"><input type="checkbox" class="ejf-cat-chk" data-idx="${i}" checked onchange="ejfActualizarVista()"><span>${r.bebida}</span></label>`
    ).join('');
  }

  // Actualizar preguntas de reflexión y resetear respuestas/feedback previos
  const preguntas = variable === 'cualitativa' ? EJF_PREGUNTAS_CUALI : EJF_PREGUNTAS_CUANT;
  preguntas.forEach((p, i) => {
    const el = document.getElementById(`ejf-preg-${i+1}`);
    if (el) el.innerHTML = p.texto;
    const resp = document.getElementById(`ejf-resp-${i+1}`);
    if (resp) resp.value = '';
    const fb = document.getElementById(`ejf-verif-fb-${i+1}`);
    if (fb) { fb.style.display = 'none'; fb.innerHTML = ''; }
  });

  ejfActualizarVista();
}

// Verificación de las preguntas de reflexión: revela la consecuencia matemática
// esperada para que el estudiante compare con su propio razonamiento (no un veredicto).
function ejfVerificarPregunta(n) {
  const preguntas = ejfVariableActual === 'cualitativa' ? EJF_PREGUNTAS_CUALI : EJF_PREGUNTAS_CUANT;
  const p = preguntas[n - 1];
  const resp = document.getElementById(`ejf-resp-${n}`);
  const fb = document.getElementById(`ejf-verif-fb-${n}`);
  if (!p || !fb) return;
  if (!resp || !resp.value.trim()) {
    fb.style.display = 'block';
    fb.className = 'ejf-verif-fb ejf-verif-fb-warn';
    fb.innerHTML = 'Escribe tu respuesta antes de verificar, así puedes comparar tu propio razonamiento con el esperado.';
    return;
  }
  fb.style.display = 'block';
  fb.className = 'ejf-verif-fb ejf-verif-fb-ok';
  fb.innerHTML = `<strong>Así se resuelve:</strong> ${p.modelo}<br><em>Compara este razonamiento con el tuyo — ¿coincide la idea central, aunque lo hayas explicado con otras palabras?</em>`;
}

// Determina automáticamente qué gráfico corresponde según las columnas activas.
// Familia "distribución" (fᵢ/fᵣ) y familia "acumulada" (Fᵢ/Fᵣ) representan preguntas
// estadísticas distintas — si se mezclan, no hay un único gráfico que las represente bien.
function _ejfDetectarGrafico(cols) {
  const dist = cols.fi || cols.hi;   // familia distribución
  const acum = cols.Fi || cols.Hi;   // familia acumulada
  if (!cols.fi && !cols.hi && !cols.Fi && !cols.Hi) {
    return { tipo: null, motivo: 'Selecciona al menos una columna para generar el gráfico.' };
  }
  if (dist && acum) {
    return { tipo: null, motivo: 'No hay un único gráfico que represente bien esta combinación: fᵢ/fᵣ muestran la distribución por categoría, mientras que Fᵢ/Fᵣ muestran la acumulación — son preguntas estadísticas distintas. Elige columnas de una sola familia (solo distribución, o solo acumulada) para ver el gráfico automático.' };
  }
  if (dist) {
    if (cols.hi && !cols.fi) return { tipo: 'pie', motivo: null };
    return { tipo: 'barras', motivo: null }; // fi solo, o fi+hi juntas (proporcionales)
  }
  // familia acumulada: histograma (barras contiguas) tiene sentido con intervalos (cuantitativa).
  // Para cualitativa no hay intervalos, así que no se puede graficar de forma estándar.
  if (ejfVariableActual === 'cuantitativa') {
    return { tipo: 'histAcum', motivo: null, usaHi: cols.Hi && !cols.Fi };
  }
  return { tipo: null, motivo: 'Las frecuencias acumuladas se grafican habitualmente con un histograma, que necesita intervalos (datos agrupados). Como "Bebida favorita" es una variable categórica sin intervalos, este gráfico no está disponible aquí — puedes leer los valores acumulados directamente en la tabla, o cambiar a la variable cuantitativa para verlo graficado.' };
}

function ejfRenderTabsGrafico() {
  // El tipo de gráfico ahora se detecta automáticamente según las columnas activas;
  // este contenedor solo muestra una etiqueta informativa, no botones.
  const tabs = document.getElementById('ejf-grafico-tabs');
  if (!tabs) return;
  const cols = _ejfGetColumnas();
  const det = _ejfDetectarGrafico(cols);
  const nombres = { barras: 'Barras', pie: 'Circular', histAcum: 'Histograma (acumuladas)' };
  tabs.innerHTML = det.tipo
    ? `<div class="ejf-auto-label">📊 Gráfico automático: <strong>${nombres[det.tipo]}</strong></div>`
    : `<div class="ejf-auto-label ejf-auto-label-muted">📊 Sin gráfico disponible con esta selección</div>`;
}

function _ejfGetColumnas() {
  return {
    fi: document.getElementById('ejf-chk-fi')?.checked ?? false,
    hi: document.getElementById('ejf-chk-hi')?.checked ?? false,
    Fi: document.getElementById('ejf-chk-Fi')?.checked ?? false,
    Hi: document.getElementById('ejf-chk-Hi')?.checked ?? false,
  };
}

function _ejfGetFilas() {
  const data = ejfVariableActual === 'cualitativa' ? EJF_DATA : EJF_DATA_CUANT;
  return data.filter((_, i) => {
    const chk = document.querySelector(`.ejf-cat-chk[data-idx="${i}"]`);
    return chk ? chk.checked : true;
  });
}

function ejfActualizarVista() {
  ejfRenderizarTabla();
  ejfRenderTabsGrafico();
  ejfRenderizarGrafico();
}

function ejfRenderizarTabla() {
  const cols = _ejfGetColumnas();
  const filas = _ejfGetFilas();
  const wrapper = document.getElementById('ejf-tabla-wrapper');
  const titleEl = document.getElementById('ejf-tabla-title');
  if (!wrapper) return;

  const esCuant = ejfVariableActual === 'cuantitativa';
  const colEtiqueta = esCuant ? 'Intervalo (h/día)' : 'Bebida';

  // Titulo
  const colNames = [];
  if (cols.fi) colNames.push('fᵢ');
  if (cols.hi) colNames.push('fᵣ');
  if (cols.Fi) colNames.push('Fᵢ');
  if (cols.Hi) colNames.push('Fᵣ');
  if (titleEl) titleEl.textContent = colNames.length
    ? `${colNames.join(', ')} — ${filas.length} categoría(s)`
    : `Tabla — ${filas.length} categoría(s)`;

  let html = `<table><thead><tr><th>${colEtiqueta}</th>`;
  if (cols.fi) html += '<th>fᵢ</th>';
  if (cols.hi) html += `<th class="ejf-th-hi">fᵣ ${botonToggleFormato("toggleFormatoEjf('hi')", formatoEjf.hi)}</th>`;
  if (cols.Fi) html += '<th class="ejf-th-Fi">Fᵢ</th>';
  if (cols.Hi) html += `<th class="ejf-th-Hi">Fᵣ ${botonToggleFormato("toggleFormatoEjf('Hi')", formatoEjf.Hi)}</th>`;
  html += '</tr></thead><tbody>';

  filas.forEach(row => {
    html += `<tr><td>${row.bebida}</td>`;
    if (cols.fi) html += `<td>${row.fi}</td>`;
    if (cols.hi) html += `<td class="ejf-td-hi">${formatearProporcion(row.hi, formatoEjf.hi)}</td>`;
    if (cols.Fi) html += `<td class="ejf-td-Fi">${row.Fi}</td>`;
    if (cols.Hi) html += `<td class="ejf-td-Hi">${formatearProporcion(row.Hi, formatoEjf.Hi)}</td>`;
    html += '</tr>';
  });

  // Totales
  const totFi = filas.reduce((s, r) => s + r.fi, 0);
  const totHi = filas.reduce((s, r) => s + r.hi, 0);
  html += '<tr class="ejf-total-row"><td><strong>Total</strong></td>';
  if (cols.fi) html += `<td><strong>${totFi}</strong></td>`;
  if (cols.hi) html += `<td class="ejf-td-hi"><strong>${formatearProporcion(totHi, formatoEjf.hi)}</strong></td>`;
  if (cols.Fi) html += `<td class="ejf-td-Fi"><strong>${filas[filas.length-1]?.Fi ?? '—'}</strong></td>`;
  if (cols.Hi) html += `<td class="ejf-td-Hi"><strong>${filas.length ? formatearProporcion(filas[filas.length-1]?.Hi, formatoEjf.Hi) : '—'}</strong></td>`;
  html += '</tr></tbody></table>';

  wrapper.style.opacity = '0';
  setTimeout(() => {
    wrapper.innerHTML  = html;
    wrapper.style.opacity = '1';
    wrapper.style.transition = 'opacity .2s ease';
  }, 100);

  if (colNames.length === 0) {
    const info = document.getElementById('ejf-info-text');
    if (info) info.textContent = '⚠️ Selecciona al menos una columna para mostrar.';
  }
}

function toggleFormatoEjf(col) {
  formatoEjf[col] = !formatoEjf[col];
  ejfRenderizarTabla();
}

function ejfRenderizarGrafico() {
  const canvas   = document.getElementById('ejf-canvas');
  const wrapCanv = document.getElementById('ejf-grafico-canvas-wrap');
  const vacio    = document.getElementById('ejf-grafico-vacio');
  if (!canvas) return;
  if (ejfChart) { ejfChart.destroy(); ejfChart = null; }

  const filas = _ejfGetFilas();
  const labels = filas.map(r => r.bebida);
  const cols = _ejfGetColumnas();
  const det = _ejfDetectarGrafico(cols);
  const esCuant = ejfVariableActual === 'cuantitativa';
  const info = document.getElementById('ejf-info-text');

  // Caso sin gráfico definido: explicar por qué, ocultar canvas
  if (!det.tipo) {
    if (wrapCanv) wrapCanv.style.display = 'none';
    if (vacio) { vacio.style.display = 'block'; vacio.innerHTML = `<strong>Sin gráfico automático</strong><br>${det.motivo}`; }
    if (info) info.textContent = det.motivo;
    return;
  }
  if (wrapCanv) wrapCanv.style.display = 'block';
  if (vacio) vacio.style.display = 'none';

  const ctx = canvas.getContext('2d');
  const COLORES = ['rgba(26,58,90,.85)','rgba(46,107,79,.85)','rgba(200,168,75,.85)','rgba(91,141,184,.85)','rgba(122,74,110,.85)'];
  let config;

  if (det.tipo === 'barras') {
    // Distribución (fᵢ, o fᵢ+fᵣ juntas — son proporcionales). Para variable cuantitativa
    // agrupada, las barras van contiguas porque representan un rango continuo.
    config = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Frecuencia absoluta (fᵢ)',
          data: filas.map(r => r.fi),
          backgroundColor: esCuant ? 'rgba(26,58,90,.8)' : filas.map((_,i) => COLORES[i % COLORES.length]),
          borderColor: esCuant ? 'rgba(26,58,90,1)' : undefined,
          borderWidth: esCuant ? 1 : 0,
          borderRadius: esCuant ? 0 : 4,
          barPercentage: esCuant ? 1.0 : 0.85,
          categoryPercentage: esCuant ? 1.0 : 0.85,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: esCuant ? 'Histograma de Frecuencia Absoluta' : 'Frecuencia Absoluta por Bebida', font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'JetBrains Mono', size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    };
    if (info) info.textContent = cols.fi && cols.hi
      ? 'Barras: fᵢ y fᵣ comparten exactamente la misma forma (fᵣ = fᵢ/N), así que un solo gráfico de barras representa ambas.'
      : (esCuant ? 'Histograma: barras contiguas porque los intervalos representan un rango continuo, no categorías separadas.' : 'Diagrama de barras: visualiza las frecuencias absolutas (fᵢ) de cada categoría.');

  } else if (det.tipo === 'pie') {
    config = {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          label: 'fᵣ',
          data: filas.map(r => r.hi),
          backgroundColor: filas.map((_,i) => COLORES[i % COLORES.length]),
          borderWidth: 2, borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 10 }, boxWidth: 12 } },
          title: { display: true, text: esCuant ? 'Frecuencia Relativa (fᵣ) — Circular' : 'Frecuencia Relativa (fᵣ) — Pastel', font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
        },
        animation: { duration: 500 }
      }
    };
    if (info) info.textContent = 'Gráfico circular: muestra la proporción relativa (fᵣ) de cada categoría respecto al total.';

  } else if (det.tipo === 'histAcum') {
    // Acumulada (Fᵢ y/o Fᵣ, son proporcionales entre sí): histograma de barras contiguas,
    // solo disponible para variable cuantitativa porque necesita intervalos.
    const usaHi = det.usaHi;
    const valores = filas.map(r => usaHi ? r.Hi : r.Fi);
    config = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: usaHi ? 'Fᵣ (relativa acumulada)' : 'Fᵢ (absoluta acumulada)',
          data: valores,
          backgroundColor: 'rgba(200,168,75,.8)',
          borderColor: 'rgba(200,168,75,1)',
          borderWidth: 1,
          barPercentage: 1.0,
          categoryPercentage: 1.0,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: `Histograma — ${usaHi ? 'Frecuencia Relativa' : 'Frecuencia Absoluta'} Acumulada`, font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
        },
        scales: {
          y: { beginAtZero: true, max: usaHi ? 1 : undefined, ticks: { font: { family: 'JetBrains Mono', size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    };
    if (info) info.textContent = cols.Fi && cols.Hi
      ? 'Histograma: Fᵢ y Fᵣ comparten la misma forma acumulada (Fᵣ = Fᵢ/N), así que un solo gráfico representa ambas.'
      : 'Histograma acumulado: cada barra muestra cuánto se ha acumulado hasta ese intervalo. Las barras van contiguas porque representan un rango continuo.';
  }

  ejfChart = new Chart(ctx, config);
}

/* ════════════════════════════════
   INIT — DOMContentLoaded
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(ocultarLoading, 800);
  setTimeout(calcPosicionarBoton, 100);

  const repDot = document.getElementById('rep-dot');
  if (repDot) repDot.className = 'rep-dot is-tabla';

  // Inicializar tabla dinámica página 3
  renderizarP3Tabla();

  // Recuperar historiales de sesiones previas.
  // Si YA existe conversación guardada en el backend, se marca la bandera "ya
  // inicié" correspondiente — así la página no dispara de nuevo su saludo
  // automático al recargar (eso era lo que causaba la sensación de "reinicio").
  cargarHistorial(sessionId,             'chat-box').then(h => { if (h) chatCap2Iniciado = true; });
  cargarHistorial(`cap3_${sessionId}`,   'chat-box2');
  cargarHistorial(`cap3b_${sessionId}`,  'chat-cap3b').then(h => { if (h) chatCap3PuenteIniciado = true; });
  cargarHistorial(`freq_unif_${sessionId}`, 'chat-freq-unif').then(h => { if (h) chatFreqUnifIniciado = true; });
  cargarHistorial(`chi_${sessionId}`,        'chat-chi').then(h => { if (h) chatChiIniciado = true; });
  cargarHistorial(`p25_${sessionId}`,        'chat-p25');
  cargarHistorial(`chi3_p15_${sessionId}`,   'chat-chi3-p15');
  cargarHistorial(`chi3_p16_${sessionId}`,   'chat-chi3-p16');
  cargarHistorial(`chi3_p17_${sessionId}`,   'chat-chi3-p17');
  cargarHistorial(`chi3_p18_${sessionId}`,   'chat-chi3-p18');
  cargarHistorial(`chi3_p19_${sessionId}`,   'chat-chi3-p19');
  cargarHistorial(`chi3_p20_${sessionId}`,   'chat-chi3-p20');
  cargarHistorial(`chi3_p21_${sessionId}`,   'chat-chi3-p21');
  cargarHistorial(`chi3_p22_${sessionId}`,   'chat-chi3-p22');
  cargarHistorial(`chi3_p23_${sessionId}`,   'chat-chi3-p23');
  cargarHistorial(`chi3_p24_${sessionId}`,   'chat-chi3-p24');

  // Renderizar tablas y gráficos estáticos
  renderizarFPTabla('absoluta');
  renderizarFPRefTable();
  renderizarEjTabla('absoluta');
  renderizarEjGrafico('absoluta');
  renderizarChi();
});

/* ════════════════════════════════════════════════════════════
   PÁGINA 5c — COMPLETAR TABLA DE FRECUENCIAS
   3 problemas con celdas vacías aleatorias + validación
════════════════════════════════════════════════════════════ */

let p5cProblemaActual = 0;
// Guarda el estado (valores ingresados + feedback) de cada problema por separado,
// para que no se pierda al cambiar de pestaña.
let p5cEstadoPorProblema = {};

const P5C_PROBLEMAS = [
  {
    titulo: 'Problema 1',
    enunciado: 'En una encuesta a 50 estudiantes de bachillerato de Bucaramanga se les preguntó cuál es su materia favorita. Los resultados fueron: Matemáticas (18), Inglés (12), Ciencias (10), Historia (6), Educación Física (4). Completa la tabla de frecuencias.',
    N: 50,
    filas: [
      { cat: 'Matemáticas',       fi: 18 },
      { cat: 'Inglés',            fi: 12 },
      { cat: 'Ciencias',          fi: 10 },
      { cat: 'Historia',          fi: 6  },
      { cat: 'Educación Física',  fi: 4  },
    ],
    pista: 'Recuerda: fᵣ = fᵢ / N. Con N = 50, la primera fila da fᵣ = 18/50 = 0.36.',
  },
  {
    titulo: 'Problema 2',
    enunciado: 'Se registró el medio de transporte que usan 80 jóvenes de la UIS para llegar a la universidad: A pie (30), Bus (25), Bicicleta (15), Moto (7), Carro particular (3). Completa la tabla de frecuencias completa.',
    N: 80,
    filas: [
      { cat: 'A pie',              fi: 30 },
      { cat: 'Bus',                fi: 25 },
      { cat: 'Bicicleta',          fi: 15 },
      { cat: 'Moto',               fi: 7  },
      { cat: 'Carro particular',   fi: 3  },
    ],
    pista: 'Fᵢ se acumula fila a fila: F₁ = f₁, F₂ = F₁ + f₂, y así sucesivamente.',
  },
  {
    titulo: 'Problema 3',
    enunciado: 'Una biblioteca universitaria registró el género literario preferido de 60 lectores: Novela (22), Ciencia Ficción (14), Historia (12), Poesía (7), Cómic (5). Completa la tabla de frecuencias.',
    N: 60,
    filas: [
      { cat: 'Novela',           fi: 22 },
      { cat: 'Ciencia Ficción',  fi: 14 },
      { cat: 'Historia',         fi: 12 },
      { cat: 'Poesía',           fi: 7  },
      { cat: 'Cómic',            fi: 5  },
    ],
    pista: 'Fᵣ = Fᵢ / N. La última fila siempre tendrá Fᵣ = 1.00 y Fᵢ = N.',
  },
  {
    titulo: 'Problema 4',
    enunciado: 'Se cronometró el tiempo (en minutos) que tardaron 60 estudiantes en resolver un examen de estadística. Los datos, agrupados en intervalos, fueron: [30-40) → 6 estudiantes, [40-50) → 18, [50-60) → 20, [60-70) → 12, [70-80] → 4. A diferencia de los problemas anteriores, aquí la variable es cuantitativa: cada fila representa un intervalo de tiempo, no una categoría. Completa la tabla de frecuencias.',
    N: 60,
    filas: [
      { cat: '[30-40)', fi: 6  },
      { cat: '[40-50)', fi: 18 },
      { cat: '[50-60)', fi: 20 },
      { cat: '[60-70)', fi: 12 },
      { cat: '[70-80]', fi: 4  },
    ],
    pista: 'Igual que con variables cualitativas: fᵣ = fᵢ / N y Fᵢ se acumula fila a fila. La diferencia es que aquí el orden de las filas NO es arbitrario — los intervalos van de menor a mayor tiempo.',
  },
];

// Celdas que se ocultan en cada problema (índices: fila,col donde col: 0=fi,1=hi,2=Fi,3=Hi)
const P5C_VACIAS = [
  [[0,1],[1,1],[2,2],[3,2],[4,3],[1,3],[3,1],[0,2]],
  [[0,1],[1,2],[2,1],[3,3],[4,2],[0,3],[2,3],[1,1]],
  [[1,1],[0,3],[2,2],[3,1],[4,3],[0,2],[3,3],[2,1]],
  [[0,1],[1,1],[2,3],[3,2],[4,1],[0,2],[2,1],[3,3]],
];

function p5cValoresCorrectos(prob) {
  const rows = [];
  let acumF = 0;
  prob.filas.forEach(f => {
    acumF += f.fi;
    rows.push({
      fi: f.fi,
      hi: parseFloat((f.fi / prob.N).toFixed(4)),
      Fi: acumF,
      Hi: parseFloat((acumF / prob.N).toFixed(4)),
    });
  });
  return rows;
}

function toggleFormatoP5c(col) {
  formatoP5c[col] = !formatoP5c[col];
  p5cCargarProblema(p5cProblemaActual);
}

function p5cCargarProblema(idx) {
  p5cProblemaActual = idx;
  // Actualizar tabs
  document.querySelectorAll('#p5c-tabs .p5c-tab').forEach((t,i) => {
    t.classList.toggle('active', i === idx);
  });
  const prob    = P5C_PROBLEMAS[idx];
  const valores = p5cValoresCorrectos(prob);
  const vacias  = new Set(P5C_VACIAS[idx].map(([r,c]) => `${r}-${c}`));

  document.getElementById('p5c-badge').textContent     = prob.titulo;
  document.getElementById('p5c-enunciado').textContent = prob.enunciado;
  document.getElementById('p5c-hint-text').textContent = prob.pista;
  const fb = document.getElementById('p5c-feedback');
  fb.style.display = 'none'; fb.className = 'prob-feedback';

  // Construir tabla
  const wrap = document.getElementById('p5c-tabla-wrap');
  const cols = ['fᵢ','fᵣ','Fᵢ','Fᵣ'];
  const keys = ['fi','hi','Fi','Hi'];
  const colEtiqueta = idx === 3 ? 'Intervalo (min)' : 'Categoría';
  let html = `<table class="p5c-tabla"><thead><tr>
    <th>${colEtiqueta}</th>
    <th>${cols[0]}</th>
    <th>${cols[1]} ${botonToggleFormato("toggleFormatoP5c('hi')", formatoP5c.hi)}</th>
    <th>${cols[2]}</th>
    <th>${cols[3]} ${botonToggleFormato("toggleFormatoP5c('Hi')", formatoP5c.Hi)}</th>
  </tr></thead><tbody>`;

  prob.filas.forEach((f, r) => {
    html += `<tr><td class="p5c-cat">${f.cat}</td>`;
    keys.forEach((k, c) => {
      const key = `${r}-${c}`;
      if (vacias.has(key)) {
        html += `<td><input type="number" step="0.0001" class="p5c-cell" id="p5c-${r}-${c}"
                   data-correct="${valores[r][k]}" data-row="${r}" data-col="${c}"
                   placeholder="?" oninput="p5cActualizarProgreso()"></td>`;
      } else {
        const modo = k === 'hi' ? formatoP5c.hi : k === 'Hi' ? formatoP5c.Hi : null;
        const val = (k === 'hi' || k === 'Hi') ? formatearProporcion(valores[r][k], modo) : valores[r][k];
        html += `<td class="p5c-given">${val}</td>`;
      }
    });
    html += '</tr>';
  });

  // Fila total
  html += `<tr class="p5c-total-row">
    <td><strong>Total</strong></td>
    <td class="p5c-given"><strong>${prob.N}</strong></td>
    <td class="p5c-given"><strong>${formatearProporcion(1, formatoP5c.hi)}</strong></td>
    <td class="p5c-given"><strong>${prob.N}</strong></td>
    <td class="p5c-given"><strong>${formatearProporcion(1, formatoP5c.Hi)}</strong></td>
  </tr></tbody></table>`;

  wrap.innerHTML = html;

  // Restaurar valores guardados de una visita anterior a este problema (si existen)
  const estadoGuardado = p5cEstadoPorProblema[idx];
  if (estadoGuardado && estadoGuardado.valores) {
    Object.entries(estadoGuardado.valores).forEach(([key, val]) => {
      if (val === '') return;
      const inp = document.getElementById(`p5c-${key}`);
      if (inp) inp.value = val;
    });
  }

  // Restaurar colores y mensaje SOLO si ya hubo una verificación explícita previa
  // (el coloreo nunca se aplica automáticamente por escribir, solo por pulsar "Verificar").
  if (estadoGuardado && estadoGuardado.feedback) {
    document.querySelectorAll('#p5c-tabla-wrap .p5c-cell').forEach(inp => {
      if (inp.value === '') return;
      const v = parseFloat(inp.value);
      const c = parseFloat(inp.dataset.correct);
      if (Math.abs(v - c) < 0.011) inp.classList.add('p5c-ok');
      else inp.classList.add('p5c-err');
    });
    fb.style.display = 'block';
    fb.className = estadoGuardado.feedback.clase;
    fb.textContent = estadoGuardado.feedback.texto;
  }

  p5cActualizarProgreso();
}

function p5cActualizarProgreso() {
  // Durante la escritura NO se evalúa correctitud ni se colorea — eso solo ocurre al
  // pulsar "Verificar". Aquí solo se cuenta cuántas celdas están completadas y se
  // guarda el valor actual para que persista al cambiar de problema.
  const inputs = document.querySelectorAll('#p5c-tabla-wrap .p5c-cell');
  let llenas = 0;
  const estado = {};
  inputs.forEach(inp => {
    if (inp.value !== '') llenas++;
    estado[`${inp.dataset.row}-${inp.dataset.col}`] = inp.value;
  });
  if (!p5cEstadoPorProblema[p5cProblemaActual]) p5cEstadoPorProblema[p5cProblemaActual] = {};
  p5cEstadoPorProblema[p5cProblemaActual].valores = estado;

  const total = inputs.length;
  const bar   = document.getElementById('p5c-progress-bar');
  const lbl   = document.getElementById('p5c-progress-label');
  if (bar) bar.style.width = total ? `${(llenas/total)*100}%` : '0%';
  if (lbl) lbl.textContent = `${llenas} / ${total} celdas completadas`;
}

function p5cVerificar() {
  const inputs  = document.querySelectorAll('#p5c-tabla-wrap .p5c-cell');
  let correctas = 0, vacias = 0, incorrectas = 0;
  const estado = {};
  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    const c = parseFloat(inp.dataset.correct);
    estado[`${inp.dataset.row}-${inp.dataset.col}`] = inp.value;
    if (inp.value === '') { vacias++; return; }
    if (Math.abs(v - c) < 0.011) { correctas++; inp.classList.add('p5c-ok'); inp.classList.remove('p5c-err'); }
    else { incorrectas++; inp.classList.add('p5c-err'); inp.classList.remove('p5c-ok'); }
  });
  const fb = document.getElementById('p5c-feedback');
  fb.style.display = 'block';
  let claseFb, textoFb;
  if (vacias > 0) {
    claseFb = 'prob-feedback parcial';
    textoFb = `Hay ${vacias} celda(s) sin completar. Revisa la tabla e intenta de nuevo.`;
  } else if (incorrectas > 0) {
    claseFb = 'prob-feedback error';
    textoFb = `${incorrectas} celda(s) incorrecta(s) (marcadas en rojo). Revisa las fórmulas y vuelve a intentarlo.`;
  } else {
    claseFb = 'prob-feedback ok';
    textoFb = `✅ ¡Perfecto! Todas las celdas son correctas. La tabla está completa.`;
  }
  fb.className = claseFb;
  fb.textContent = textoFb;
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Guardar valores y resultado de la verificación para restaurarlos si el estudiante vuelve a este problema
  if (!p5cEstadoPorProblema[p5cProblemaActual]) p5cEstadoPorProblema[p5cProblemaActual] = {};
  p5cEstadoPorProblema[p5cProblemaActual].valores  = estado;
  p5cEstadoPorProblema[p5cProblemaActual].feedback = { clase: claseFb, texto: textoFb };
}

function p5cReset() {
  document.querySelectorAll('#p5c-tabla-wrap .p5c-cell').forEach(inp => {
    inp.value = '';
    inp.classList.remove('p5c-ok','p5c-err');
  });
  const fb = document.getElementById('p5c-feedback');
  fb.style.display = 'none';
  delete p5cEstadoPorProblema[p5cProblemaActual];
  p5cActualizarProgreso();
}

/* ════════════════════════════════════════════════════════════
   PÁGINA 5d — PROBLEMA LIBRE: EL ESTUDIANTE CONSTRUYE SU TABLA
   El estudiante elige el orden de las filas y llena los datos.
   3 preguntas de análisis que exigen interpretar fᵣ, Fᵢ y Fᵣ.
════════════════════════════════════════════════════════════ */

let p5dSituacionActual = 0;

const P5D_SITUACIONES = [
  {
    titulo: 'Situación 1',
    badge: 'Situación 1',
    enunciado: 'En una tienda escolar se vendieron 120 refrigerios durante una semana. Las categorías disponibles son: Jugo de fruta, Sándwich, Frutas frescas, Empanada, Yogur. Los datos de ventas son: Jugo de fruta (38), Sándwich (30), Frutas frescas (22), Empanada (18), Yogur (12).',
    N: 120,
    categorias: [
      { cat: 'Jugo de fruta',   fi: 38 },
      { cat: 'Sándwich',        fi: 30 },
      { cat: 'Frutas frescas',  fi: 22 },
      { cat: 'Empanada',        fi: 18 },
      { cat: 'Yogur',           fi: 12 },
    ],
    preguntas: [
      {
        id: 'p5d-q1',
        tipo: 'hi',
        texto: '¿Qué proporción del total de refrigerios representa la combinación de Sándwich y Yogur juntos? Explica por qué esta frecuencia relativa combinada es útil para el tendero al momento de planear su inventario.',
        respClave: ['0.35','35%','sándwich y yogur representan el 35','juntos representan el 35'],
        retroalimentacion: 'fᵣ(Sándwich) = 30/120 = 0.25 y fᵣ(Yogur) = 12/120 = 0.10. Juntos suman 0.35 (35%). Esto le indica al tendero que más de 1 de cada 3 refrigerios vendidos pertenece a esas dos categorías, lo que orienta el inventario.',
      },
      {
        id: 'p5d-q2',
        tipo: 'Fi',
        texto: 'Si ordenas las categorías de mayor a menor venta, ¿cuántos refrigerios acumula la tabla hasta incluir los tres productos más vendidos (Fᵢ acumulada)? ¿Qué conclusión sacas sobre la concentración de las ventas?',
        respClave: ['90','jugo, sándwich y frutas','75%','tres primeros acumulan'],
        retroalimentacion: 'Ordenando: Jugo (38), Sándwich (30), Frutas (22). Fᵢ = 38 + 30 + 22 = 90. Eso representa el 75% del total. Conclusión: 3 de 5 categorías concentran el 75% de las ventas — los otros dos productos tienen mucho menor demanda.',
      },
      {
        id: 'p5d-q3',
        tipo: 'Hi',
        texto: 'Construye la tabla ordenando las categorías de menor a mayor venta. ¿En qué posición acumulada se supera el 50% de los refrigerios vendidos (Fᵣ > 0.50)? ¿Cómo cambia esta interpretación respecto al orden de mayor a menor?',
        respClave: ['yogur','empanada','frutas','tercer','cuarta','0.5','50%','acumulada supera','supera el 50'],
        retroalimentacion: 'Ordenando de menor a mayor: Yogur(12), Empanada(18), Frutas(22), Sándwich(30), Jugo(38). Fᵣ acumulado: 0.10 → 0.25 → 0.43 → 0.68. Se supera el 50% en la 4ª fila (Sándwich). En orden de mayor a menor, se superaba en la 2ª fila. El orden cambia la posición del "punto de mitad", lo cual es relevante para analizar cuáles productos son los de mayor impacto acumulado.',
      },
    ],
  },
  {
    titulo: 'Situación 2',
    badge: 'Situación 2',
    enunciado: 'Se realizó una encuesta a 90 estudiantes universitarios sobre la plataforma digital que más usan para estudiar. Las opciones fueron: YouTube (35), PDF/Apuntes propios (25), Aplicaciones educativas (15), Blogs y foros (10), Podcasts (5).',
    N: 90,
    categorias: [
      { cat: 'YouTube',               fi: 35 },
      { cat: 'PDF / Apuntes propios', fi: 25 },
      { cat: 'Apps educativas',       fi: 15 },
      { cat: 'Blogs y foros',         fi: 10 },
      { cat: 'Podcasts',              fi: 5  },
    ],
    preguntas: [
      {
        id: 'p5d-q1',
        tipo: 'hi',
        texto: '¿Cuál es la frecuencia relativa (fᵣ) de las plataformas que NO son YouTube? ¿Por qué podría ser más informativo comunicar este dato como proporción en lugar de conteo absoluto?',
        respClave: ['0.61','55','61%','no son youtube','resto','las demás'],
        retroalimentacion: 'YouTube: fᵣ = 35/90 ≈ 0.39. El resto: 55/90 ≈ 0.61 (61%). Comunicarlo como proporción permite comparar con otros contextos sin importar el tamaño total de la muestra — si otro estudio tiene 200 estudiantes, los porcentajes son comparables pero los conteos no.',
      },
      {
        id: 'p5d-q2',
        tipo: 'Fi',
        texto: 'Ordena las categorías de mayor a menor. ¿Cuántos estudiantes acumula la frecuencia absoluta acumulada (Fᵢ) hasta llegar a la plataforma "Apps educativas"? ¿Qué decisión podría tomar una institución con base en ese dato?',
        respClave: ['75','youtube, pdf','tres primeras','apps educativas acumula','hasta apps'],
        retroalimentacion: 'Ordenado: YouTube(35), PDF(25), Apps(15). Fᵢ hasta Apps = 35+25+15 = 75 de 90 estudiantes. Una institución podría enfocar sus recursos en esas tres plataformas ya que cubren al 83% de los estudiantes.',
      },
      {
        id: 'p5d-q3',
        tipo: 'Hi',
        texto: 'Si ordenas de menor a mayor uso, ¿en qué categoría la frecuencia relativa acumulada (Fᵣ) supera por primera vez el 25%? Compara ese resultado con el orden de mayor a menor. ¿Qué nos revela esta diferencia sobre la concentración del uso?',
        respClave: ['blogs','podcasts y blogs','0.25','25%','tercera','segunda','segunda fila','concentración'],
        retroalimentacion: 'Menor a mayor: Podcasts(5), Blogs(10), Apps(15), PDF(25), YouTube(35). Fᵣ: 0.056 → 0.167 → 0.333. Se supera 25% en la 3ª fila (Apps). De mayor a menor se supera en la 1ª fila (YouTube solo ya es 39%). Esto revela alta concentración: una sola plataforma domina casi el 40% del uso.',
      },
    ],
  },
  {
    titulo: 'Situación 3',
    badge: 'Situación 3',
    cuantitativa: true,
    enunciado: 'Una empresa midió los minutos diarios que dedican a hacer ejercicio 100 de sus empleados. Los datos, agrupados en intervalos, fueron: [0-15) → 20 empleados, [15-30) → 35, [30-45) → 25, [45-60) → 15, [60-75] → 5. A diferencia de las situaciones anteriores, aquí la variable es cuantitativa: cada fila es un intervalo de tiempo, no una categoría libre.',
    N: 100,
    categorias: [
      { cat: '[0-15)',  fi: 20 },
      { cat: '[15-30)', fi: 35 },
      { cat: '[30-45)', fi: 25 },
      { cat: '[45-60)', fi: 15 },
      { cat: '[60-75]', fi: 5  },
    ],
    preguntas: [
      {
        id: 'p5d-q1',
        tipo: 'hi',
        texto: '¿Qué proporción de empleados hace ejercicio menos de 30 minutos diarios? Suma las frecuencias relativas de los intervalos correspondientes. ¿Por qué sería relevante ese dato para un programa de bienestar laboral?',
        respClave: ['0.55','55%','menos de 30','primeros dos intervalos'],
        retroalimentacion: 'fᵣ[0-15) = 20/100 = 0.20 y fᵣ[15-30) = 35/100 = 0.35. Juntos: 0.55 (55%). Más de la mitad de los empleados hace menos de 30 minutos diarios, lo que podría orientar a la empresa a diseñar incentivos para aumentar esos minutos.',
      },
      {
        id: 'p5d-q2',
        tipo: 'Fi',
        texto: '¿Cuántos empleados acumulan hasta el intervalo [30-45), es decir, hasta 45 minutos de ejercicio diario (Fᵢ)? ¿Qué proporción de la empresa representa ese grupo?',
        respClave: ['80','80 empleados','ochenta','0.8','80%'],
        retroalimentacion: 'Fᵢ hasta [30-45) = 20+35+25 = 80 de 100 empleados. Eso representa el 80% de la empresa — solo el 20% restante supera los 45 minutos diarios de ejercicio.',
      },
      {
        id: 'p5d-q3',
        tipo: 'Hi',
        texto: 'A diferencia de las categorías de las Situaciones 1 y 2 (que podías reordenar libremente arrastrando las filas), estos intervalos representan minutos de ejercicio de menor a mayor. Intenta arrastrar la tabla para invertir el orden, colocando primero [60-75] y al final [0-15). ¿Qué le pasa al significado de Fᵢ y Fᵣ cuando inviertes el orden? ¿Sigue teniendo sentido llamarlo "frecuencia acumulada"?',
        respClave: ['pierde sentido','orden natural','no tiene sentido','intervalos tienen un orden','no se puede reordenar libremente','va de menor a mayor'],
        retroalimentacion: 'Cuando una variable es cuantitativa y sus datos están agrupados en intervalos, el orden NO es arbitrario: los intervalos tienen una secuencia numérica natural (de menor a mayor). Acumular en ese orden permite interpretar Fᵢ como "cuántos empleados hacen ejercicio hasta cierto tiempo". Si inviertes el orden, Fᵢ pasaría a significar "cuántos hacen ejercicio desde el tiempo más alto hacia abajo" — sigue siendo una acumulación matemáticamente válida, pero cambia por completo lo que representa, y ya no correspondería al concepto usual de "frecuencia acumulada creciente" que se usa para leer percentiles o medianas.',
      },
    ],
  },
];

function p5dValoresCorrectos(sit) {
  const rows = [];
  let acumF = 0;
  // Usar el orden original (el estudiante puede cambiar el orden en su tabla visual,
  // pero los valores de referencia se calculan con el orden dado)
  sit.categorias.forEach(f => {
    acumF += f.fi;
    rows.push({
      cat: f.cat, fi: f.fi,
      hi: parseFloat((f.fi / sit.N).toFixed(4)),
      Fi: acumF,
      Hi: parseFloat((acumF / sit.N).toFixed(4)),
    });
  });
  return rows;
}

// Estado del drag & drop de filas
let p5dDragSrcIdx = null;
let p5dOrdenActual = []; // índices de categorías en el orden actual del estudiante

function p5dCargarSituacion(idx) {
  p5dSituacionActual = idx;
  document.querySelectorAll('#p5d-tabs .p5c-tab').forEach((t,i) => {
    t.classList.toggle('active', i === idx);
  });
  const sit = P5D_SITUACIONES[idx];
  p5dOrdenActual = sit.categorias.map((_,i) => i); // orden original al inicio

  document.getElementById('p5d-badge').textContent     = sit.badge;
  document.getElementById('p5d-enunciado').textContent = sit.enunciado;

  // Referencia de datos
  const ref = document.getElementById('p5d-datos-ref');
  ref.innerHTML = `<div class="p5d-ref-label">Datos disponibles (N = ${sit.N}):</div>
    <div class="p5d-ref-chips">${sit.categorias.map(c =>
      `<span class="p5d-chip"><strong>${c.cat}</strong>: ${c.fi}</span>`
    ).join('')}</div>`;

  // Resetear feedbacks
  ['p5d-feedback-tabla','p5d-feedback-resp'].forEach(id => {
    const el = document.getElementById(id);
    el.style.display = 'none'; el.className = 'prob-feedback';
  });
  // Resetear respuestas
  document.querySelectorAll('.p5d-resp-input').forEach(t => t.value = '');
  // Resetear chat y panel del tutor (antes no se limpiaban al cambiar de situación)
  const chatBox = document.getElementById('chat-5d');
  if (chatBox) chatBox.innerHTML = '';
  const tutorPanel = document.getElementById('p5d-tutor-panel');
  if (tutorPanel) tutorPanel.style.display = 'none';

  p5dRenderTabla(sit);
  p5dRenderPreguntas(sit);
  // Tras el reseteo, intentar restaurar el estado guardado de ESTA situación
  p5dRestaurarEstado();
}

// Guarda el orden elegido + celdas (por posición) + respuestas, por situación y por sesión/dispositivo.
function p5dGuardarEstado() {
  const hiCells = document.querySelectorAll('.p5d-hi-cell');
  const FiCells = document.querySelectorAll('.p5d-Fi-cell');
  const HiCells = document.querySelectorAll('.p5d-Hi-cell');
  const sit = P5D_SITUACIONES[p5dSituacionActual];
  const respuestas = {};
  (sit?.preguntas || []).forEach(p => { respuestas[p.id] = document.getElementById(p.id)?.value || ''; });
  guardarEstadoLocal(`p5d_${p5dSituacionActual}`, {
    orden: p5dOrdenActual,
    celdas: {
      hi: [...hiCells].map(c => c.value),
      Fi: [...FiCells].map(c => c.value),
      Hi: [...HiCells].map(c => c.value),
    },
    respuestas,
  });
}

// Restaura el estado guardado de ESTA situación (si existe). El orden se restaura
// PRIMERO y se re-renderiza la tabla en ese orden antes de rellenar celdas —
// de lo contrario los valores quedarían en la fila equivocada.
function p5dRestaurarEstado() {
  const saved = leerEstadoLocal(`p5d_${p5dSituacionActual}`);

  if (saved) {
    if (saved.orden && Array.isArray(saved.orden) && saved.orden.length) {
      p5dOrdenActual = saved.orden;
      const sit = P5D_SITUACIONES[p5dSituacionActual];
      p5dRenderTabla(sit);
    }

    if (saved.celdas) {
      const hiCells = document.querySelectorAll('.p5d-hi-cell');
      const FiCells = document.querySelectorAll('.p5d-Fi-cell');
      const HiCells = document.querySelectorAll('.p5d-Hi-cell');
      (saved.celdas.hi || []).forEach((v,i) => { if (v && hiCells[i]) hiCells[i].value = v; });
      (saved.celdas.Fi || []).forEach((v,i) => { if (v && FiCells[i]) FiCells[i].value = v; });
      (saved.celdas.Hi || []).forEach((v,i) => { if (v && HiCells[i]) HiCells[i].value = v; });
      p5dActualizarCalculos();
    }

    if (saved.respuestas) {
      Object.entries(saved.respuestas).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      });
    }
  }

  // El chat se restaura SIEMPRE, sin importar si había o no estado local de
  // celdas guardado — son dos fuentes independientes (backend vs localStorage).
  const sid = `freq_5d_${p5dSituacionActual}_${sessionId}`;
  cargarHistorial(sid, 'chat-5d').then((hubo) => {
    if (hubo) chat5dIniciado = true;
    const box = document.getElementById('chat-5d');
    const panel = document.getElementById('p5d-tutor-panel');
    if (box && box.innerHTML.trim() !== '' && panel) panel.style.display = 'flex';
  });
}

function p5dRenderTabla(sit) {
  const wrap = document.getElementById('p5d-tabla-wrap');
  const colEtiqueta = sit.cuantitativa ? 'Intervalo (min)' : 'Categoría';
  let html = `<table class="p5c-tabla p5d-tabla">
    <thead><tr>
      <th class="p5d-th-drag">☰</th>
      <th>${colEtiqueta}</th><th>fᵢ</th><th>fᵣ</th><th>Fᵢ</th><th>Fᵣ</th>
    </tr></thead>
    <tbody id="p5d-tbody">`;

  p5dOrdenActual.forEach((catIdx, posicion) => {
    const cat = sit.categorias[catIdx];
    // Calcular valores según el orden ACTUAL del estudiante
    html += `<tr class="p5d-fila" draggable="true"
               ondragstart="p5dDragStart(event,${posicion})"
               ondragover="p5dDragOver(event)"
               ondrop="p5dDrop(event,${posicion})"
               ondragend="p5dDragEnd(event)">
      <td class="p5d-drag-handle" title="Arrastra para reordenar">⠿</td>
      <td class="p5c-cat">${cat.cat}</td>
      <td><input type="number" class="p5c-cell p5d-fi-cell" value="${cat.fi}" readonly></td>
      <td><input type="number" step="0.0001" class="p5c-cell p5d-hi-cell" placeholder="?" oninput="p5dActualizarCalculos(); p5dGuardarEstado();"></td>
      <td><input type="number" step="1"      class="p5c-cell p5d-Fi-cell" placeholder="?" oninput="p5dActualizarCalculos(); p5dGuardarEstado();"></td>
      <td><input type="number" step="0.0001" class="p5c-cell p5d-Hi-cell" placeholder="?" oninput="p5dActualizarCalculos(); p5dGuardarEstado();"></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  wrap.innerHTML = html;
}

function p5dRenderPreguntas(sit) {
  const list = document.getElementById('p5d-preguntas-list');
  list.innerHTML = sit.preguntas.map((p, i) => {
    const badge = p.tipo === 'hi' ? 'fᵣ — Frecuencia Relativa'
                : p.tipo === 'Fi' ? 'Fᵢ — Acumulada Absoluta'
                                  : 'Fᵣ — Acumulada Relativa';
    const color = p.tipo === 'hi' ? 'var(--moss)'
                : p.tipo === 'Fi' ? 'var(--sky)'
                                  : 'var(--gold)';
    return `<div class="p5d-pregunta-card">
      <div class="p5d-preg-badge" style="background:${color}">${badge}</div>
      <p class="p5d-preg-texto"><strong>Pregunta ${i+1}:</strong> ${p.texto}</p>
      <textarea class="p5d-resp-input" id="${p.id}" rows="3" oninput="p5dGuardarEstado()"
                placeholder="Escribe aquí tu análisis…"></textarea>
      <div class="p5d-retro" id="${p.id}-retro" style="display:none;"></div>
    </div>`;
  }).join('');
}

// ── Drag & drop para reordenar filas ──
function p5dDragStart(e, idx) {
  p5dDragSrcIdx = idx;
  e.currentTarget.classList.add('p5d-dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function p5dDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function p5dDrop(e, targetIdx) {
  e.preventDefault();
  if (p5dDragSrcIdx === null || p5dDragSrcIdx === targetIdx) return;
  // Reordenar p5dOrdenActual
  const moved = p5dOrdenActual.splice(p5dDragSrcIdx, 1)[0];
  p5dOrdenActual.splice(targetIdx, 0, moved);
  const sit = P5D_SITUACIONES[p5dSituacionActual];
  p5dRenderTabla(sit);
  p5dGuardarEstado();
}
function p5dDragEnd(e) {
  p5dDragSrcIdx = null;
  document.querySelectorAll('.p5d-fila').forEach(r => r.classList.remove('p5d-dragging'));
}

function p5dActualizarCalculos() {
  // Actualizar colores de celdas hi, Fi, Hi en tiempo real
  const sit = P5D_SITUACIONES[p5dSituacionActual];
  const hiCells = document.querySelectorAll('.p5d-hi-cell');
  const FiCells = document.querySelectorAll('.p5d-Fi-cell');
  const HiCells = document.querySelectorAll('.p5d-Hi-cell');

  let acumF = 0;
  p5dOrdenActual.forEach((catIdx, pos) => {
    const fi = sit.categorias[catIdx].fi;
    acumF += fi;
    const hiCorrect = fi / sit.N;
    const FiCorrect = acumF;
    const HiCorrect = acumF / sit.N;

    const hiInp = hiCells[pos]; const FiInp = FiCells[pos]; const HiInp = HiCells[pos];
    const chk = (inp, correct) => {
      if (!inp || inp.value === '') { inp?.classList.remove('p5c-ok','p5c-err'); return; }
      const v = parseFloat(inp.value);
      const ok = Math.abs(v - correct) < 0.011;
      inp.classList.toggle('p5c-ok', ok);
      inp.classList.toggle('p5c-err', !ok);
    };
    chk(hiInp, hiCorrect); chk(FiInp, FiCorrect); chk(HiInp, HiCorrect);
  });
}

function p5dVerificarTabla() {
  const sit = P5D_SITUACIONES[p5dSituacionActual];
  const hiCells = document.querySelectorAll('.p5d-hi-cell');
  const FiCells = document.querySelectorAll('.p5d-Fi-cell');
  const HiCells = document.querySelectorAll('.p5d-Hi-cell');

  let correctas = 0, total = 0, vacias = 0;
  let acumF = 0;

  p5dOrdenActual.forEach((catIdx, pos) => {
    const fi = sit.categorias[catIdx].fi;
    acumF += fi;
    const chk = (inp, correct) => {
      total++;
      if (!inp || inp.value === '') { vacias++; return; }
      if (Math.abs(parseFloat(inp.value) - correct) < 0.011) correctas++;
    };
    chk(hiCells[pos], fi / sit.N);
    chk(FiCells[pos], acumF);
    chk(HiCells[pos], acumF / sit.N);
  });

  const fb = document.getElementById('p5d-feedback-tabla');
  fb.style.display = 'block';
  if (vacias > 0) {
    fb.className = 'prob-feedback parcial';
    fb.textContent = `${vacias} celda(s) vacía(s). Completa todas las celdas fᵣ, Fᵢ y Fᵣ antes de verificar.`;
  } else if (correctas < total) {
    fb.className = 'prob-feedback error';
    fb.textContent = `${correctas}/${total} celdas correctas. Las celdas en rojo tienen errores. Recuerda que Fᵢ depende del orden de las filas que elegiste.`;
  } else {
    fb.className = 'prob-feedback ok';
    fb.textContent = `✅ ¡Tabla correcta! Las 4 frecuencias están bien calculadas en el orden que elegiste. Ahora responde las preguntas.`;
  }
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  p5dActualizarCalculos();
}

// NOTA: la verificación automática de respuestas por palabras clave fue retirada
// intencionalmente. El análisis de las respuestas abiertas lo hace el tutor IA
// (p5dEnviarAlTutor), que evalúa el razonamiento real del estudiante en lugar de
// coincidencias de texto. Esto respeta la situación a-didáctica: el medio responde
// al razonamiento, no a la forma exacta de las palabras.

function p5dReset() {
  const sit = P5D_SITUACIONES[p5dSituacionActual];
  p5dOrdenActual = sit.categorias.map((_,i) => i);
  p5dRenderTabla(sit);
  ['p5d-feedback-tabla','p5d-feedback-resp'].forEach(id => {
    const el = document.getElementById(id);
    el.style.display = 'none'; el.className = 'prob-feedback';
  });
  document.querySelectorAll('.p5d-resp-input').forEach(t => t.value = '');
  document.querySelectorAll('.p5d-retro').forEach(r => r.style.display = 'none');
}

/* ════════════════════════════════════════════════════════════
   PÁGINA 5d — TUTOR IA: analiza, evalúa y cuestiona respuestas
   session_id: freq_5d_<situacionIdx>_<sessionId>
════════════════════════════════════════════════════════════ */

let chat5dIniciado = false;

// Construye el contexto completo que el tutor necesita para evaluar
function p5dConstruirContexto() {
  const sit   = P5D_SITUACIONES[p5dSituacionActual];
  const N     = sit.N;

  // Verificación determinística en código — el modelo recibe el veredicto ya
  // calculado por cada celda, no seis números por fila para comparar por su cuenta.
  const hiCells = document.querySelectorAll('.p5d-hi-cell');
  const FiCells = document.querySelectorAll('.p5d-Fi-cell');
  const HiCells = document.querySelectorAll('.p5d-Hi-cell');

  const evaluarCelda = (valEstStr, correcto) => {
    const val = parseFloat(valEstStr);
    if (valEstStr === undefined || valEstStr === '' || isNaN(val)) return 'SIN COMPLETAR';
    return Math.abs(val - correcto) < 0.011 ? 'CORRECTO' : `INCORRECTO (correcto=${Number.isInteger(correcto) ? correcto : correcto.toFixed(4)})`;
  };

  let tablaTexto = 'Tabla construida por el estudiante (en el orden que eligió) — veredicto ya calculado por el código, no lo recalcules:\n';
  let acumF = 0;
  let todoCorrecto = true;
  p5dOrdenActual.forEach((catIdx, pos) => {
    const cat = sit.categorias[catIdx];
    acumF += cat.fi;
    const hiCorr = cat.fi / N;
    const FiCorr = acumF;
    const HiCorr = acumF / N;

    const vHi = evaluarCelda(hiCells[pos]?.value, hiCorr);
    const vFi = evaluarCelda(FiCells[pos]?.value, FiCorr);
    const vHi2 = evaluarCelda(HiCells[pos]?.value, HiCorr);
    if (!vHi.startsWith('CORRECTO') || !vFi.startsWith('CORRECTO') || !vHi2.startsWith('CORRECTO')) todoCorrecto = false;

    tablaTexto += `${cat.cat} (fᵢ=${cat.fi}): fᵣ=${vHi} | Fᵢ=${vFi} | Fᵣ=${vHi2}\n`;
  });
  tablaTexto += todoCorrecto ? 'VEREDICTO GENERAL: todos los cálculos son correctos.' : 'VEREDICTO GENERAL: hay al menos un cálculo incorrecto o sin completar (ver detalle arriba).';

  // Respuestas del estudiante a las 3 preguntas
  let respuestasTexto = '\nRespuestas del estudiante a las preguntas de análisis:\n';
  sit.preguntas.forEach((p, i) => {
    const resp = document.getElementById(p.id)?.value?.trim() || '(sin responder)';
    respuestasTexto += `\nPregunta ${i+1} [tipo ${p.tipo}]: ${p.texto}\nRespuesta: ${resp}\n`;
  });

  return `[CONTEXTO DE LA SITUACIÓN]\nSituación: ${sit.titulo}\nN = ${N}\nDescripción: ${sit.enunciado}\n\n${tablaTexto}\n${respuestasTexto}\n\nCon base en el veredicto de arriba (ya calculado, no lo repitas ni lo recalcules), analiza las respuestas del estudiante, identifica el nivel de Curcio de cada una, cuestiona el razonamiento y empuja hacia niveles más profundos (N3/N4). Recuerda: una sola pregunta por turno al final.`;
}

async function p5dEnviarAlTutor() {
  // Mostrar panel del tutor si estaba oculto
  const panel = document.getElementById('p5d-tutor-panel');
  if (panel) panel.style.display = 'flex';

  const contexto  = p5dConstruirContexto();
  const sessionId5d = `freq_5d_${p5dSituacionActual}_${sessionId}`;

  // Si es la primera vez en esta situación, resetear historial local del chat
  if (!chat5dIniciado) {
    chat5dIniciado = true;
    const box = document.getElementById('chat-5d');
    if (box) box.innerHTML = '';
  }

  agregarMensajeGen('chat-5d', '📋 Enviando mis respuestas al tutor para análisis…', 'user');
  const tid = agregarTypingGen('chat-5d');
  setStatusGen('tutor-status-5d', 'Analizando…');

  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: contexto, session_id: sessionId5d })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-5d', 'En línea');
    if (data.reply) agregarMensajeGen('chat-5d', data.reply, 'tutor');
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-5d', 'En línea');
    agregarMensajeGen('chat-5d', 'Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }

  // Scroll al panel del tutor
  setTimeout(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
}

async function p5dEnviarMensajeLibre() {
  const input = document.getElementById('input-5d');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-5d', texto, 'user');
  const tid = agregarTypingGen('chat-5d');
  setStatusGen('tutor-status-5d', 'Escribiendo…');
  const sessionId5d = `freq_5d_${p5dSituacionActual}_${sessionId}`;
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: sessionId5d })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    setStatusGen('tutor-status-5d', 'En línea');
    if (data.reply) agregarMensajeGen('chat-5d', data.reply, 'tutor');
  } catch (err) {
    quitarTypingGen(tid);
    setStatusGen('tutor-status-5d', 'En línea');
    agregarMensajeGen('chat-5d', 'Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

// Resetear tutor al cambiar de situación
const _p5dCargarSituacionOrig = p5dCargarSituacion;
p5dCargarSituacion = function(idx) {
  _p5dCargarSituacionOrig(idx);
  chat5dIniciado = false;
  const box = document.getElementById('chat-5d');
  if (box) box.innerHTML = '';
  setStatusGen('tutor-status-5d', 'En espera…');
  const panel = document.getElementById('p5d-tutor-panel');
  if (panel) panel.style.display = 'none';
};

/* ════════════════════════════════════════════════════════════
   PÁGINAS 12 y 13 — TUTORES IA TABLAS DE CONTINGENCIA
   contA: pág 12 Formulación  → session: cont_A_<idx>_<sessionId>
   contB: pág 13 Validación   → session: cont_B_<idx>_<sessionId>
════════════════════════════════════════════════════════════ */

// ── Tutor A (pág 12: Formulación) ──
function pAConstruirContexto() {
  const p   = PROBLEMAS_A[probAActual];
  const tipo = tipoEscogidoA || '(no seleccionado)';
  const justif = document.getElementById('probA-justif')?.value?.trim() || '(sin justificación)';

  // Verificación determinística en código — el modelo recibe el veredicto ya
  // calculado, no dos números para comparar por su cuenta.
  const inputs = document.querySelectorAll('#probA-tabla-wrapper .cell-input');
  let celdasTexto = '';
  let todasCorrectas = true, hayVacias = false;
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    const correcto = parseFloat(inp.dataset.correcto);
    let veredicto;
    if (inp.value === '' || isNaN(val)) {
      veredicto = 'SIN COMPLETAR'; hayVacias = true; todasCorrectas = false;
    } else if (Math.abs(val - correcto) < 0.011) {
      veredicto = 'CORRECTA';
    } else {
      veredicto = `INCORRECTA (el estudiante puso ${inp.value}; el valor correcto es ${inp.dataset.correcto})`;
      todasCorrectas = false;
    }
    celdasTexto += `  Celda [fila ${inp.dataset.fila}, col ${inp.dataset.col}]: ${veredicto}\n`;
  });
  const resumenTabla = todasCorrectas ? 'VEREDICTO GENERAL: todas las celdas están correctas.'
    : hayVacias ? 'VEREDICTO GENERAL: hay celdas sin completar.'
    : 'VEREDICTO GENERAL: hay al menos una celda incorrecta.';

  return `[CONTEXTO — Problema de Formulación ${probAActual+1}]
Enunciado: ${p.enunciado.replace(/<[^>]+>/g,'')}
Pregunta: ${p.pregunta.replace(/<[^>]+>/g,'')}
N = ${p.N}
Variables fila: ${p.filas.join(', ')}
Variables columna: ${p.columnas.join(', ')}
Sistema de representación correcto: ${p.respuestaCorrecta}

Sistema escogido por el estudiante: ${tipo}
Justificación del estudiante: ${justif}

Celdas ocultas (veredicto ya calculado por el código, no lo recalcules):
${celdasTexto}${resumenTabla}

Pregunta de reflexión del problema: ${p.analisis}

Con base en el veredicto de arriba (ya calculado), cuestiona la elección de sistema y la justificación usando TSD y Curcio. No des la respuesta directa. No repitas ni verifiques tú mismo si las celdas están bien — ese cálculo ya está hecho.`;
}

async function pAEnviarAlTutor() {
  const panel = document.getElementById('pA-tutor-panel');
  if (panel) panel.style.display = 'flex';
  const contexto = pAConstruirContexto();
  const sid = `cont_A_${probAActual}_${sessionId}`;
  agregarMensajeGen('chat-contA', '📋 Enviando mi trabajo al tutor…', 'user');
  const tid = agregarTypingGen('chat-contA');
  setStatusGen('tutor-status-pA', 'Analizando…');
  setTimeout(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  try {
    const res  = await fetch(URL_BACKEND, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: contexto, session_id: sid }) });
    const data = await res.json();
    quitarTypingGen(tid); setStatusGen('tutor-status-pA', 'En línea');
    if (data.reply) agregarMensajeGen('chat-contA', data.reply, 'tutor');
  } catch(e) {
    quitarTypingGen(tid); setStatusGen('tutor-status-pA', 'En línea');
    agregarMensajeGen('chat-contA', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

async function pAEnviarMensajeLibre() {
  const input = document.getElementById('input-contA');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-contA', texto, 'user');
  const tid = agregarTypingGen('chat-contA');
  setStatusGen('tutor-status-pA', 'Escribiendo…');
  const sid = `cont_A_${probAActual}_${sessionId}`;
  try {
    const res  = await fetch(URL_BACKEND, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: texto, session_id: sid }) });
    const data = await res.json();
    quitarTypingGen(tid); setStatusGen('tutor-status-pA', 'En línea');
    if (data.reply) agregarMensajeGen('chat-contA', data.reply, 'tutor');
  } catch(e) {
    quitarTypingGen(tid); setStatusGen('tutor-status-pA', 'En línea');
    agregarMensajeGen('chat-contA', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

// ── Tutor B (pág 13: Validación) ──
function pBConstruirContexto() {
  const p   = PROBLEMAS_B[probBActual];
  const tipo = tipoEscogidoB || '(no seleccionado)';

  // Verificación determinística en código — el modelo recibe el veredicto ya
  // calculado, no dos números para comparar por su cuenta.
  const inputs = document.querySelectorAll('#probB-tabla-wrapper .cell-input');
  let celdasTexto = '';
  let todasCorrectas = true, hayVacias = false;
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    const correcto = parseFloat(inp.dataset.correcto);
    let veredicto;
    if (inp.value === '' || isNaN(val)) {
      veredicto = 'SIN COMPLETAR'; hayVacias = true; todasCorrectas = false;
    } else if (Math.abs(val - correcto) < 0.011) {
      veredicto = 'CORRECTA';
    } else {
      veredicto = `INCORRECTA (el estudiante puso ${inp.value}; el valor correcto es ${inp.dataset.correcto})`;
      todasCorrectas = false;
    }
    celdasTexto += `  Celda [${inp.dataset.fila},${inp.dataset.col}]: ${veredicto}\n`;
  });
  const resumenTabla = todasCorrectas ? 'VEREDICTO GENERAL: toda la tabla está correcta.'
    : hayVacias ? 'VEREDICTO GENERAL: hay celdas sin completar.'
    : 'VEREDICTO GENERAL: hay al menos una celda incorrecta.';

  let respuestasTexto = '';
  p.preguntas.forEach((q,i) => {
    const r = document.getElementById(q.id)?.value?.trim() || '(sin responder)';
    respuestasTexto += `\nPregunta ${i+1} [${q.tipo}]: ${q.texto}\nRespuesta: ${r}\n`;
  });

  return `[CONTEXTO — Reto de Validación ${probBActual+1}]
Enunciado: ${p.enunciado.replace(/<[^>]+>/g,'')}
Pistas dadas: ${p.frases.join(' | ')}
Pregunta guía: ${p.pregunta}
N = ${p.N}, Filas: ${p.filas.join(', ')}, Columnas: ${p.columnas.join(', ')}
Sistema correcto: ${p.respuestaCorrecta}
Sistema escogido: ${tipo}

Celdas construidas (veredicto ya calculado por el código, no lo recalcules):
${celdasTexto}${resumenTabla}

Respuestas a preguntas de análisis:${respuestasTexto}
Con base en el veredicto de arriba (ya calculado), analiza la construcción de la tabla, la elección de sistema y las respuestas de análisis por separado — no mezcles la corrección de la tabla con el cuestionamiento del análisis en el mismo párrafo. Clasifica cada respuesta por nivel de Curcio (N1–N4) y cuestiona para empujar hacia N3/N4. No des respuestas directas. No repitas ni verifiques tú mismo si las celdas están bien — ese cálculo ya está hecho.`;
}

async function pBEnviarAlTutor() {
  const panel = document.getElementById('pB-tutor-panel');
  if (panel) panel.style.display = 'flex';
  const contexto = pBConstruirContexto();
  const sid = `cont_B_${probBActual}_${sessionId}`;
  agregarMensajeGen('chat-contB', '📋 Enviando mi trabajo al tutor…', 'user');
  const tid = agregarTypingGen('chat-contB');
  setStatusGen('tutor-status-pB', 'Analizando…');
  setTimeout(() => panel?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  try {
    const res  = await fetch(URL_BACKEND, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: contexto, session_id: sid }) });
    const data = await res.json();
    quitarTypingGen(tid); setStatusGen('tutor-status-pB', 'En línea');
    if (data.reply) agregarMensajeGen('chat-contB', data.reply, 'tutor');
  } catch(e) {
    quitarTypingGen(tid); setStatusGen('tutor-status-pB', 'En línea');
    agregarMensajeGen('chat-contB', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

async function pBEnviarMensajeLibre() {
  const input = document.getElementById('input-contB');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeGen('chat-contB', texto, 'user');
  const tid = agregarTypingGen('chat-contB');
  setStatusGen('tutor-status-pB', 'Escribiendo…');
  const sid = `cont_B_${probBActual}_${sessionId}`;
  try {
    const res  = await fetch(URL_BACKEND, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message: texto, session_id: sid }) });
    const data = await res.json();
    quitarTypingGen(tid); setStatusGen('tutor-status-pB', 'En línea');
    if (data.reply) agregarMensajeGen('chat-contB', data.reply, 'tutor');
  } catch(e) {
    quitarTypingGen(tid); setStatusGen('tutor-status-pB', 'En línea');
    agregarMensajeGen('chat-contB', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

/* ══════════════════════════════════════════════════════════════
   CAPÍTULO III — PRUEBA CHI-CUADRADO (págs 15–24)
   Prefijos de sesión: chi3_p15_ … chi3_p24_
══════════════════════════════════════════════════════════════ */

// ── Datos compartidos del ejemplo guiado (págs 17, 18, 19) ──
// Matrices correctas para el ejemplo de págs 17-19
// Mat(30) + Est(30) = 60. Todas Eᵢⱼ ≥ 5 (mínimo 7). χ²=15.48, rechaza H₀.
const CHI3_O = [[20,8,2],[6,12,12]]; // Mat: R alto / Est: distribución opuesta
const CHI3_FILAS = ['Matemáticas','Estadística'];
const CHI3_COLS  = ['R','Python','SPSS'];
const CHI3_N     = 60;

function chi3CalcE(O, filas, cols, N) {
  const totF = O.map(r => r.reduce((s,v)=>s+v,0));
  const totC = cols.map((_,j) => O.reduce((s,r)=>s+r[j],0));
  return O.map((r,i) => r.map((_,j) => parseFloat((totF[i]*totC[j]/N).toFixed(4))));
}

// Eᵢⱼ precalculadas para el ejemplo
const CHI3_E = chi3CalcE(CHI3_O, CHI3_FILAS, CHI3_COLS, CHI3_N);
const CHI3_CHI2 = CHI3_O.reduce((s,r,i)=>s+r.reduce((ss,v,j)=>ss+Math.pow(v-CHI3_E[i][j],2)/CHI3_E[i][j],0),0);

// ── Ejemplo 2 (pág 21): Inglés × Intercambio (75 estudiantes) ──
const CHI3_O2 = [[3,27],[7,18],[12,8]];
const CHI3_FILAS2 = ['Básico','Intermedio','Avanzado'];
const CHI3_COLS2  = ['Sí','No'];
const CHI3_N2     = 75;
const CHI3_E2 = chi3CalcE(CHI3_O2, CHI3_FILAS2, CHI3_COLS2, CHI3_N2);
const CHI3_CHI2_2 = CHI3_O2.reduce((s,r,i)=>s+r.reduce((ss,v,j)=>ss+Math.pow(v-CHI3_E2[i][j],2)/CHI3_E2[i][j],0),0);

// ── Helper: render tabla chi3 ──
function chi3RenderTbl(O, E, filas, cols, N, modo) {
  const totF = O.map(r=>r.reduce((s,v)=>s+v,0));
  const totC = cols.map((_,j)=>O.reduce((s,r)=>s+r[j],0));
  let h = `<table class="chi3-tbl"><thead><tr><th>↓/→</th>`;
  cols.forEach(c=>{h+=`<th>${c}</th>`;});
  h+=`<th>Total</th></tr></thead><tbody>`;
  filas.forEach((f,i)=>{
    h+=`<tr><td>${f}</td>`;
    cols.forEach((_,j)=>{
      let val,cls='';
      if(modo==='obs')  { val=O[i][j]; }
      else if(modo==='esp') { val=E[i][j].toFixed(2); }
      else { // diferencia con color
        const d=O[i][j]-E[i][j];
        val=(d>0?'+':'')+d.toFixed(2);
        cls=d>0?' style="color:#c0392b;font-weight:600"':d<0?' style="color:#2980b9;font-weight:600"':'';
      }
      h+=`<td${cls}>${val}</td>`;
    });
    h+=`<td class="td-marg">${totF[i]}</td></tr>`;
  });
  h+=`<tr><td>Total</td>`;
  totC.forEach(tc=>{h+=`<td class="td-marg">${tc}</td>`;});
  h+=`<td class="td-marg">${N}</td></tr></tbody></table>`;
  return h;
}

// ── Helper: chat genérico chi3 ──
async function chi3Enviar(pageId, mensaje, esContexto=false) {
  const sid = `chi3_${pageId}_${sessionId}`;
  const chatId = `chi3-${pageId}`;
  const panelId = `chi3-${pageId}-tutor`;
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = 'flex';
  if (!esContexto) agregarMensajeGen(`chat-${chatId}`, mensaje, 'user');
  else agregarMensajeGen(`chat-${chatId}`, '📋 Enviando al tutor…', 'user');
  const tid = agregarTypingGen(`chat-${chatId}`);
  setStatusGen(`ts-${chatId}`, 'Analizando…');
  try {
    const res  = await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:mensaje,session_id:sid})});
    const data = await res.json();
    quitarTypingGen(tid); setStatusGen(`ts-${chatId}`,'En línea');
    if(data.reply) agregarMensajeGen(`chat-${chatId}`,data.reply,'tutor');
  } catch(e) {
    quitarTypingGen(tid); setStatusGen(`ts-${chatId}`,'En línea');
    agregarMensajeGen(`chat-${chatId}`,'Problema de conexión. Intenta de nuevo.','tutor');
  }
  setTimeout(()=>panel?.scrollIntoView({behavior:'smooth',block:'start'}),300);
}

async function chi3ChatLibre(pageId) {
  const inp = document.getElementById(`input-chi3-${pageId}`);
  if(!inp?.value.trim()) return;
  const txt = inp.value.trim(); inp.value='';
  await chi3Enviar(pageId, txt, false);
}

// Registrar audio para todos los tutores chi3 (incluido el tutor dedicado al descubrimiento de pág 18)
['p15','p16','p17','p18','p19','p20','p21','p22','p23','p24'].forEach(pid=>{
  AUDIO_MAP[`chi3-${pid}`] = {btn:`audio-btn-chi3-${pid}`, waves:`audio-waves-chi3-${pid}`};
  BOX_TO_AUDIO[`chat-chi3-${pid}`] = `chi3-${pid}`;
  audioState[`chi3-${pid}`] = false;
});

/* ── PÁGINA 15 ── */
async function chi3P15EnviarAlTutor() {
  const q1 = document.getElementById('chi3-p15-q1')?.value||'(sin responder)';
  const q2 = document.getElementById('chi3-p15-q2')?.value||'(sin responder)';
  const q3 = document.getElementById('chi3-p15-q3')?.value||'(sin responder)';
  const ctx = `[CONTEXTO P15 — Introducción Chi-cuadrado]
La tabla presentada: Bus/Siempre=10,AvVeces=14,Nunca=6(tot30); Bici=12,8,5(tot25); APie=2,10,3(tot15). N=90.
Respuestas del estudiante:
P1 (¿Hay relación?): ${q1}
P2 (¿Podría ser azar?): ${q2}
P3 (¿Qué necesitarías?): ${q3}
Analiza el nivel de Curcio de cada respuesta. El estudiante aún no conoce chi-cuadrado. Activa el conflicto cognitivo: ¿cómo distinguir una diferencia real del azar? No menciones chi-cuadrado ni p-valor.`;
  await chi3Enviar('p15', ctx, true);
}

/* ── PÁGINA 16 ── */
const CHI3_P16_MARG_F = [30,25,15]; // Bus,Bici,APie
const CHI3_P16_MARG_C = [24,32,14]; // Siempre,AvVeces,Nunca
const CHI3_P16_N = 90;
// Eᵢⱼ de independencia: E[i][j] = margF[i]*margC[j]/N
const CHI3_P16_E = CHI3_P16_MARG_F.map(mf=>CHI3_P16_MARG_C.map(mc=>parseFloat((mf*mc/CHI3_P16_N).toFixed(4))));

function chi3P16Render() {
  const filas=['Bus','Bicicleta','A pie'];
  const cols =['Siempre','A veces','Nunca'];
  let h=`<table class="chi3-tbl"><thead><tr><th>↓/→</th>`;
  cols.forEach(c=>{h+=`<th>${c}</th>`;});
  h+=`<th>Total fila</th></tr></thead><tbody>`;
  filas.forEach((f,i)=>{
    h+=`<tr><td>${f}</td>`;
    cols.forEach((_,j)=>{
      h+=`<td><input type="number" min="0" class="p5c-cell chi3-p16-cell" id="chi3-p16-${i}-${j}"
          data-correct="${CHI3_P16_E[i][j]}" data-mf="${CHI3_P16_MARG_F[i]}" data-mc="${CHI3_P16_MARG_C[j]}"
          placeholder="?" oninput="chi3P16Actualizar()" style="width:64px;"></td>`;
    });
    h+=`<td class="td-marg" id="chi3-p16-rowsum-${i}" style="color:var(--slate);">${CHI3_P16_MARG_F[i]}</td></tr>`;
  });
  h+=`<tr><td>Total col</td>`;
  cols.forEach((_,j)=>{h+=`<td class="td-marg" id="chi3-p16-colsum-${j}">${CHI3_P16_MARG_C[j]}</td>`;});
  h+=`<td class="td-marg">${CHI3_P16_N}</td></tr></tbody></table>`;
  const w=document.getElementById('chi3-p16-tabla-wrap');
  if(w) w.innerHTML=h;
}

function chi3P16Actualizar() {
  const filas=3,cols=3;
  for(let i=0;i<filas;i++){
    let rs=0;
    for(let j=0;j<cols;j++){
      const v=parseFloat(document.getElementById(`chi3-p16-${i}-${j}`)?.value)||0;
      rs+=v;
    }
    const el=document.getElementById(`chi3-p16-rowsum-${i}`);
    if(el){el.textContent=`${rs} / ${CHI3_P16_MARG_F[i]}`;el.style.color=rs===CHI3_P16_MARG_F[i]?'var(--moss)':'var(--gold)';}
  }
  for(let j=0;j<cols;j++){
    let cs=0;
    for(let i=0;i<filas;i++){cs+=parseFloat(document.getElementById(`chi3-p16-${i}-${j}`)?.value)||0;}
    const el=document.getElementById(`chi3-p16-colsum-${j}`);
    if(el){el.textContent=`${cs} / ${CHI3_P16_MARG_C[j]}`;el.style.color=cs===CHI3_P16_MARG_C[j]?'var(--moss)':'var(--gold)';}
  }
}

function chi3P16Verificar() {
  const filas=3,cols=3;
  const nFilas=['Bus','Bicicleta','A pie'], nCols=['Siempre','A veces','Nunca'];
  let ok=true, msgs=[];
  // Leer la matriz completa
  const M=[];
  for(let i=0;i<filas;i++){
    M[i]=[];
    for(let j=0;j<cols;j++){M[i][j]=parseFloat(document.getElementById(`chi3-p16-${i}-${j}`)?.value)||0;}
  }
  // 1) Verificar marginales
  for(let i=0;i<filas;i++){
    const rs=M[i].reduce((s,v)=>s+v,0);
    if(rs!==CHI3_P16_MARG_F[i]){ok=false;msgs.push(`La fila ${nFilas[i]} suma ${rs}, pero debería sumar ${CHI3_P16_MARG_F[i]}.`);}
  }
  for(let j=0;j<cols;j++){
    let cs=0; for(let i=0;i<filas;i++) cs+=M[i][j];
    if(cs!==CHI3_P16_MARG_C[j]){ok=false;msgs.push(`La columna ${nCols[j]} suma ${cs}, pero debería sumar ${CHI3_P16_MARG_C[j]}.`);}
  }
  const fb=document.getElementById('chi3-p16-validacion');
  if(!fb) return;
  fb.style.display='block';
  if(!ok){
    fb.className='prob-feedback error';
    fb.innerHTML='⚠️ Los marginales todavía no cuadran:<br>'+msgs.join('<br>');
    return;
  }
  // 2) Marginales correctos → el MEDIO ahora retroalimenta sobre INDEPENDENCIA
  // Comparar la proporción de cada columna DENTRO de cada fila.
  // Si hay independencia, la proporción de (p.ej.) "Siempre" debe ser la misma en Bus, Bici y A pie.
  // El medio muestra las proporciones por fila SIN dar la fórmula — el estudiante ve la consecuencia.
  let propTxt='<table style="width:100%;border-collapse:collapse;margin-top:6px;font-size:.74rem;">';
  propTxt+='<tr><th style="text-align:left;padding:3px;">% dentro de la fila</th>'+nCols.map(c=>`<th style="padding:3px;">${c}</th>`).join('')+'</tr>';
  const propsPorCol=[[],[],[]]; // para cada columna, las proporciones de cada fila
  for(let i=0;i<filas;i++){
    const rs=CHI3_P16_MARG_F[i];
    propTxt+=`<tr><td style="padding:3px;font-weight:600;">${nFilas[i]}</td>`;
    for(let j=0;j<cols;j++){
      const p=rs>0?(M[i][j]/rs*100):0;
      propsPorCol[j].push(p);
      propTxt+=`<td style="padding:3px;text-align:center;">${p.toFixed(0)}%</td>`;
    }
    propTxt+='</tr>';
  }
  propTxt+='</table>';
  // Medir cuán diferentes son las proporciones entre filas (rango máximo por columna)
  let maxRango=0;
  for(let j=0;j<cols;j++){
    const r=Math.max(...propsPorCol[j])-Math.min(...propsPorCol[j]);
    if(r>maxRango) maxRango=r;
  }
  if(maxRango<=6){
    // Proporciones casi iguales entre filas → distribución de independencia lograda
    fb.className='prob-feedback ok';
    fb.innerHTML='✅ Los marginales se respetan <strong>y</strong> las proporciones de cada categoría son casi iguales entre las tres filas:'+propTxt+
      '<br>Eso es justo lo que ocurre cuando las variables <strong>no tienen relación</strong>: el reparto interno "imita" al patrón general. Envíala al tutor para ponerle nombre a lo que construiste.';
  } else {
    // Marginales OK pero las proporciones difieren → todavía hay "relación" en el reparto
    fb.className='prob-feedback parcial';
    fb.innerHTML='⚠️ Los marginales se respetan, pero observa las proporciones <em>dentro de cada fila</em>:'+propTxt+
      `<br>Las proporciones cambian bastante de una fila a otra (hasta ${maxRango.toFixed(0)} puntos de diferencia). Si <strong>no</strong> hubiera ninguna relación entre las variables, ¿deberían diferir tanto? Intenta acercar las proporciones de las tres filas.`;
  }
}

async function chi3P16EnviarAlTutor() {
  const filas=['Bus','Bicicleta','A pie'],cols=['Siempre','A veces','Nunca'];
  let tablaEst='Distribución del estudiante:\n';
  filas.forEach((f,i)=>{
    let rs=0;
    const vals=cols.map((_,j)=>{const v=parseFloat(document.getElementById(`chi3-p16-${i}-${j}`)?.value)||0;rs+=v;return v;});
    tablaEst+=`${f}: ${vals.join(', ')} (suma=${rs}, marginal=${CHI3_P16_MARG_F[i]})\n`;
  });
  tablaEst+=`Marginales columna: ${CHI3_P16_MARG_C.join(', ')}\n`;
  tablaEst+=`Eᵢⱼ si hubiera independencia perfecta:\n`;
  filas.forEach((f,i)=>{tablaEst+=`${f}: ${CHI3_P16_E[i].map(v=>v.toFixed(2)).join(', ')}\n`;});
  const n3=document.getElementById('chi3-p16-n3')?.value||'(sin responder)';
  chi3P16Intentos = 1;
  const ctx=`[CONTEXTO P16 — Construir independencia]
${tablaEst}
Respuesta del estudiante a la pregunta de interpretación (N3) — "si lo observado se pareciera/difiriera de esta tabla sin relación, ¿qué dirías?": ${n3}
El código de la página ya confirmó matemáticamente que los marginales y las proporciones respetan el patrón de independencia. Plantea ahora la pregunta de descubrimiento de Eᵢⱼ.
Número de intento: ${chi3P16Intentos}`;
  await chi3P16EnviarMensajeEstructurado(ctx, true);
}

// Respuesta libre del estudiante mientras intenta descubrir la fórmula (reemplaza
// el chat genérico solo para esta página — las otras 9 páginas de chi3 no se tocan).
async function chi3P16ResponderFormula() {
  if (chi3P16FormulaResuelta) return; // ya se reveló; el chat libre normal no aplica aquí
  const inp = document.getElementById('input-chi3-p16');
  if (!inp?.value.trim()) return;
  const txt = inp.value.trim(); inp.value = '';
  chi3P16Intentos++;
  const ctx = `${txt}\n\n[Número de intento: ${chi3P16Intentos}]`;
  await chi3P16EnviarMensajeEstructurado(ctx, false, txt);
}

// Versión dedicada a p16 (salida estructurada JSON). El backend devuelve
// data.propuso_formula_correcta como booleano — esa señal, junto con el contador de
// intentos, es lo que decide si se revela la institucionalización. El modelo
// nunca decide eso por sí mismo, solo redacta el texto de cada pista.
async function chi3P16EnviarMensajeEstructurado(mensaje, esContexto, textoVisible) {
  const sid = `chi3_p16_${sessionId}`;
  const panel = document.getElementById('chi3-p16-tutor');
  if (panel) panel.style.display = 'flex';
  if (esContexto) agregarMensajeGen('chat-chi3-p16', '📋 Enviando al tutor…', 'user');
  else agregarMensajeGen('chat-chi3-p16', textoVisible ?? mensaje, 'user');
  const tid = agregarTypingGen('chat-chi3-p16');
  setStatusGen('ts-chi3-p16', 'Analizando…');
  try {
    const res  = await fetch(URL_BACKEND, {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({message: mensaje, session_id: sid})});
    const data = await res.json();
    quitarTypingGen(tid); setStatusGen('ts-chi3-p16', 'En línea');
    if (data.reply) agregarMensajeGen('chat-chi3-p16', data.reply, 'tutor');

    // Decisión gobernada por código: éxito reportado por el modelo, o techo de intentos.
    if (data.propuso_formula_correcta === true) {
      chi3P16RevelarInstitucionalizacion(false);
    } else if (chi3P16Intentos >= 3) {
      chi3P16RevelarInstitucionalizacion(true);
    }
  } catch (e) {
    quitarTypingGen(tid); setStatusGen('ts-chi3-p16', 'En línea');
    agregarMensajeGen('chat-chi3-p16', 'Problema de conexión. Intenta de nuevo.', 'tutor');
  }
  setTimeout(() => panel?.scrollIntoView({behavior:'smooth', block:'start'}), 300);
}

// Institucionalización real: tarjeta estática escrita por el código, no por el modelo.
// porTecho=true → se agotaron los 3 intentos sin que el estudiante propusiera la fórmula.
// porTecho=false → el estudiante sí la propuso; el código lo confirma, no el LLM narrándolo.
function chi3P16RevelarInstitucionalizacion(porTecho) {
  if (chi3P16FormulaResuelta) return;
  chi3P16FormulaResuelta = true;
  const card = document.getElementById('chi3-p16-institucionalizacion');
  if (!card) return;
  const encabezado = porTecho
    ? 'Después de explorar varias ideas, esta es la fórmula formal:'
    : '¡Justo eso propusiste! Así se formaliza:';
  card.style.display = 'block';
  card.innerHTML = `
    <div class="chi3-inst-titulo">📐 ${encabezado}</div>
    <div class="chi3-inst-formula">Frecuencia esperada: <strong>Eᵢⱼ = (fᵢ· × f·ⱼ) / N</strong></div>
    <div class="chi3-inst-texto">Es el valor que tendría cada celda si las dos variables no tuvieran ninguna relación entre sí — se calcula multiplicando el total de su fila por el total de su columna, y dividiendo entre el total general N.</div>`;
  const inputArea = document.querySelector('#chi3-p16-tutor .chat-input-area');
  if (inputArea) inputArea.style.opacity = '.5';
  const inp = document.getElementById('input-chi3-p16');
  if (inp) { inp.disabled = true; inp.placeholder = 'Ya descubriste la fórmula — continúa a la siguiente página.'; }
}

/* ── PÁGINA 17 ── */
let chi3P17PasoActual = 0;
const CHI3_P17_PASOS = [
  {
    titulo: 'Paso 1 — La tabla observada (Oᵢⱼ)',
    desc: 'Estos son los datos que recogiste: cuántos estudiantes de cada programa usan cada software. Estos valores se llaman <strong>frecuencias observadas Oᵢⱼ</strong>.',
    accion: () => chi3RenderTbl(CHI3_O, CHI3_E, CHI3_FILAS, CHI3_COLS, CHI3_N, 'obs'),
    modo: 'obs',
  },
  {
    titulo: 'Paso 2 — Los totales marginales',
    desc: 'Los totales de fila (fᵢ·) y columna (f·ⱼ) son la clave para calcular las frecuencias esperadas. <br>Matemáticas: <strong>30</strong>, Estadística: <strong>30</strong><br>R: <strong>26</strong>, Python: <strong>20</strong>, SPSS: <strong>14</strong>',
    accion: () => chi3RenderTbl(CHI3_O, CHI3_E, CHI3_FILAS, CHI3_COLS, CHI3_N, 'obs'),
    modo: 'obs',
  },
  {
    titulo: 'Paso 3 — Calcular Eᵢⱼ para la primera celda',
    desc: `Si no hubiera relación, esperaríamos que la proporción de usuarios de R en Matemáticas fuera la misma que en el total:<br><br>
    <code>E[Mat,R] = (fᵢ· × f·ⱼ) / N = (30 × 26) / 60 = <strong>${CHI3_E[0][0].toFixed(2)}</strong></code><br><br>
    En cambio, observamos Oᵢⱼ = <strong>${CHI3_O[0][0]}</strong>. ¿Son muy distintos?`,
    accion: () => chi3RenderTbl(CHI3_O, CHI3_E, CHI3_FILAS, CHI3_COLS, CHI3_N, 'esp'),
    modo: 'esp',
  },
  {
    titulo: 'Paso 4 — Tabla esperada completa (Eᵢⱼ)',
    desc: 'Aplicando la fórmula a todas las celdas obtenemos la tabla esperada. Compara con la observada usando el toggle de la derecha.',
    accion: () => chi3RenderTbl(CHI3_O, CHI3_E, CHI3_FILAS, CHI3_COLS, CHI3_N, 'esp'),
    modo: 'esp',
  },
  {
    titulo: 'Paso 5 — La diferencia Oᵢⱼ − Eᵢⱼ',
    desc: 'Las celdas en <span style="color:#c0392b;font-weight:600">rojo</span> tienen más estudiantes de los esperados. Las <span style="color:#2980b9;font-weight:600">azules</span> tienen menos. ¿Qué celdas se alejan más?',
    accion: () => chi3RenderTbl(CHI3_O, CHI3_E, CHI3_FILAS, CHI3_COLS, CHI3_N, 'dif'),
    modo: 'dif',
  },
];

let chi3P17Modo = 'obs';
function chi3P17Init() {
  chi3P17PasoActual = 0;
  chi3P17Renderizar();
}
function chi3P17Renderizar() {
  const paso = CHI3_P17_PASOS[chi3P17PasoActual];
  const total = CHI3_P17_PASOS.length;
  document.getElementById('chi3-paso-counter').textContent = `Paso ${chi3P17PasoActual+1} / ${total}`;
  document.getElementById('chi3-p17-prev').disabled = chi3P17PasoActual===0;
  document.getElementById('chi3-p17-next').disabled = chi3P17PasoActual===total-1;
  document.getElementById('chi3-p17-contenido').innerHTML =
    `<div class="chi3-paso-card"><div class="chi3-paso-titulo">${paso.titulo}</div><p class="chi3-paso-desc">${paso.desc}</p></div>`;
  chi3P17Modo = paso.modo;
  chi3P17ActualizarTabla();
}
function chi3P17Paso(dir) { chi3P17PasoActual=Math.max(0,Math.min(CHI3_P17_PASOS.length-1,chi3P17PasoActual+dir)); chi3P17Renderizar(); }
function chi3P17Toggle(modo) {
  chi3P17Modo=modo;
  document.querySelectorAll('.chi3-tg-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.chi3-tg-btn[onclick*="${modo}"]`)?.classList.add('active');
  chi3P17ActualizarTabla();
}
function chi3P17ActualizarTabla() {
  const el=document.getElementById('chi3-p17-tabla-display');
  if(el) el.innerHTML=chi3RenderTbl(CHI3_O,CHI3_E,CHI3_FILAS,CHI3_COLS,CHI3_N,chi3P17Modo);
}
async function chi3P17PreguntarTutor() {
  const paso=CHI3_P17_PASOS[chi3P17PasoActual];
  const n3=document.getElementById('chi3-p17-n3')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P17 — Ejemplo Eᵢⱼ]
El estudiante está en el ${paso.titulo}. Modo de tabla visible: ${chi3P17Modo}.
Datos: Oᵢⱼ=${JSON.stringify(CHI3_O)}, Eᵢⱼ=${JSON.stringify(CHI3_E.map(r=>r.map(v=>v.toFixed(2))))}.
Respuesta del estudiante a la pregunta de interpretación (N3) sobre las diferencias O−E: ${n3}
Responde preguntas sobre este paso específico. Si la respuesta N3 solo describe el número (N1) sin interpretar, empuja: ¿qué significa esa diferencia en el contexto de programa y software? No avances al siguiente paso por el estudiante.`;
  await chi3Enviar('p17', ctx, true);
}

/* ── PÁGINA 18 ── */
function chi3P18Render() {
  // Resetear el momento de descubrimiento cada vez que se entra
  const paso1=document.getElementById('chi3-descubre-paso1');
  const paso2=document.getElementById('chi3-descubre-paso2');
  const paso3=document.getElementById('chi3-descubre-paso3');
  const calculo=document.getElementById('chi3-p18-calculo');
  if(paso2) paso2.style.display='none';
  if(paso3) paso3.style.display='none';
  if(calculo) calculo.style.display='none';
  const fb1=document.getElementById('chi3-p18-descubre-fb1');
  if(fb1) fb1.style.display='none';
  const sumaInp=document.getElementById('chi3-p18-suma-dif');
  if(sumaInp) sumaInp.value='';
  const idea=document.getElementById('chi3-p18-idea-cuadrado');
  if(idea) idea.value='';
  // Reset del tutor principal de pág 18
  const mainChat=document.getElementById('chat-chi3-p18');
  if(mainChat) mainChat.innerHTML='';
  setStatusGen('ts-chi3-p18','En espera…');

  // Poblar la lista de diferencias Oᵢⱼ − Eᵢⱼ (sin cuadrado) para el paso 1
  const difsEl=document.getElementById('chi3-p18-difs-display');
  if(difsEl){
    let d='<table class="chi3-tbl" style="font-size:.75rem;"><thead><tr><th>Celda</th><th>Oᵢⱼ</th><th>Eᵢⱼ</th><th>Oᵢⱼ − Eᵢⱼ</th></tr></thead><tbody>';
    CHI3_FILAS.forEach((f,i)=>CHI3_COLS.forEach((c,j)=>{
      const dif=CHI3_O[i][j]-CHI3_E[i][j];
      const signo=dif>0?'+':'';
      d+=`<tr><td>${f}/${c}</td><td>${CHI3_O[i][j]}</td><td>${CHI3_E[i][j].toFixed(2)}</td><td><strong>${signo}${dif.toFixed(2)}</strong></td></tr>`;
    }));
    d+='</tbody></table>';
    difsEl.innerHTML=d;
  }

  // Construir la tabla de cálculo (queda oculta hasta completar el descubrimiento)
  const filas=CHI3_FILAS,cols=CHI3_COLS;
  let h=`<table class="chi3-tbl"><thead><tr><th>Celda</th><th>Oᵢⱼ</th><th>Eᵢⱼ</th><th>(O−E)²/E</th><th>Contribución</th></tr></thead><tbody>`;
  filas.forEach((f,i)=>{
    cols.forEach((c,j)=>{
      const corr=parseFloat(Math.pow(CHI3_O[i][j]-CHI3_E[i][j],2)/CHI3_E[i][j]).toFixed(4);
      h+=`<tr>
        <td>${f} / ${c}</td>
        <td>${CHI3_O[i][j]}</td>
        <td>${CHI3_E[i][j].toFixed(2)}</td>
        <td><input type="number" step="0.0001" class="p5c-cell chi3-p18-cell"
            id="chi3-p18-${i}-${j}" data-correct="${corr}"
            placeholder="?" oninput="chi3P18Actualizar()" style="width:90px;"></td>
        <td id="chi3-p18-contrib-${i}-${j}" class="td-marg">—</td>
      </tr>`;
    });
  });
  h+=`</tbody></table>`;
  const w=document.getElementById('chi3-p18-tabla-wrap');
  if(w) w.innerHTML=h;
  chi3P18Actualizar();
}

// Paso 1 del descubrimiento: el estudiante suma las diferencias y descubre que dan ~0
function chi3P18DescubreSuma() {
  const sumaReal = CHI3_O.reduce((s,r,i)=>s+r.reduce((ss,v,j)=>ss+(v-CHI3_E[i][j]),0),0);
  const ingresado = parseFloat(document.getElementById('chi3-p18-suma-dif')?.value);
  const fb=document.getElementById('chi3-p18-descubre-fb1');
  fb.style.display='block';
  if(isNaN(ingresado)){
    fb.className='prob-feedback parcial';
    fb.textContent='Escribe el resultado de sumar las 6 diferencias (con su signo) antes de comprobar.';
    return;
  }
  // La suma real es ~0 (las diferencias de una tabla siempre suman 0)
  if(Math.abs(ingresado)<0.5){
    fb.className='prob-feedback ok';
    fb.innerHTML='Exacto: la suma da <strong>cero</strong> (o casi). Aunque la tabla claramente se aleja de lo esperado, las diferencias positivas y negativas <em>se cancelan</em>. Ese es el problema que hay que resolver. 👇';
  } else {
    fb.className='prob-feedback parcial';
    fb.innerHTML=`Obtuviste ${ingresado}. Vuelve a sumar con cuidado, respetando los signos (+ y −) de cada diferencia. Fíjate en lo que ocurre cuando juntas las positivas con las negativas.`;
    return;
  }
  // Revelar el paso 2
  const paso2=document.getElementById('chi3-descubre-paso2');
  if(paso2){ paso2.style.display='block'; setTimeout(()=>paso2.scrollIntoView({behavior:'smooth',block:'nearest'}),200); }
}

// Paso 2: el estudiante propone elevar al cuadrado → se abre tutor dedicado al lado.
// El tutor (no el estudiante) decide cuándo la comprensión es suficiente para avanzar:
// cuando lo detecta, escribe la frase-señal "[AVANZAR]" en su respuesta, y el frontend
// la usa para revelar el paso 3 automáticamente (sin botón de autorreporte).
async function chi3P18DescubreIdea() {
  const idea=document.getElementById('chi3-p18-idea-cuadrado')?.value||'(sin responder)';
  // Mostrar el tutor principal de pág 18 (el que ya funciona, debajo de la tabla)
  const panelPrincipal=document.getElementById('chi3-p18-tutor');
  if(panelPrincipal) panelPrincipal.style.display='flex';
  chi3P18Intentos = 1;
  const ctx=`[CONTEXTO P18 — Descubrimiento del cuadrado]
El estudiante acaba de comprobar que sumar las diferencias Oᵢⱼ−Eᵢⱼ da cero porque los signos se cancelan.
Propuesta del estudiante para eliminar el problema de los signos: "${idea}"
Número de intento: ${chi3P18Intentos}`;
  agregarMensajeGen('chat-chi3-p18', '💡 Propuesta sobre los signos: ' + idea, 'user');
  const tid=agregarTypingGen('chat-chi3-p18');
  setStatusGen('ts-chi3-p18','Analizando…');
  const sid=`chi3_p18_${sessionId}`;
  try {
    const res=await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:ctx,session_id:sid})});
    const data=await res.json();
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    if(data.reply) agregarMensajeGen('chat-chi3-p18',data.reply,'tutor');
    _chi3P18EvaluarAvance(data);
  } catch(e){
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    agregarMensajeGen('chat-chi3-p18','Problema de conexión. Intenta de nuevo.','tutor');
  }
  setTimeout(()=>panelPrincipal?.scrollIntoView({behavior:'smooth',block:'nearest'}),200);
}

// Decisión gobernada por código: éxito reportado por el modelo, o techo de 3
// intentos — nunca el modelo decidiendo por su cuenta cuándo "dar por terminada"
// la búsqueda (evita el riesgo de pistas cada vez más obvias / Efecto Topaze).
function _chi3P18EvaluarAvance(data) {
  if (chi3P18DescubrimientoResuelto) return;
  const avanzar = data.avanzar_descubrimiento === true || chi3P18Intentos >= 3;
  if (!avanzar) return;
  chi3P18DescubrimientoResuelto = true;
  const paso3=document.getElementById('chi3-descubre-paso3');
  const calculo=document.getElementById('chi3-p18-calculo');
  if(paso3) paso3.style.display='block';
  if(calculo) calculo.style.display='block';
  setTimeout(()=>paso3?.scrollIntoView({behavior:'smooth',block:'nearest'}),400);
}

async function chi3EnviarPrincipalP18(texto) {
  const sid=`chi3_p18_${sessionId}`;
  agregarMensajeGen('chat-chi3-p18',texto,'user');
  const tid=agregarTypingGen('chat-chi3-p18');
  setStatusGen('ts-chi3-p18','Escribiendo…');
  // Solo cuenta como intento del descubrimiento si aún no se ha resuelto esa parte
  let mensajeAEnviar = texto;
  if (!chi3P18DescubrimientoResuelto) {
    chi3P18Intentos++;
    mensajeAEnviar = `${texto}\n\n[Número de intento: ${chi3P18Intentos}]`;
  }
  try {
    const res=await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:mensajeAEnviar,session_id:sid})});
    const data=await res.json();
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    if(data.reply) agregarMensajeGen('chat-chi3-p18',data.reply,'tutor');
    _chi3P18EvaluarAvance(data);
  } catch(e){
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    agregarMensajeGen('chat-chi3-p18','Problema de conexión.','tutor');
  }
}

function chi3P18Actualizar() {
  // TSD: durante la escritura NO damos veredicto correcto/incorrecto por celda.
  // Solo mostramos la consecuencia aritmética: la contribución que el estudiante ingresó
  // y cómo se va acumulando el χ². El conflicto surge al comparar con la tabla, no por un semáforo.
  let chi2=0;
  document.querySelectorAll('.chi3-p18-cell').forEach(inp=>{
    const v=parseFloat(inp.value);
    const ij = inp.id.replace('chi3-p18-','');
    const contrib=document.getElementById(`chi3-p18-contrib-${ij}`);
    if(!isNaN(v)){
      chi2+=v;
      if(contrib) contrib.textContent=v.toFixed(4);
    } else {
      if(contrib) contrib.textContent='—';
    }
  });
  const bar=document.getElementById('chi3-p18-acum-bar');
  const val=document.getElementById('chi3-p18-acum-val');
  if(val) val.textContent=chi2.toFixed(4);
  if(bar) bar.style.width=`${Math.min(100,chi2/CHI3_CHI2*100).toFixed(1)}%`;
}

function chi3P18Verificar() {
  const inputs=document.querySelectorAll('.chi3-p18-cell');
  let sumaEst=0, vacias=0;
  inputs.forEach(inp=>{
    if(inp.value==='') vacias++;
    else sumaEst+=parseFloat(inp.value)||0;
  });
  const fb=document.getElementById('chi3-p18-feedback');
  fb.style.display='block';
  if(vacias>0){
    fb.className='prob-feedback parcial';
    fb.textContent=`Aún faltan ${vacias} celda(s) por calcular. Completa la contribución de cada celda antes de comparar tu χ².`;
    return;
  }
  // Consecuencia, no veredicto: comparar la suma del estudiante con la esperada
  const diff=Math.abs(sumaEst-CHI3_CHI2);
  if(diff<0.05){
    fb.className='prob-feedback ok';
    fb.innerHTML=`Tu χ² acumulado es <strong>${sumaEst.toFixed(4)}</strong>. Las contribuciones que calculaste son consistentes entre sí y con la tabla. Ahora consulta al tutor sobre qué <em>significa</em> ese número.`;
  } else {
    fb.className='prob-feedback parcial';
    fb.innerHTML=`Tu χ² acumulado da <strong>${sumaEst.toFixed(4)}</strong>. Revisa celda por celda: para cada una, ¿la diferencia (Oᵢⱼ−Eᵢⱼ) al cuadrado, dividida entre Eᵢⱼ, coincide con lo que escribiste? Una de las contribuciones no está cuadrando con las demás.`;
  }
}

async function chi3P18EnviarAlTutor() {
  const inputs=document.querySelectorAll('.chi3-p18-cell');
  let detalle='';
  let todasCorrectas = true, hayVacias = false;
  inputs.forEach(inp=>{
    const val = parseFloat(inp.value);
    const correcto = parseFloat(inp.dataset.correct);
    let veredicto;
    if (inp.value === '' || isNaN(val)) {
      veredicto = 'SIN COMPLETAR'; hayVacias = true; todasCorrectas = false;
    } else if (Math.abs(val - correcto) < 0.011) {
      veredicto = 'CORRECTA';
    } else {
      veredicto = `INCORRECTA (el estudiante puso ${inp.value}; el valor correcto es ${inp.dataset.correct})`;
      todasCorrectas = false;
    }
    detalle+=`  ${inp.id}: ${veredicto}\n`;
  });
  const resumen = todasCorrectas ? 'VEREDICTO GENERAL: todas las contribuciones son correctas.'
    : hayVacias ? 'VEREDICTO GENERAL: hay celdas sin completar.'
    : 'VEREDICTO GENERAL: hay al menos una contribución incorrecta.';
  const q1=document.getElementById('chi3-p18-q1')?.value||'(sin responder)';
  const q2=document.getElementById('chi3-p18-q2')?.value||'(sin responder)';
  const q3=document.getElementById('chi3-p18-q3')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P18 — Calcular χ²]
Oᵢⱼ=${JSON.stringify(CHI3_O)}, Eᵢⱼ=${JSON.stringify(CHI3_E.map(r=>r.map(v=>v.toFixed(2))))}.
χ² correcto = ${CHI3_CHI2.toFixed(4)}.
Contribuciones ingresadas (veredicto ya calculado por el código, no lo recalcules):
${detalle}${resumen}

P1 (¿Por qué elevar al cuadrado?): ${q1}
P2 (¿Qué significa χ²=0?): ${q2}
P3 (N3 — celda de mayor contribución y qué revela): ${q3}
Con base en el veredicto de arriba, analiza los cálculos y las tres respuestas. P1 y P2 son N2 (concepto). P3 es N3 (interpretación). Si P3 solo nombra la celda sin contar la "historia" de la asociación, empuja a interpretar. No des la respuesta directa. No repitas ni verifiques tú mismo los cálculos — ese trabajo ya está hecho.`;
  await chi3Enviar('p18', ctx, true);
}

/* ── PÁGINA 19 ── */
function chi3P19Render() {
  const el=document.getElementById('chi3-p19-tabla-resumen');
  if(!el) return;
  let h=`<table class="chi3-tbl" style="font-size:.75rem;"><thead><tr><th>Celda</th><th>Oᵢⱼ</th><th>Eᵢⱼ</th><th>(O−E)²/E</th></tr></thead><tbody>`;
  CHI3_FILAS.forEach((f,i)=>{CHI3_COLS.forEach((c,j)=>{
    const contrib=Math.pow(CHI3_O[i][j]-CHI3_E[i][j],2)/CHI3_E[i][j];
    h+=`<tr><td>${f}/${c}</td><td>${CHI3_O[i][j]}</td><td>${CHI3_E[i][j].toFixed(2)}</td><td><strong>${contrib.toFixed(4)}</strong></td></tr>`;
  });});
  h+=`<tr class="p5c-total-row"><td colspan="3">χ² total</td><td><strong>${CHI3_CHI2.toFixed(4)}</strong></td></tr>`;
  h+=`</tbody></table>`;
  el.innerHTML=h;
}

async function chi3P19EnviarAlTutor() {
  const txt=document.getElementById('chi3-p19-verbaliza')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P19 — Síntesis Eᵢⱼ y χ²]
El estudiante verbalizó lo aprendido: "${txt}"
χ² del ejemplo = ${CHI3_CHI2.toFixed(4)}.
Evalúa si la verbalización cubre: (1) qué son Eᵢⱼ y qué representan, (2) cómo se calcula χ², (3) qué significa χ²=0 vs χ² grande, (4) la condición Eᵢⱼ≥5.
Si cubre todo hasta N3, habilita mentalmente el avance (responde positivamente). Si falta algo, pide que profundice ese punto específico.`;
  await chi3Enviar('p19', ctx, true);
  // Habilitar botón de continuar tras enviar
  const btn=document.getElementById('btn-p19-next');
  if(btn){btn.style.opacity='1';btn.style.pointerEvents='auto';}
}

/* ── PÁGINA 20 ── */
const CHI3_P20_CASOS = [
  {gl:1,chi2:6.5,desc:'Tabla 2×2 (4 celdas)',vc:3.841},
  {gl:3,chi2:6.5,desc:'Tabla 2×4 (8 celdas)',vc:7.815},
  {gl:5,chi2:6.5,desc:'Tabla 3×3 (9 celdas)',vc:11.07},
];
let chi3P20Revelado = false;

function chi3P20Render() {
  chi3P20Revelado = false;
  chi3P20RenderCasos();
}

function chi3P20RenderCasos() {
  const el=document.getElementById('chi3-p20-casos');
  if(!el) return;
  let h='';
  // Situación de FORMULACIÓN: primero solo gl y χ². El estudiante conjetura
  // dónde hay más evidencia ANTES de ver el valor crítico.
  if(!chi3P20Revelado){
    h+=`<div class="chi3-p20-conjetura-aviso">🔮 <strong>Antes de revelar:</strong> los tres casos tienen el <strong>mismo χ² = 6.5</strong> pero distinto tamaño de tabla. Conjetura: ¿en cuál crees que hay <em>más</em> evidencia de asociación? Anótalo en la reflexión de abajo y luego pulsa "Revelar valores críticos".</div>`;
  }
  h+='<div class="chi3-p20-casos-grid">';
  CHI3_P20_CASOS.forEach((c,i)=>{
    const rechaza=c.chi2>c.vc;
    const claseCard = chi3P20Revelado ? (rechaza?'chi3-caso-rechaza':'chi3-caso-no-rechaza') : 'chi3-caso-oculto';
    h+=`<div class="chi3-caso-card ${claseCard}">
      <div class="chi3-caso-num">Caso ${i+1}</div>
      <div class="chi3-caso-desc">${c.desc}</div>
      <div class="chi3-caso-dato">gl = <strong>${c.gl}</strong></div>
      <div class="chi3-caso-dato">χ² = <strong>${c.chi2}</strong></div>`;
    if(chi3P20Revelado){
      h+=`<div class="chi3-caso-dato">χ²crítico = <strong>${c.vc}</strong></div>
          <div class="chi3-caso-resultado">${rechaza?'✅ Se rechaza H₀':'❌ No se rechaza H₀'}</div>`;
    } else {
      h+=`<div class="chi3-caso-dato chi3-caso-tapado">χ²crítico = <strong>?</strong></div>
          <div class="chi3-caso-resultado chi3-caso-tapado">¿Se rechaza H₀?</div>`;
    }
    h+=`</div>`;
  });
  h+='</div>';
  if(!chi3P20Revelado){
    h+=`<button class="btn-verificar" style="background:var(--gold);color:var(--ink);margin-top:10px;" onclick="chi3P20Revelar()">🔓 Revelar valores críticos</button>`;
  } else {
    h+=`<div class="chi3-p20-revelado-nota">Observa: con el mismo χ²=6.5, el Caso 1 (tabla pequeña) <strong>sí</strong> rechaza H₀, pero los casos con más grados de libertad <strong>no</strong>. A mayor número de celdas, el umbral de evidencia sube. ¿Por qué crees que ocurre esto?</div>`;
  }
  el.innerHTML=h;
}

function chi3P20Revelar() {
  chi3P20Revelado = true;
  chi3P20RenderCasos();
}

function chi3P20Verificar() {
  const gl=parseInt(document.getElementById('chi3-p20-gl')?.value);
  const chi2=parseFloat(document.getElementById('chi3-p20-chi2')?.value);
  const vc=parseFloat(document.getElementById('chi3-p20-vc')?.value);
  const glCorr=2, chi2Corr=parseFloat(CHI3_CHI2.toFixed(3)), vcCorr=5.991;
  let msgs=[];
  // Consecuencias, no veredictos
  if(isNaN(gl)) msgs.push('Aún no calculaste los grados de libertad.');
  else if(gl!==glCorr) msgs.push(`Tienes gl=${gl}. Recuerda: gl=(filas−1)(columnas−1). Con una tabla 2×3, ¿cuánto da?`);
  if(isNaN(chi2)) msgs.push('Falta el χ² que calculaste en la pág. anterior.');
  else if(Math.abs(chi2-chi2Corr)>0.1) msgs.push(`El χ² que registraste (${chi2}) no coincide con el que obtuviste antes (${chi2Corr}). Revísalo.`);
  if(isNaN(vc)) msgs.push('Falta ubicar el valor crítico en la tabla para tu gl.');
  else if(Math.abs(vc-vcCorr)>0.01) msgs.push(`Busca en la tabla la fila de gl=${glCorr}: el valor crítico para α=0.05 está allí.`);

  const wrap=document.getElementById('chi3-p20-casos');
  // Quitar feedback previo
  document.getElementById('chi3-p20-verif-fb')?.remove();
  const fbEl=document.createElement('div');
  fbEl.id='chi3-p20-verif-fb';
  if(msgs.length===0){
    fbEl.className='prob-feedback ok';
    const rechaza=chi2Corr>vcCorr;
    fbEl.innerHTML=`gl=${glCorr}, χ²=${chi2Corr}, valor crítico=${vcCorr}. Como χ² ${rechaza?'>':'<'} valor crítico, ${rechaza?'<strong>se rechaza H₀</strong>: hay evidencia de asociación entre programa y software.':'<strong>no se rechaza H₀</strong>.'} ¿Qué significa esto en el contexto del problema? Coméntalo con el tutor.`;
  } else {
    fbEl.className='prob-feedback parcial';
    fbEl.innerHTML='Revisa:<br>'+msgs.join('<br>');
  }
  wrap.parentNode.insertBefore(fbEl, wrap.nextSibling);
}

async function chi3P20EnviarAlTutor() {
  const reflex=document.getElementById('chi3-p20-reflex')?.value||'(sin responder)';
  const gl=document.getElementById('chi3-p20-gl')?.value||'(vacío)';
  const concl=document.getElementById('chi3-p20-concl')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P20 — gl y Valor Crítico]
Tres casos contrastantes mostrados: gl=1,3,5 con mismo χ²=6.5 y vc=3.841,7.815,11.07.
Reflexión del estudiante sobre los casos: ${reflex}
gl calculado por el estudiante: ${gl} (correcto: 2)
χ² del ejemplo: ${CHI3_CHI2.toFixed(4)}, vc=5.991
Conclusión del estudiante: ${concl}
Evalúa el razonamiento. Si confunde gl con número de celdas o no entiende por qué gl afecta el umbral, devuelve consecuencias. Empuja hacia N3: ¿qué pasaría con el valor crítico si la tabla fuera más grande?`;
  await chi3Enviar('p20', ctx, true);
}

/* ── PÁGINA 21 ── */
let chi3P21PasoActual = 0;
const CHI3_P21_PASOS = [
  {titulo:'Paso 1 — Datos e hipótesis', desc:`Tabla observada (Inglés × Intercambio, N=75):<br>${chi3RenderTbl(CHI3_O2,CHI3_E2,CHI3_FILAS2,CHI3_COLS2,CHI3_N2,'obs')}<br><strong>H₀:</strong> El nivel de inglés y la participación en intercambios son independientes.<br><strong>H₁:</strong> Existe asociación entre ambas variables.`},
  {titulo:'Paso 2 — Verificar supuesto Eᵢⱼ ≥ 5', desc:`Todas las Eᵢⱼ deben ser ≥ 5 para que la prueba sea válida.<br>${chi3RenderTbl(CHI3_O2,CHI3_E2,CHI3_FILAS2,CHI3_COLS2,CHI3_N2,'esp')}<br>¿Hay alguna celda problemática?`},
  {titulo:'Paso 3 — Contribución de cada celda', desc:`(Oᵢⱼ − Eᵢⱼ)² / Eᵢⱼ:<br>${(()=>{let h='<table class="chi3-tbl"><thead><tr><th>Celda</th><th>O</th><th>E</th><th>Contrib.</th></tr></thead><tbody>';CHI3_FILAS2.forEach((f,i)=>CHI3_COLS2.forEach((c,j)=>{const ct=Math.pow(CHI3_O2[i][j]-CHI3_E2[i][j],2)/CHI3_E2[i][j];h+=`<tr><td>${f}/${c}</td><td>${CHI3_O2[i][j]}</td><td>${CHI3_E2[i][j].toFixed(2)}</td><td><strong>${ct.toFixed(4)}</strong></td></tr>`;}));h+='</tbody></table>';return h;})()}`},
  {titulo:'Paso 4 — Estadístico χ²', desc:`χ² = Σ contribuciones = <strong>${CHI3_CHI2_2.toFixed(4)}</strong>`},
  {titulo:'Paso 5 — Grados de libertad', desc:`gl = (filas−1)(columnas−1) = (3−1)(2−1) = <strong>2</strong>`},
  {titulo:'Paso 6 — Comparar con valor crítico', desc:`Para gl=2 y α=0.05, el valor crítico es <strong>5.991</strong>.<br>χ² = ${CHI3_CHI2_2.toFixed(4)} ${CHI3_CHI2_2>5.991?'>':'<'} 5.991<br>Por tanto: <strong>${CHI3_CHI2_2>5.991?'Se rechaza H₀':'No se rechaza H₀'}</strong>.`},
  {titulo:'Paso 7 — Conclusión estadística', desc:`Existe evidencia estadística suficiente (χ²=${CHI3_CHI2_2.toFixed(2)}, gl=2, p<0.05) para concluir que el nivel de inglés y la participación en intercambios <strong>${CHI3_CHI2_2>5.991?'no son independientes (hay asociación)':'son independientes (no hay asociación)'}</strong>.`},
  {titulo:'Paso 8 — Reflexión N4', desc:`Rechazar H₀ no significa que el nivel de inglés <em>cause</em> la participación en intercambios. ¿Qué otras variables podrían explicar esta asociación?`},
];

function chi3P21Init() { chi3P21PasoActual=0; chi3P21Renderizar(); }
function chi3P21Renderizar() {
  const paso=CHI3_P21_PASOS[chi3P21PasoActual];
  const total=CHI3_P21_PASOS.length;
  document.getElementById('chi3-p21-counter').textContent=`Paso ${chi3P21PasoActual+1} / ${total}`;
  document.getElementById('chi3-p21-prev').disabled=chi3P21PasoActual===0;
  document.getElementById('chi3-p21-next').disabled=chi3P21PasoActual===total-1;
  document.getElementById('chi3-p21-contenido').innerHTML=
    `<div class="chi3-paso-card"><div class="chi3-paso-titulo">${paso.titulo}</div><div class="chi3-paso-desc">${paso.desc}</div></div>`;
}
function chi3P21Paso(dir){chi3P21PasoActual=Math.max(0,Math.min(CHI3_P21_PASOS.length-1,chi3P21PasoActual+dir));chi3P21Renderizar();}
async function chi3P21PreguntarTutor(){
  const paso=CHI3_P21_PASOS[chi3P21PasoActual];
  const ctx=`[CONTEXTO P21 — Ejemplo completo] Paso actual: ${paso.titulo}. Datos: N=75, filas=Básico/Intermedio/Avanzado, cols=Sí/No. O=${JSON.stringify(CHI3_O2)}, E=${JSON.stringify(CHI3_E2.map(r=>r.map(v=>v.toFixed(2))))}, χ²=${CHI3_CHI2_2.toFixed(4)}, gl=2, vc=5.991. Responde dudas sobre este paso. Empuja hacia N3/N4.`;
  await chi3Enviar('p21',ctx,true);
}

/* ── PÁGINA 22 ── */
const CHI3_P22_CASOS = [
  {titulo:'Caso 1 — Zapatos y crimen',desc:'Un estudio encontró asociación significativa entre el número de pares de zapatos que posee una persona y su probabilidad de cometer un delito.',variable:'Nivel socioeconómico: las personas de mayor NSE tienen más zapatos Y menor tasa de criminalidad.'},
  {titulo:'Caso 2 — Helado y ahogamientos',desc:'Los datos muestran que las ventas de helado y los ahogamientos en piscinas están asociados (χ² significativo).',variable:'La temperatura: en verano sube el consumo de helado Y el uso de piscinas.'},
  {titulo:'Caso 3 — Internet y esperanza de vida',desc:'Los países con mayor penetración de internet tienen mayor esperanza de vida (asociación muy significativa).',variable:'Nivel de desarrollo económico: determina tanto el acceso a internet como la calidad de salud.'},
];

function chi3P22Render(){
  const el=document.getElementById('chi3-p22-casos');
  if(!el) return;
  let h='';
  CHI3_P22_CASOS.forEach((c,i)=>{
    h+=`<div class="chi3-causa-card">
      <div class="chi3-causa-titulo">${c.titulo}</div>
      <p class="chi3-causa-desc">${c.desc}</p>
      <div class="chi3-causa-q">¿Qué variable oculta podría explicar esta asociación?</div>
      <textarea class="p5d-resp-input" id="chi3-p22-caso-${i}" rows="2" placeholder="Variable oculta posible…"></textarea>
      <div class="chi3-causa-retro" id="chi3-p22-retro-${i}" style="display:none;">💡 ${c.variable}</div>
    </div>`;
  });
  el.innerHTML=h;
}

async function chi3P22EnviarAlTutor(){
  const casos=CHI3_P22_CASOS.map((c,i)=>({caso:c.titulo,respuesta:document.getElementById(`chi3-p22-caso-${i}`)?.value||'(sin responder)'}));
  const q1=document.getElementById('chi3-p22-q1')?.value||'(sin responder)';
  const q2=document.getElementById('chi3-p22-q2')?.value||'(sin responder)';
  const q3=document.getElementById('chi3-p22-q3')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P22 — ¿Asociación = Causalidad? N4]
Respuestas a los tres casos de correlaciones espurias:
${casos.map(c=>`${c.caso}: ${c.respuesta}`).join('\n')}
P1 (¿Cuándo sería irresponsable concluir causalidad?): ${q1}
P2 (¿Qué pasaría con χ² con N=9000?): ${q2}
P3 (¿Qué tipo de estudio para causalidad?): ${q3}
Este es el nivel N4 de Curcio. Evalúa si el estudiante: (1) identifica variables ocultas, (2) distingue asociación de causalidad, (3) comprende el efecto del N en χ², (4) conoce diseños experimentales vs. observacionales. Cuestiona cada punto que esté superficial.`;
  await chi3Enviar('p22',ctx,true);
}

/* ── PÁGINA 23 ── */
function chi3P23Render(){
  const el=document.getElementById('chi3-p23-flujo');
  if(!el) return;
  const pasos=[
    {ico:'📋',txt:'Tabla observada Oᵢⱼ'},
    {ico:'🧮',txt:'Calcular Eᵢⱼ = (fᵢ·×f·ⱼ)/N'},
    {ico:'✅',txt:'Verificar Eᵢⱼ ≥ 5'},
    {ico:'➗',txt:'Calcular (Oᵢⱼ−Eᵢⱼ)²/Eᵢⱼ por celda'},
    {ico:'∑',txt:'Sumar → χ²'},
    {ico:'📐',txt:'gl = (f−1)(c−1)'},
    {ico:'📊',txt:'Comparar χ² con valor crítico'},
    {ico:'📝',txt:'Conclusión estadística'},
    {ico:'🤔',txt:'¿Asociación ≠ Causalidad?'},
  ];
  let h='<div class="chi3-flujo-steps">';
  pasos.forEach((p,i)=>{
    h+=`<div class="chi3-flujo-step"><span class="chi3-flujo-ico">${p.ico}</span><span class="chi3-flujo-txt">${p.txt}</span></div>`;
    if(i<pasos.length-1) h+=`<div class="chi3-flujo-arrow">↓</div>`;
  });
  h+='</div>';
  el.innerHTML=h;
}

async function chi3P23EnviarAlTutor(){
  const txt=document.getElementById('chi3-p23-verbaliza')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P23 — Síntesis Final Chi-cuadrado]
El estudiante verbalizó el proceso completo: "${txt}"
Evalúa si cubre los 9 pasos del flujo completo. Clasifica el nivel de Curcio de la verbalización. Si está en N2/N3, pide que profundice la parte de causalidad o condiciones de aplicación. Si ya está en N4, valida y cierra el capítulo con una pregunta de conexión con la vida real.`;
  await chi3Enviar('p23',ctx,true);
}

/* ── PÁGINA 24 ── */
// Datos: internet × rendimiento, N=120
const CHI3_P24_O = [[14,18,8],[22,16,6],[4,14,18]];
const CHI3_P24_FILAS=['Solo móvil','Fijo en casa','Sin acceso'];
const CHI3_P24_COLS=['Alto','Medio','Bajo'];
const CHI3_P24_N=120;
const CHI3_P24_E=chi3CalcE(CHI3_P24_O,CHI3_P24_FILAS,CHI3_P24_COLS,CHI3_P24_N);
const CHI3_P24_CHI2=CHI3_P24_O.reduce((s,r,i)=>s+r.reduce((ss,v,j)=>ss+Math.pow(v-CHI3_P24_E[i][j],2)/CHI3_P24_E[i][j],0),0);
const CHI3_P24_GL=(CHI3_P24_FILAS.length-1)*(CHI3_P24_COLS.length-1); // 4

function chi3P24Render(){
  const el=document.getElementById('chi3-p24-etapas');
  if(!el) return;
  let h='';
  // Etapa 1: tabla observada
  h+=`<div class="chi3-p24-etapa"><div class="chi3-etapa-titulo">Etapa 1 — Tabla observada</div>${chi3RenderTbl(CHI3_P24_O,CHI3_P24_E,CHI3_P24_FILAS,CHI3_P24_COLS,CHI3_P24_N,'obs')}</div>`;
  // Etapa 2: Eᵢⱼ inputs
  h+=`<div class="chi3-p24-etapa"><div class="chi3-etapa-titulo">Etapa 2 — Calcula Eᵢⱼ = (fᵢ·×f·ⱼ)/N</div><table class="chi3-tbl"><thead><tr><th>↓/→</th>${CHI3_P24_COLS.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  CHI3_P24_FILAS.forEach((f,i)=>{
    h+=`<tr><td>${f}</td>${CHI3_P24_COLS.map((_,j)=>`<td><input type="number" step="0.01" class="p5c-cell chi3-p24-e-cell" id="chi3-p24-e-${i}-${j}" data-correct="${CHI3_P24_E[i][j].toFixed(2)}" placeholder="?" style="width:70px;"></td>`).join('')}</tr>`;
  });
  h+=`</tbody></table><button class="btn-verificar" style="background:var(--moss);margin-top:6px;" onclick="chi3P24VerifE()">✅ Verificar Eᵢⱼ</button><div id="chi3-p24-fb-e" class="prob-feedback" style="display:none;"></div></div>`;
  // Etapa 3: chi2 inputs
  h+=`<div class="chi3-p24-etapa"><div class="chi3-etapa-titulo">Etapa 3 — Calcula (Oᵢⱼ−Eᵢⱼ)²/Eᵢⱼ y χ²</div><table class="chi3-tbl"><thead><tr><th>Celda</th><th>Contrib.</th></tr></thead><tbody>`;
  CHI3_P24_FILAS.forEach((f,i)=>CHI3_P24_COLS.forEach((c,j)=>{
    const corr=Math.pow(CHI3_P24_O[i][j]-CHI3_P24_E[i][j],2)/CHI3_P24_E[i][j];
    h+=`<tr><td>${f}/${c}</td><td><input type="number" step="0.0001" class="p5c-cell chi3-p24-contrib-cell" id="chi3-p24-ct-${i}-${j}" data-correct="${corr.toFixed(4)}" placeholder="?" style="width:100px;"></td></tr>`;
  }));
  h+=`<tr class="p5c-total-row"><td>χ² total</td><td><input type="number" step="0.0001" class="p5c-cell" id="chi3-p24-chi2-total" data-correct="${CHI3_P24_CHI2.toFixed(4)}" placeholder="suma →" style="width:110px;"></td></tr>`;
  h+=`</tbody></table><button class="btn-verificar" style="background:var(--moss);margin-top:6px;" onclick="chi3P24VerifChi()">✅ Verificar χ²</button><div id="chi3-p24-fb-chi" class="prob-feedback" style="display:none;"></div></div>`;
  // Etapa 4: conclusión
  h+=`<div class="chi3-p24-etapa"><div class="chi3-etapa-titulo">Etapa 4 — Conclusión (gl=${CHI3_P24_GL}, α=0.05)</div>
    <p style="font-size:.8rem;">Valor crítico para gl=${CHI3_P24_GL}: <strong>9.488</strong></p>
    <textarea class="p5d-resp-input" id="chi3-p24-concl" rows="3" placeholder="¿Se rechaza H₀? Redacta la conclusión estadística y en lenguaje cotidiano…"></textarea>
  </div>`;
  el.innerHTML=h;
}

function chi3P24VerifE(){
  // TSD: consecuencia, no veredicto cromático. Revisamos coherencia de cada Eᵢⱼ
  // con la regla de que cada fila de Eᵢⱼ debe sumar el marginal de esa fila.
  const fb=document.getElementById('chi3-p24-fb-e');fb.style.display='block';
  let vacias=0;
  CHI3_P24_FILAS.forEach((f,i)=>CHI3_P24_COLS.forEach((c,j)=>{
    if((document.getElementById(`chi3-p24-e-${i}-${j}`)?.value||'')==='') vacias++;
  }));
  if(vacias>0){fb.className='prob-feedback parcial';fb.textContent=`Faltan ${vacias} celda(s) de Eᵢⱼ por calcular.`;return;}
  // Comparar sumas de fila de las Eᵢⱼ ingresadas con los marginales
  const margF=CHI3_P24_O.map(r=>r.reduce((s,v)=>s+v,0));
  let inconsistencias=[];
  CHI3_P24_FILAS.forEach((f,i)=>{
    let rs=0;
    CHI3_P24_COLS.forEach((_,j)=>{rs+=parseFloat(document.getElementById(`chi3-p24-e-${i}-${j}`)?.value)||0;});
    if(Math.abs(rs-margF[i])>0.5) inconsistencias.push(`La fila ${f} de tus Eᵢⱼ suma ${rs.toFixed(1)}, pero el total real de esa fila es ${margF[i]}.`);
  });
  if(inconsistencias.length===0){
    fb.className='prob-feedback ok';
    fb.innerHTML='Tus Eᵢⱼ son coherentes: cada fila suma su marginal correcto. Eso confirma que aplicaste bien la fórmula. Continúa con las contribuciones.';
  } else {
    fb.className='prob-feedback parcial';
    fb.innerHTML='Revisa: '+inconsistencias.join('<br>')+'<br>Recuerda que las Eᵢⱼ de una fila siempre suman el total de esa fila.';
  }
}

function chi3P24VerifChi(){
  const fb=document.getElementById('chi3-p24-fb-chi');fb.style.display='block';
  let sumaEst=0,vacias=0;
  document.querySelectorAll('.chi3-p24-contrib-cell').forEach(inp=>{
    if(inp.value==='') vacias++; else sumaEst+=parseFloat(inp.value)||0;
  });
  if(vacias>0){fb.className='prob-feedback parcial';fb.textContent=`Faltan ${vacias} contribución(es) por calcular.`;return;}
  const tot=document.getElementById('chi3-p24-chi2-total');
  const totEst=parseFloat(tot?.value);
  // Consecuencia 1: ¿la suma manual del total coincide con la suma de las contribuciones?
  if(!isNaN(totEst) && Math.abs(totEst-sumaEst)>0.05){
    fb.className='prob-feedback parcial';
    fb.innerHTML=`Tu χ² total dice <strong>${totEst.toFixed(4)}</strong>, pero al sumar tus propias contribuciones celda por celda da <strong>${sumaEst.toFixed(4)}</strong>. Esas dos cifras deberían coincidir — revisa la suma.`;
    return;
  }
  // Consecuencia 2: comparar con el χ² coherente con la tabla
  const diff=Math.abs(sumaEst-CHI3_P24_CHI2);
  if(diff<0.1){
    fb.className='prob-feedback ok';
    fb.innerHTML=`Tu χ² = <strong>${sumaEst.toFixed(4)}</strong>. Las contribuciones son consistentes con la tabla. Ahora compáralo con el valor crítico para decidir.`;
  } else {
    fb.className='prob-feedback parcial';
    fb.innerHTML=`Tu χ² acumulado da <strong>${sumaEst.toFixed(4)}</strong>. Revisa cada contribución: (Oᵢⱼ−Eᵢⱼ)²/Eᵢⱼ. Alguna celda no está cuadrando con las Eᵢⱼ que ya validaste.`;
  }
}

async function chi3P24EnviarAlTutor(){
  const evaluarCelda = (valStr, correcto) => {
    const val = parseFloat(valStr);
    if (valStr === undefined || valStr === '' || isNaN(val)) return 'SIN COMPLETAR';
    return Math.abs(val - correcto) < 0.011 ? 'CORRECTA' : `INCORRECTA (correcto=${correcto.toFixed(2)})`;
  };
  let eVals='',ctVals='';
  let todoCorrecto = true;
  let primeraCeldaError = null; // la primera celda con error — el foco de la pregunta socrática
  CHI3_P24_FILAS.forEach((f,i)=>CHI3_P24_COLS.forEach((c,j)=>{
    const vE = evaluarCelda(document.getElementById(`chi3-p24-e-${i}-${j}`)?.value, CHI3_P24_E[i][j]);
    const contribCorr = Math.pow(CHI3_P24_O[i][j]-CHI3_P24_E[i][j],2)/CHI3_P24_E[i][j];
    const vCt = evaluarCelda(document.getElementById(`chi3-p24-ct-${i}-${j}`)?.value, contribCorr);
    if (!vE.startsWith('CORRECTA')) { todoCorrecto = false; if (!primeraCeldaError) primeraCeldaError = `Eᵢⱼ[${f}/${c}]: ${vE}`; }
    if (!vCt.startsWith('CORRECTA')) { todoCorrecto = false; if (!primeraCeldaError) primeraCeldaError = `Contribución[${f}/${c}]: ${vCt}`; }
    eVals+=`  E[${f}/${c}]: ${vE}\n`;
    ctVals+=`  (O-E)²/E[${f}/${c}]: ${vCt}\n`;
  }));

  let ctx;
  if (!todoCorrecto) {
    // Fase de corrección numérica: el código decide qué se envía — la conclusión
    // y las preguntas P1/P2 NUNCA llegan al modelo en este tipo de contexto, así
    // que no hay forma de que las mezcle con la corrección aritmética.
    ctx = `[CONTEXTO P24 — Corrección numérica]
Datos: Internet×Rendimiento, N=${CHI3_P24_N}.
Tabla completa (veredicto ya calculado por el código, no lo recalcules):
${eVals}${ctVals}
Celda con error a enfocar en esta pregunta socrática (la primera detectada, no menciones las demás todavía): ${primeraCeldaError}`;
  } else {
    // Fase de evaluación cualitativa: solo se llega aquí cuando TODA la tabla es
    // correcta. Aquí sí se envían conclusión y preguntas de análisis.
    const concl=document.getElementById('chi3-p24-concl')?.value||'(sin responder)';
    const q1=document.getElementById('chi3-p24-q1')?.value||'(sin responder)';
    const q2=document.getElementById('chi3-p24-q2')?.value||'(sin responder)';
    ctx = `[CONTEXTO P24 — Evaluación de la conclusión]
Datos: Internet×Rendimiento, N=${CHI3_P24_N}.
Toda la tabla numérica es correcta (verificado por el código).
χ² correcto=${CHI3_P24_CHI2.toFixed(4)}, gl=${CHI3_P24_GL}, vc=9.488.

Conclusión del estudiante: ${concl}
P1 (causalidad/variable oculta): ${q1}
P2 (implicaciones para política educativa): ${q2}`;
  }
  await chi3Enviar('p24',ctx,true);
}

/* ══════════════════════════════════════════════════════════════
   PÁGINA 25 — TU PROPIO ESTUDIO ESTADÍSTICO
   Flujo: definir problema → subir tabla → explorar + gráfica
          → elegir análisis → tutor IA guiado con datos reales
   Sesión IA: p25_<sessionId>
══════════════════════════════════════════════════════════════ */

// ── Registro de audio ──
AUDIO_MAP['p25'] = { btn:'audio-btn-p25', waves:'audio-waves-p25' };
BOX_TO_AUDIO['chat-p25'] = 'p25';
audioState['p25'] = false;

// ── Estado de la página ──
let p25Datos = {
  contexto: '', pregunta: '', variables: '',
  cols: [], tipos: {}, filas: [], nFilas: 0,
  analisis: null, justif: '',
  interpGrafica: '',
  nombreArchivo: '',
};
let p25Chart = null;

// ── Init al entrar a la página ──
function p25Init() {
  // Resetear estado
  p25Datos = { contexto:'', pregunta:'', variables:'', cols:[], tipos:{}, filas:[], nFilas:0, analisis:null, justif:'', interpGrafica:'', nombreArchivo:'' };
  if(p25Chart){ p25Chart.destroy(); p25Chart=null; }
  // Resetear etapas
  ['p25-etapa1','p25-etapa2','p25-etapa3','p25-etapa4'].forEach((id,i)=>{
    const el=document.getElementById(id);
    if(el) el.style.display = i===0?'block':'none';
  });
  // Resetear tutor
  const chat=document.getElementById('chat-p25');
  if(chat) chat.innerHTML='';
  const panel=document.getElementById('p25-tutor-panel');
  if(panel) panel.style.display='none';
  const ph=document.getElementById('p25-tutor-placeholder');
  if(ph) ph.style.display='flex';
  // Limpiar campos
  ['p25-contexto','p25-pregunta','p25-variables','p25-interp-grafica','p25-justif-analisis'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.querySelectorAll('.p25-anal-btn').forEach(b=>b.classList.remove('selected'));
  const af=document.getElementById('p25-anal-feedback'); if(af) af.style.display='none';
  const jw=document.getElementById('p25-justif-wrap'); if(jw) jw.style.display='none';
  const bb=document.getElementById('p25-btn-tutor'); if(bb) bb.style.display='none';
}

// ── ETAPA 1 → 2 ──
function p25AvanzarEtapa2() {
  const ctx = document.getElementById('p25-contexto')?.value.trim();
  const prg = document.getElementById('p25-pregunta')?.value.trim();
  const vrs = document.getElementById('p25-variables')?.value.trim();
  if(!ctx||!prg||!vrs){
    alert('Por favor completa los tres campos antes de continuar.'); return;
  }
  p25Datos.contexto  = ctx;
  p25Datos.pregunta  = prg;
  p25Datos.variables = vrs;
  document.getElementById('p25-etapa2').style.display='block';
  setTimeout(()=>document.getElementById('p25-etapa2')?.scrollIntoView({behavior:'smooth',block:'nearest'}),200);
}

// ── Leer archivo (CSV o XLSX) ──
function p25LeerArchivo(input) {
  const file = input.files[0];
  if(!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  p25Datos.nombreArchivo = file.name;
  const fb = document.getElementById('p25-upload-feedback');
  fb.style.display='block'; fb.className='prob-feedback parcial';
  fb.textContent='Leyendo archivo…';

  const reader = new FileReader();
  if(ext==='csv'){
    reader.onload = e => {
      try {
        const result = Papa.parse(e.target.result, { header:true, skipEmptyLines:true, dynamicTyping:false });
        p25ProcesarDatos(result.data, result.meta.fields, file.name);
      } catch(err) { fb.className='prob-feedback error'; fb.textContent='Error al leer CSV: '+err.message; }
    };
    reader.readAsText(file, 'UTF-8');
  } else if(ext==='xlsx'||ext==='xls'){
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, {defval:''});
        const cols = Object.keys(data[0]||{});
        p25ProcesarDatos(data, cols, file.name);
      } catch(err) { fb.className='prob-feedback error'; fb.textContent='Error al leer Excel: '+err.message; }
    };
    reader.readAsArrayBuffer(file);
  } else {
    fb.className='prob-feedback error'; fb.textContent='Formato no soportado. Usa CSV o XLSX.';
  }
}

// ── Inferir tipo de columna ──
function p25InferirTipo(col, filas) {
  const vals = filas.map(r=>r[col]).filter(v=>v!==''&&v!=null);
  const numVals = vals.filter(v=>!isNaN(parseFloat(v))&&isFinite(v));
  const unicos = [...new Set(vals)];
  if(numVals.length/vals.length > 0.8 && unicos.length > 8) return 'numérica';
  if(unicos.length <= 20) return 'categórica';
  return 'texto';
}

// ── Procesar datos cargados ──
function p25ProcesarDatos(filas, cols, nombre) {
  const fb = document.getElementById('p25-upload-feedback');
  if(!filas||filas.length===0||!cols||cols.length===0){
    fb.className='prob-feedback error'; fb.textContent='El archivo está vacío o no tiene encabezados.'; return;
  }
  // Inferir tipos
  const tipos = {};
  cols.forEach(c=>{ tipos[c]=p25InferirTipo(c,filas); });
  p25Datos.cols  = cols;
  p25Datos.tipos = tipos;
  p25Datos.filas = filas;
  p25Datos.nFilas = filas.length;

  fb.className='prob-feedback ok';
  fb.textContent=`✅ Tabla cargada: ${filas.length} filas · ${cols.length} columnas — ${nombre}`;

  // Mostrar etapa 3
  document.getElementById('p25-etapa3').style.display='block';
  p25RenderResumen();
  p25RenderPreview();
  p25InicializarSelectores();
  p25ActualizarGrafica();
  setTimeout(()=>document.getElementById('p25-etapa3')?.scrollIntoView({behavior:'smooth',block:'nearest'}),300);
}

// ── Resumen de la tabla ──
function p25RenderResumen() {
  const el=document.getElementById('p25-resumen'); if(!el) return;
  const cats=Object.entries(p25Datos.tipos).filter(([,t])=>t==='categórica').map(([c])=>c);
  const nums=Object.entries(p25Datos.tipos).filter(([,t])=>t==='numérica').map(([c])=>c);
  el.innerHTML=`<div class="p25-resumen-grid">
    <div class="p25-res-item"><span class="p25-res-val">${p25Datos.nFilas}</span><span class="p25-res-lbl">observaciones (N)</span></div>
    <div class="p25-res-item"><span class="p25-res-val">${p25Datos.cols.length}</span><span class="p25-res-lbl">variables</span></div>
    <div class="p25-res-item"><span class="p25-res-val">${cats.length}</span><span class="p25-res-lbl">categóricas</span></div>
    <div class="p25-res-item"><span class="p25-res-val">${nums.length}</span><span class="p25-res-lbl">numéricas</span></div>
  </div>
  <div class="p25-cols-list">${p25Datos.cols.map(c=>`<span class="p25-col-badge p25-col-${p25Datos.tipos[c]==='categórica'?'cat':'num'}">${c} <em>(${p25Datos.tipos[c]})</em></span>`).join('')}</div>`;
}

// ── Vista previa (primeras 5 filas) ──
function p25RenderPreview() {
  const el=document.getElementById('p25-preview-tabla'); if(!el) return;
  const cols=p25Datos.cols; const filas=p25Datos.filas.slice(0,5);
  let h=`<table class="chi3-tbl p25-preview-tbl"><thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  filas.forEach(f=>{ h+=`<tr>${cols.map(c=>`<td>${f[c]??''}</td>`).join('')}</tr>`; });
  h+='</tbody></table>';
  el.innerHTML=h;
}

// ── Inicializar selectores de variables ──
function p25InicializarSelectores() {
  const sel1=document.getElementById('p25-sel-var1');
  const sel2=document.getElementById('p25-sel-var2');
  if(!sel1||!sel2) return;
  const cats=p25Datos.cols.filter(c=>p25Datos.tipos[c]==='categórica');
  const todas=p25Datos.cols;
  sel1.innerHTML=cats.map(c=>`<option value="${c}">${c}</option>`).join('');
  sel2.innerHTML='<option value="">— ninguna —</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

// ── Conteos ──
function p25ContarUna(col){
  const counts={};
  p25Datos.filas.forEach(f=>{ const v=String(f[col]??'(vacío)'); counts[v]=(counts[v]||0)+1; });
  return counts;
}
function p25ContarCruzado(col1,col2){
  const c1vals=[...new Set(p25Datos.filas.map(f=>String(f[col1]??'(vacío)')))].sort();
  const c2vals=[...new Set(p25Datos.filas.map(f=>String(f[col2]??'(vacío)')))].sort();
  const matrix={};
  c1vals.forEach(v1=>{ matrix[v1]={}; c2vals.forEach(v2=>{ matrix[v1][v2]=0; }); });
  p25Datos.filas.forEach(f=>{ const v1=String(f[col1]??'(vacío)'); const v2=String(f[col2]??'(vacío)'); if(matrix[v1]) matrix[v1][v2]=(matrix[v1][v2]||0)+1; });
  return {c1vals,c2vals,matrix};
}

// ── Paleta de colores ──
const P25_COLORS=['#2d4a6e','#5b8db8','#4a7c59','#8ab4a0','#c9a84c','#e8c97a','#7a4a6e','#b48aaa'];

// ── Actualizar gráfica ──
function p25ActualizarGrafica() {
  const v1=document.getElementById('p25-sel-var1')?.value;
  const v2=document.getElementById('p25-sel-var2')?.value;
  const tipo=document.getElementById('p25-sel-tipo')?.value||'bar';
  if(!v1||!p25Datos.filas.length) return;
  const canvas=document.getElementById('p25-canvas'); if(!canvas) return;
  if(p25Chart){ p25Chart.destroy(); p25Chart=null; }

  let cfg;
  if(!v2||(tipo==='bar'||tipo==='pie')){
    const counts=p25ContarUna(v1);
    const labels=Object.keys(counts); const data=Object.values(counts);
    if(tipo==='pie'){
      cfg={type:'pie',data:{labels,datasets:[{data,backgroundColor:P25_COLORS,borderWidth:2}]},
        options:{responsive:true,plugins:{legend:{position:'right'},title:{display:true,text:`Distribución de "${v1}"`}}}};
    } else {
      cfg={type:'bar',data:{labels,datasets:[{label:v1,data,backgroundColor:P25_COLORS[0],borderRadius:4}]},
        options:{responsive:true,plugins:{title:{display:true,text:`Frecuencias de "${v1}"`}},scales:{y:{beginAtZero:true}}}};
    }
  } else if(tipo==='barAgrupado'&&v2){
    const {c1vals,c2vals,matrix}=p25ContarCruzado(v1,v2);
    cfg={type:'bar',
      data:{labels:c1vals,datasets:c2vals.map((v,i)=>({label:v,data:c1vals.map(r=>matrix[r][v]||0),backgroundColor:P25_COLORS[i%P25_COLORS.length],borderRadius:3}))},
      options:{responsive:true,plugins:{title:{display:true,text:`"${v1}" × "${v2}"`}},scales:{x:{stacked:false},y:{beginAtZero:true}}}};
  } else if(tipo==='heatmap'&&v2){
    // Heatmap como barras apiladas con intensidad
    const {c1vals,c2vals,matrix}=p25ContarCruzado(v1,v2);
    cfg={type:'bar',
      data:{labels:c1vals,datasets:c2vals.map((v,i)=>({label:v,data:c1vals.map(r=>matrix[r][v]||0),backgroundColor:P25_COLORS[i%P25_COLORS.length]+'CC',borderRadius:2}))},
      options:{responsive:true,plugins:{title:{display:true,text:`Mapa de calor: "${v1}" × "${v2}"`}},scales:{x:{stacked:true},y:{stacked:true,beginAtZero:true}}}};
  } else {
    const counts=p25ContarUna(v1);
    const labels=Object.keys(counts); const data=Object.values(counts);
    cfg={type:'bar',data:{labels,datasets:[{label:v1,data,backgroundColor:P25_COLORS[0],borderRadius:4}]},
      options:{responsive:true,plugins:{title:{display:true,text:`Frecuencias de "${v1}"`}},scales:{y:{beginAtZero:true}}}};
  }
  p25Chart=new Chart(canvas,cfg);
}

// ── ETAPA 3 → 4 ──
function p25AvanzarEtapa4() {
  const interp=document.getElementById('p25-interp-grafica')?.value.trim();
  if(!interp){ alert('Escribe tu interpretación de la gráfica antes de continuar.'); return; }
  p25Datos.interpGrafica=interp;
  document.getElementById('p25-etapa4').style.display='block';
  setTimeout(()=>document.getElementById('p25-etapa4')?.scrollIntoView({behavior:'smooth',block:'nearest'}),200);
}

// ── Selección de análisis ──
function p25SelAnalisis(tipo) {
  p25Datos.analisis=tipo;
  document.querySelectorAll('.p25-anal-btn').forEach(b=>b.classList.toggle('selected',b.dataset.anal===tipo));
  const fb=document.getElementById('p25-anal-feedback');
  fb.style.display='block'; fb.className='pts-feedback';
  const msgs={
    frecuencias:'Has elegido tabla de frecuencias (1 variable). Antes de que el tutor comente, justifica por qué esa herramienta responde tu pregunta.',
    contingencia:'Has elegido tabla de contingencia (2 variables). Justifica por qué ese análisis es adecuado para tu pregunta.',
    chi2:'Has elegido la prueba chi-cuadrado. Justifica por qué necesitas ir más allá de la contingencia.',
    libre:'Exploración libre. Describe brevemente qué quieres explorar y por qué.',
  };
  fb.textContent=msgs[tipo]||'';
  document.getElementById('p25-justif-wrap').style.display='block';
  document.getElementById('p25-btn-tutor').style.display='block';
}

// ── Construir contexto para el tutor ──
function p25ConstruirContexto() {
  const {contexto,pregunta,variables,cols,tipos,filas,nFilas,analisis,justif,interpGrafica,nombreArchivo}=p25Datos;
  // Calcular distribución de cada columna categórica (conteos) — y de paso, hechos
  // determinísticos que el modelo NO debe inferir por su cuenta (N<30, número de
  // categorías por variable, si existe alguna categórica). Solo la coherencia
  // semántica pregunta↔variable queda como juicio genuino del modelo.
  const catCols=cols.filter(c=>tipos[c]==='categórica');
  let distrib='';
  const numCategoriasPorVar = {};
  catCols.forEach(c=>{
    const counts=p25ContarUna(c);
    const numCats = Object.keys(counts).length;
    numCategoriasPorVar[c] = numCats;
    const resumen=Object.entries(counts).map(([v,n])=>`${v}:${n}`).join(', ');
    distrib+=`  "${c}" → ${numCats} categorías distintas (${resumen})\n`;
  });
  const v1=document.getElementById('p25-sel-var1')?.value;
  const v2=document.getElementById('p25-sel-var2')?.value;

  const hechosTexto = `
HECHOS YA CALCULADOS POR EL CÓDIGO (no los recalcules ni los pongas en duda):
- N < 30 observaciones: ${nFilas < 30 ? 'SÍ' : 'NO'} (N real = ${nFilas})
- ¿Hay al menos una variable categórica en la tabla?: ${catCols.length > 0 ? 'SÍ' : 'NO'}
- Variables con más de 10 categorías distintas: ${Object.entries(numCategoriasPorVar).filter(([,n])=>n>10).map(([c,n])=>`"${c}" (${n} categorías)`).join(', ') || 'ninguna'}
- Variables numéricas/continuas entre las elegidas para graficar: ${[v1,v2].filter(v=>v && tipos[v] && tipos[v]!=='categórica').join(', ') || 'ninguna'}`;

  return `[CONTEXTO P25 — Estudio propio del estudiante]
Archivo: ${nombreArchivo}
N = ${nFilas} observaciones · ${cols.length} variables

Pregunta estadística del estudiante: ${pregunta}
Contexto de los datos: ${contexto}
Variables que el estudiante identificó: ${variables}

Estructura real de la tabla:
${cols.map(c=>`  "${c}" (${tipos[c]})`).join('\n')}

Distribución de variables categóricas:
${distrib||'(sin variables categóricas detectadas)'}
${hechosTexto}

Variable graficada: ${v1}${v2?` × ${v2}`:''}
Interpretación de la gráfica del estudiante: ${interpGrafica}

Herramienta elegida: ${analisis}
Justificación del estudiante: ${justif||'(sin justificación)'}`;
}

// ── Enviar al tutor (primera vez) ──
async function p25EnviarAlTutor() {
  const justif=document.getElementById('p25-justif-analisis')?.value.trim();
  if(!justif){ alert('Escribe tu justificación antes de iniciar el análisis.'); return; }
  p25Datos.justif=justif;
  // Mostrar tutor y ocultar placeholder
  document.getElementById('p25-tutor-panel').style.display='flex';
  document.getElementById('p25-tutor-placeholder').style.display='none';
  const ctx=p25ConstruirContexto();
  agregarMensajeGen('chat-p25','📋 Enviando mi problema y datos al tutor…','user');
  const tid=agregarTypingGen('chat-p25');
  setStatusGen('ts-p25','Analizando tus datos…');
  try {
    const res=await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:ctx,session_id:`p25_${sessionId}`})});
    const data=await res.json();
    quitarTypingGen(tid); setStatusGen('ts-p25','En línea');
    if(data.reply) agregarMensajeGen('chat-p25',data.reply,'tutor');
  } catch(e){
    quitarTypingGen(tid); setStatusGen('ts-p25','En línea');
    agregarMensajeGen('chat-p25','Problema de conexión. Intenta de nuevo.','tutor');
  }
  setTimeout(()=>document.getElementById('p25-tutor-panel')?.scrollIntoView({behavior:'smooth',block:'nearest'}),300);
}

// ── Chat libre p25 ──
async function p25ChatLibre() {
  const inp=document.getElementById('input-p25');
  if(!inp?.value.trim()) return;
  const txt=inp.value.trim(); inp.value='';
  agregarMensajeGen('chat-p25',txt,'user');
  const tid=agregarTypingGen('chat-p25');
  setStatusGen('ts-p25','Escribiendo…');
  try {
    const res=await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:txt,session_id:`p25_${sessionId}`})});
    const data=await res.json();
    quitarTypingGen(tid); setStatusGen('ts-p25','En línea');
    if(data.reply) agregarMensajeGen('chat-p25',data.reply,'tutor');
  } catch(e){
    quitarTypingGen(tid); setStatusGen('ts-p25','En línea');
    agregarMensajeGen('chat-p25','Problema de conexión.','tutor');
  }
}

// ── Toggle fuentes de datos (pág 25) ──
function p25ToggleFuentes() {
  const body = document.getElementById('p25-fuentes-body');
  const chevron = document.getElementById('p25-chevron');
  if (!body || !chevron) return;
  const open = body.style.display === 'block';
  body.style.display = open ? 'none' : 'block';
  chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ── Glosario interactivo pág 1 (Exploración: datos libres vs agrupados) ──
const P1_GLOSARIO = {
  cualitativa: {
    titulo: '🏷️ Variable cualitativa',
    texto: 'Describe una cualidad o categoría, no una cantidad. Sus valores no son números que se puedan sumar o promediar con sentido. Por ejemplo: la bebida favorita (café, té, jugo…), el género, o el tipo de vivienda. Se organiza en categorías, no en un rango numérico.'
  },
  cuantitativa: {
    titulo: '🔢 Variable cuantitativa',
    texto: 'Se expresa mediante números que sí tienen significado matemático: se pueden sumar, promediar o comparar en magnitud. Por ejemplo: la edad, el número de horas de estudio, o el ingreso mensual. Puede ser discreta (valores contables, como el número de hijos) o continua (cualquier valor dentro de un rango, como la estatura).'
  },
  libres: {
    titulo: '📋 Datos libres',
    texto: 'Es la lista completa de observaciones tal como se recolectaron, sin resumir. Por ejemplo: cada respuesta individual de los 40 estudiantes encuestados, una por una. Se usan cuando el número de datos es manejable y se quiere trabajar con el detalle completo antes de resumir.'
  },
  agrupados: {
    titulo: '📦 Datos agrupados',
    texto: 'Es cuando las observaciones ya vienen organizadas en categorías o intervalos, con su conteo correspondiente. Por ejemplo: en vez de ver las 40 respuestas una a una, ya se sabe que "18 prefieren café, 10 té…". Se usan cuando hay muchos datos o cuando la fuente ya entrega la información resumida.'
  }
};
let p1GlosarioActivo = null;

function p1ToggleGlosario(termino, el, panelId) {
  panelId = panelId || 'p1-glosario-panel';
  const panel = document.getElementById(panelId);
  if (!panel) return;
  // Si se hace clic en el mismo término que ya está activo, se cierra
  if (p1GlosarioActivo === termino) {
    panel.classList.remove('activo');
    panel.innerHTML = '';
    p1GlosarioActivo = null;
    document.querySelectorAll('.p1-glosario').forEach(s => s.classList.remove('activo'));
    return;
  }
  const info = P1_GLOSARIO[termino];
  if (!info) return;
  panel.innerHTML = `<strong>${info.titulo}</strong><p>${info.texto}</p>`;
  panel.classList.add('activo');
  p1GlosarioActivo = termino;
  document.querySelectorAll('.p1-glosario').forEach(s => s.classList.remove('activo'));
  el.classList.add('activo');
}

/* ══════════════════════════════════════════════════════════════
   PÁGINA 8 — EXPLORADOR INTERACTIVO DE TIPOS DE FRECUENCIA
   Reemplaza la tirilla de niveles de Curcio (institucionalización
   prematura) por una tabla clickeable donde el estudiante descubre
   por acción qué es frecuencia conjunta, marginal y condicionada.
   Contexto: Género × Actividad extracurricular (Hombres/Mujeres, N=100)
══════════════════════════════════════════════════════════════ */

const CTX_EXP_DATA = {
  filas: ['Hombres', 'Mujeres'],
  cols:  ['Deportes', 'Danza', 'Música'],
  M: [[30, 5, 15], [10, 25, 15]],
  N: 100,
};

let ctxExplorerModo = null; // null | 'condicionada' (segundo clic sobre marginal tras elegir celda)
let ctxExplorerCeldaSel = null; // {i,j} celda conjunta seleccionada para modo condicionada
let ctxExplorerLocked = false; // true solo justo después de clic en celda conjunta, mientras se decide pulsar el botón

function ctxExplorerInit() {
  const wrap = document.getElementById('ctx-explorer-tabla');
  if (!wrap || wrap.dataset.init) { ctxExplorerReset(); return; }
  wrap.dataset.init = '1';

  const { filas, cols, M, N } = CTX_EXP_DATA;
  const filaTot = M.map(r => r.reduce((s,v)=>s+v,0));
  const colTot  = cols.map((_,j) => M.reduce((s,r)=>s+r[j],0));

  let html = '<table class="ctx-exp-tbl"><thead><tr><th></th>';
  cols.forEach((c,j) => { html += `<th class="ctx-exp-margcell" data-tipo="marginal-col" data-idx="${j}">${c}</th>`; });
  html += `<th class="ctx-exp-margcell ctx-exp-total" data-tipo="total">Total</th></tr></thead><tbody>`;

  filas.forEach((f,i) => {
    html += `<tr><th class="ctx-exp-margcell" data-tipo="marginal-fila" data-idx="${i}">${f}</th>`;
    cols.forEach((c,j) => {
      html += `<td class="ctx-exp-cell" data-tipo="conjunta" data-i="${i}" data-j="${j}">${M[i][j]}</td>`;
    });
    html += `<td class="ctx-exp-margcell" data-tipo="marginal-fila" data-idx="${i}">${filaTot[i]}</td></tr>`;
  });

  html += `<tr><th class="ctx-exp-margcell ctx-exp-total" data-tipo="total">Total</th>`;
  cols.forEach((c,j) => { html += `<td class="ctx-exp-margcell" data-tipo="marginal-col" data-idx="${j}">${colTot[j]}</td>`; });
  html += `<td class="ctx-exp-margcell ctx-exp-total" data-tipo="total">${N}</td></tr>`;
  html += '</tbody></table>';

  wrap.innerHTML = html;

  // Delegación de eventos: hover actualiza el panel normalmente (comportamiento que gustaba),
  // EXCEPTO cuando está "bloqueado" (justo tras clic en una celda conjunta, mientras el
  // estudiante decide pulsar el botón de condicionada). El clic siempre funciona y actualiza.
  wrap.querySelectorAll('[data-tipo]').forEach(el => {
    el.addEventListener('mouseenter', () => { if (!ctxExplorerLocked) ctxExplorerMostrar(el); });
    el.addEventListener('click', () => ctxExplorerMostrar(el, true));
  });
}

function ctxExplorerReset() {
  const panel = document.getElementById('ctx-explorer-panel');
  if (panel) panel.innerHTML = `<div class="ctx-ep-icon">👆</div><div class="ctx-ep-text">Toca una celda de la tabla para descubrir qué tipo de frecuencia contiene.</div>`;
  document.querySelectorAll('#ctx-explorer-tabla .ctx-exp-cell, #ctx-explorer-tabla .ctx-exp-margcell').forEach(el => el.classList.remove('ctx-hl','ctx-hl-sec'));
  ctxExplorerModo = null;
  ctxExplorerCeldaSel = null;
}

function ctxExplorerMostrar(el, esClick) {
  const tipo = el.dataset.tipo;
  const wrap = document.getElementById('ctx-explorer-tabla');
  const panel = document.getElementById('ctx-explorer-panel');
  if (!wrap || !panel) return;

  // Bloqueo: solo se activa al hacer CLIC en una celda conjunta (aparece el botón de
  // condicionada). Cualquier otro clic (marginal, total, u otra conjunta) libera el bloqueo.
  if (esClick) ctxExplorerLocked = (tipo === 'conjunta');

  // Limpiar resaltados previos
  wrap.querySelectorAll('.ctx-exp-cell, .ctx-exp-margcell').forEach(e => e.classList.remove('ctx-hl','ctx-hl-sec'));

  const { filas, cols, M, N } = CTX_EXP_DATA;

  if (tipo === 'conjunta') {
    const i = +el.dataset.i, j = +el.dataset.j;
    el.classList.add('ctx-hl');
    panel.innerHTML = `
      <div class="ctx-ep-tag">Frecuencia Conjunta</div>
      <div class="ctx-ep-formula">f<sub>ij</sub> = ${M[i][j]}</div>
      <p class="ctx-ep-desc">Es el valor exacto donde se cruzan <strong>${filas[i]}</strong> y <strong>${cols[j]}</strong>: cuántas personas pertenecen a ambas categorías al mismo tiempo.</p>
      ${esClick ? `<p class="ctx-ep-hint">👉 Este número, comparado con distintos totales, cuenta historias diferentes.</p><button class="ctx-ep-btn ctx-ep-btn-pulse" onclick="ctxExplorerVerCondicionada(${i},${j})">🔗 Haz clic para comparar con los totales</button>` : ''}
    `;
    ctxExplorerCeldaSel = { i, j };
  } else if (tipo === 'marginal-fila' || tipo === 'marginal-col') {
    const idx = +el.dataset.idx;
    const esFila = tipo === 'marginal-fila';
    const nombre = esFila ? filas[idx] : cols[idx];
    const valor = esFila ? M[idx].reduce((s,v)=>s+v,0) : cols.map((_,j)=>M.reduce((s,r)=>s+r[j],0))[idx];
    el.classList.add('ctx-hl');
    // Resaltar toda la fila o columna asociada
    wrap.querySelectorAll(`.ctx-exp-cell[data-${esFila?'i':'j'}="${idx}"]`).forEach(c => c.classList.add('ctx-hl-sec'));
    panel.innerHTML = `
      <div class="ctx-ep-tag ctx-ep-tag-marg">Frecuencia Marginal</div>
      <div class="ctx-ep-formula">${esFila ? `f<sub>${idx===0?'H':'M'}·</sub>` : `f<sub>·${idx+1}</sub>`} = ${valor}</div>
      <p class="ctx-ep-desc">Es el total de <strong>${nombre}</strong>, sumando todas sus celdas. Se llama "marginal" porque queda en el <em>margen</em> (borde) de la tabla.</p>
    `;
  } else if (tipo === 'total') {
    el.classList.add('ctx-hl');
    panel.innerHTML = `
      <div class="ctx-ep-tag ctx-ep-tag-total">Total General</div>
      <div class="ctx-ep-formula">N = ${N}</div>
      <p class="ctx-ep-desc">Es la suma de todas las frecuencias marginales — el total de personas encuestadas.</p>
    `;
  }
}

// Al hacer clic en "¿Y si la comparo con un total?" desde una celda conjunta,
// se revela cómo la MISMA celda produce distintas frecuencias condicionadas
// según el marginal elegido como referencia.
function ctxExplorerVerCondicionada(i, j) {
  ctxExplorerLocked = false; // liberar el bloqueo: el hover vuelve a funcionar normalmente
  const { filas, cols, M, N } = CTX_EXP_DATA;
  const panel = document.getElementById('ctx-explorer-panel');
  if (!panel) return;
  const filaTot = M[i].reduce((s,v)=>s+v,0);
  const colTot  = cols.map((_,jj)=>M.reduce((s,r)=>s+r[jj],0))[j];
  const pTotal  = (M[i][j]/N*100).toFixed(1);
  const pFila   = (M[i][j]/filaTot*100).toFixed(1);
  const pCol    = (M[i][j]/colTot*100).toFixed(1);

  panel.innerHTML = `
    <div class="ctx-ep-tag ctx-ep-tag-cond">Frecuencia Condicionada</div>
    <p class="ctx-ep-desc">La celda <strong>${filas[i]} ∩ ${cols[j]}</strong> (${M[i][j]}) cambia de significado según con qué total la compares:</p>
    <div class="ctx-ep-cond-row"><span class="ctx-ep-cond-lbl">Sobre el total (N=${N})</span><span class="ctx-ep-cond-val">${pTotal}%</span></div>
    <div class="ctx-ep-cond-row"><span class="ctx-ep-cond-lbl">Sobre la fila ${filas[i]} (${filaTot})</span><span class="ctx-ep-cond-val">${pFila}%</span></div>
    <div class="ctx-ep-cond-row"><span class="ctx-ep-cond-lbl">Sobre la columna ${cols[j]} (${colTot})</span><span class="ctx-ep-cond-val">${pCol}%</span></div>
    <p class="ctx-ep-desc" style="margin-top:6px;">El mismo dato (${M[i][j]}) cuenta tres historias distintas — por eso la frecuencia condicionada siempre depende de <em>a qué total la refieres</em>.</p>
  `;
}

/* ══════════════════════════════════════════════════════════════
   PÁGINA 3 — EXPLORACIÓN PREVIA: datos libres antes de la tabla
   Situación a-didáctica: el estudiante enfrenta las 40 respuestas
   sin procesar y experimenta la dificultad real de leerlas antes
   de que se le ofrezca ninguna herramienta de resumen. Solo tras
   completar esta exploración se revela la actividad guiada de
   construcción de la tabla (activity-layout + tutor).
══════════════════════════════════════════════════════════════ */

// Secuencia fija (no aleatoria en cada carga) de las 40 respuestas, respetando
// los conteos reales: Café Negro=18, Té/Aromática=10, Jugo Natural=8, Energizante=4.
const P3_DATOS_LIBRES = [
  ['Café Negro','Jugo Natural','Café Negro','Té / Aromática','Café Negro','Café Negro','Jugo Natural','Té / Aromática','Café Negro','Café Negro'],
  ['Bebida Energizante','Café Negro','Jugo Natural','Café Negro','Bebida Energizante','Té / Aromática','Té / Aromática','Jugo Natural','Té / Aromática','Té / Aromática'],
  ['Café Negro','Jugo Natural','Café Negro','Té / Aromática','Bebida Energizante','Café Negro','Café Negro','Café Negro','Jugo Natural','Café Negro'],
  ['Jugo Natural','Bebida Energizante','Té / Aromática','Café Negro','Jugo Natural','Café Negro','Café Negro','Té / Aromática','Café Negro','Té / Aromática'],
];

function p3RenderLibresGrid() {
  const el = document.getElementById('p3-libres-grid');
  if (!el || el.dataset.init) return;
  el.dataset.init = '1';
  let html = '';
  let n = 1;
  P3_DATOS_LIBRES.forEach(col => {
    html += '<div class="p3-libres-col">';
    col.forEach(val => {
      html += `<div class="p3-libres-item"><span class="p3-libres-num">${n}</span><span class="p3-libres-val">${val}</span></div>`;
      n++;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

// Prepara la página 3 al entrar: si el estudiante ya completó la exploración
// en una visita previa (chatFreqUnifIniciado === true), va directo a la actividad.
// Si no, muestra la exploración de datos libres primero.
function p3PrepararPagina() {
  p3RenderLibresGrid();
  const exploracion = document.getElementById('p3-exploracion');
  const actividad    = document.getElementById('p3-activity-wrap');
  if (chatFreqUnifIniciado) {
    if (exploracion) exploracion.style.display = 'none';
    if (actividad)   actividad.style.display = 'grid';
  } else {
    if (exploracion) exploracion.style.display = 'block';
    if (actividad)   actividad.style.display = 'none';
  }
}

// Paso 1 → 2: el estudiante debe escribir su conclusión antes de ver el comentario de transición
function p3ExploracionContinuar1() {
  const resp = document.getElementById('p3-exp-respuesta');
  if (!resp || !resp.value.trim()) {
    alert('Escribe tu conclusión antes de continuar — no hay respuesta correcta o incorrecta, es tu primera impresión sobre los datos.');
    return;
  }
  const btn1 = document.getElementById('p3-exp-btn1');
  if (btn1) { btn1.style.display = 'none'; }
  const comentario = document.getElementById('p3-exp-comentario');
  if (comentario) {
    comentario.style.display = 'block';
    setTimeout(() => comentario.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);
  }
}

// Paso 2 → actividad: revela la construcción guiada de la tabla e inicia el tutor
function p3ExploracionContinuar2() {
  const exploracion = document.getElementById('p3-exploracion');
  const actividad    = document.getElementById('p3-activity-wrap');
  if (exploracion) exploracion.style.display = 'none';
  if (actividad)   actividad.style.display = 'grid';
  if (!chatFreqUnifIniciado) {
    chatFreqUnifIniciado = true;
    renderizarP3Tabla();
    inicializarChatFreqUnif();
  }
  setTimeout(() => actividad?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
}
