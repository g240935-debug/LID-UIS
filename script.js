/* ═══════════════════════════════════════════════════════
   LID — script.js
   Conexión al backend: https://lid-uis.onrender.com/api/chat
   No modificar URL_BACKEND sin actualizar el servidor.

   MAPA DE PÁGINAS:
   0  → Portada 
   1  → Cap I · Presentación
   2  → Cap I · Actividad: frec. absoluta + relativa   (IA: freq_A_*)
   3  → Cap I · Actividad: Curcio N3/N4               (IA: freq_B_*)
   4  → Cap I · Actividad: frec. acumuladas           (IA: freq_C_* + freq_D_*)
   5  → Cap I · Síntesis
   6  → Cap II · Presentación
   7  → Cap II · Actividad tablas contingencia        (IA: default)
   8  → Cap II · Síntesis
   9  → Cap III · Formas parciales
   10 → Cap III · Actividad IA                        (IA: cap3_*)
   11 → Cap IV · Ejemplos dinámicos
   12 → Cap IV · Formulación (Problemas A)
   13 → Cap IV · Validación (Problemas B)
   14 → Cap V  · Exploración libre chi                (IA: chi_*)
═══════════════════════════════════════════════════════ */

const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';
let sessionId = localStorage.getItem('lid_uid');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('lid_uid', sessionId);
}

// ── Estado global ──
let graficoActual  = null;
let vistaActual    = 'tabla';
let paginaActual   = 0;

// Flags de inicialización por tutor
let chatCap2Iniciado   = false;  // pág 7
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
const ORDEN_PAGINAS = [0,1,3,5,'5b','5c','5d',6,7,8,9,10,11,12,13,14,'14b',15,16,17,18,19,20,21,22,23,24,25];

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

  // ── Inicialización de tutores al llegar a cada página ──

  // Cap I — Actividad unificada (pág 3): construye tabla completa en un solo chat
  if (n === 3 && !chatFreqUnifIniciado) {
    chatFreqUnifIniciado = true;
    setTimeout(() => { renderizarP3Tabla(); inicializarChatFreqUnif(); }, 400);
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

  // Cap III — Formas parciales con IA
  if (n === 10 && !chatCap3Iniciado) {
    chatCap3Iniciado = true;
    setTimeout(inicializarChatCap3, 400);
  }

  // Cap V — Exploración chi
  if (n === 14 && !chatChiIniciado) {
    chatChiIniciado = true;
    setTimeout(inicializarTutorChi, 400);
  }

  // Cap III — Chi-cuadrado (págs 15-24)
  if (n === 16) setTimeout(chi3P16Render, 300);
  if (n === 17) setTimeout(chi3P17Init,   300);
  if (n === 18) setTimeout(chi3P18Render, 300);
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
      _p3DetectarFaseEnRespuesta(data.reply);
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
      _p3DetectarFaseEnRespuesta(data.reply);
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
      actualizarFaseCap2(data.reply);
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
      actualizarFaseCap2(data.reply);
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
      if (!box) return;
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
    }
  } catch (err) { console.error(`Error al recuperar historial ${idSesion}:`, err); }
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

  const datasets = filas.map((fila, i) => ({
    label: fila,
    data:  matriz[i].map((val, j) => parseFloat(String(calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N)).replace('%',''))),
    backgroundColor: ['rgba(26,58,90,.8)','rgba(46,107,79,.8)','rgba(200,168,75,.8)'][i],
    borderRadius: 3
  }));

  ejGraficoActual = new Chart(ctx, {
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
  });
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
        html += `<td><input type="number" step="any" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${valorCorrecto}" placeholder="?"></td>`;
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
      'De quienes usan Bicicleta, la mitad llega Siempre a tiempo.',
      '10 estudiantes van A pie y llegan A veces.',
      'Solo 3 estudiantes van A pie y Nunca llegan a tiempo.',
      'En total, 24 estudiantes llegan Siempre a tiempo.'
    ],
    pregunta: '¿Qué medio de transporte se asocia con mejor puntualidad?',
    filas: ['Bus','Bicicleta','A pie'], columnas: ['Siempre','A veces','Nunca'],
    solucion: [[10,14,6],[12,8,5],[2,10,3]], respuestaCorrecta: 'fila', N: 90,
    preguntas: [
      {
        id: 'pB0-q1', tipo: 'condicional',
        badge: '% por fila', color: 'var(--moss)',
        texto: 'Calcula el porcentaje de puntualidad "Siempre" dentro de cada medio de transporte. ¿Cuál tiene la proporción más alta? ¿Por qué no es suficiente comparar los conteos absolutos?',
        claves: ['bicicleta','40%','48%','33%','proporciones','grupos de distinto tamaño','base distinta'],
        retro: 'Bicicleta: 12/25 = 48%, Bus: 10/30 = 33%, A pie: 2/35 ≈ 6%. Los absolutos engañan si los grupos tienen distinto tamaño. Bicicleta tiene menor cantidad total pero mejor proporción de puntualidad.'
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
      'El 40% de los estudiantes de Física usa R.',
      '8 estudiantes de Estadística usan Python.',
      'Solo 2 estudiantes de Matemáticas usan SPSS.',
      'En total, 22 estudiantes usan Python.'
    ],
    pregunta: 'Dentro de cada programa, ¿cuál es el software más usado?',
    filas: ['Matemáticas','Física','Estadística'], columnas: ['R','Python','SPSS'],
    solucion: [[12,11,2],[6,6,3],[4,8,8]], respuestaCorrecta: 'fila', N: 60,
    preguntas: [
      {
        id: 'pB1-q1', tipo: 'condicional',
        badge: '% por fila', color: 'var(--moss)',
        texto: 'Compara el perfil de software de Matemáticas versus Estadística usando % por fila. ¿En qué son más diferentes? ¿Qué podría explicar esa diferencia desde el contexto de cada disciplina?',
        claves: ['estadística usa más python','estadística spss','matemáticas prefiere r','disciplina','currículum','contexto','herramientas del área'],
        retro: 'Matemáticas: R 48%, Python 44%, SPSS 8%. Estadística: R 20%, Python 40%, SPSS 40%. La diferencia en SPSS es enorme — Estadística lo usa más quizás porque su currículo lo incluye explícitamente. El contexto disciplinar explica el patrón.'
      },
      {
        id: 'pB1-q2', tipo: 'marginal',
        badge: 'Marginal', color: 'var(--navy)',
        texto: 'Python lo usan 22 de 60 estudiantes (37%). ¿Eso significa que es el software más popular entre los tres programas? Usa las frecuencias marginales de columna para justificar tu respuesta.',
        claves: ['r tiene más','r es el más','marginal','total columna','37%','r 22','r tiene 22','no es el más popular'],
        retro: 'Marginal R: 12+6+4 = 22, Python: 11+6+8 = 25, SPSS: 2+3+8 = 13. Python (25) supera a R (22) en el total, pero la diferencia es mínima. La marginal de columna revela el uso global, independiente del programa.'
      },
      {
        id: 'pB1-q3', tipo: 'N3',
        badge: 'N3 · Predicción', color: 'var(--gold)',
        texto: 'Si la UIS abriera un nuevo programa de Ciencia de Datos, ¿qué distribución de software esperarías? Justifica tu predicción con base en los patrones que observas en la tabla.',
        claves: ['python','datos','tendencia','similar a estadística','predominaría python','predicción','patrón','basado en'],
        retro: 'Es razonable predecir un perfil similar a Estadística o con mayor peso en Python, dado que la Ciencia de Datos tiene fuerte orientación a programación. Esta es una lectura N3: usar los datos para extrapolar más allá de lo observado.'
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
}

function _renderizarPreguntasB(p) {
  const list = document.getElementById('probB-preguntas-list');
  if (!list) return;
  list.innerHTML = p.preguntas.map((q, i) => `
    <div class="p5d-pregunta-card">
      <div class="p5d-preg-badge" style="background:${q.color}">${q.badge}</div>
      <p class="p5d-preg-texto"><strong>Pregunta ${i+1}:</strong> ${q.texto}</p>
      <textarea class="p5d-resp-input" id="${q.id}" rows="3"
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
      html += `<td><input type="number" step="any" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${valorCorrecto}" placeholder="?"></td>`;
    });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });
  html += '<tr><td>Total col</td>';
  totalesCol.forEach(tc => { html += `<td class="td-marg">${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td class="td-marg">${tipo === 'absoluta' ? N : '100%'}</td></tr></tbody></table>`;
  const w = document.getElementById('probB-tabla-wrapper');
  if (w) w.innerHTML = html;
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

function renderizarP3Tabla() {
  const inner = document.getElementById('p3-tabla-inner');
  if (!inner) return;
  const { fi, hi, Fi, Hi } = p3Columnas;

  let html = '<table><thead><tr><th>Bebida</th>';
  if (fi) html += '<th>fᵢ</th>';
  if (hi) html += '<th class="col-nueva col-hi">fᵣ = fᵢ/N</th>';
  if (Fi) html += '<th class="col-nueva col-Fi">Fᵢ (acum.)</th>';
  if (Hi) html += '<th class="col-nueva col-Hi">Fᵣ (acum.)</th>';
  html += '</tr></thead><tbody>';

  P3_DATA.forEach(row => {
    html += `<tr><td>${row.bebida}</td>`;
    if (fi) html += `<td>${row.fi}</td>`;
    if (hi) html += `<td class="col-hi">${row.hi.toFixed(2)}</td>`;
    if (Fi) html += `<td class="col-Fi">${row.Fi}</td>`;
    if (Hi) html += `<td class="col-Hi">${row.Hi.toFixed(2)}</td>`;
    html += '</tr>';
  });

  // Fila total
  html += '<tr class="freq-total-row"><td><strong>Total</strong></td>';
  if (fi) html += '<td><strong>40</strong></td>';
  if (hi) html += '<td class="col-hi"><strong>1.00</strong></td>';
  if (Fi) html += '<td class="col-Fi"><strong>40</strong></td>';
  if (Hi) html += '<td class="col-Hi"><strong>1.00</strong></td>';
  html += '</tr></tbody></table>';

  inner.innerHTML = html;

  // Actualizar badges de progreso
  _p3ActualizarBadges();
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

let ejfModoActual    = 'completa';   // 'completa' | 'personalizada'
let ejfVistaActual   = 'tabla';      // 'tabla' | 'grafico'
let ejfGraficoActual = 'barras';     // 'barras' | 'pie' | 'acum'
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
  ejfActualizarVista();
}

function ejfCambiarModo(modo) {
  ejfModoActual = modo;
  document.getElementById('ejf-btn-completa').classList.toggle('active', modo === 'completa');
  document.getElementById('ejf-btn-personalizada').classList.toggle('active', modo === 'personalizada');
  const panel = document.getElementById('ejf-custom-panel');
  if (panel) panel.style.display = modo === 'personalizada' ? 'block' : 'none';
  ejfActualizarVista();
}

function ejfCambiarVista(vista) {
  ejfVistaActual = vista;
  document.getElementById('ejf-vbtn-tabla').classList.toggle('active', vista === 'tabla');
  document.getElementById('ejf-vbtn-grafico').classList.toggle('active', vista === 'grafico');
  const tablaArea   = document.getElementById('ejf-tabla-area');
  const graficoArea = document.getElementById('ejf-grafico-area');
  if (tablaArea)   tablaArea.style.display   = vista === 'tabla'   ? 'block' : 'none';
  if (graficoArea) graficoArea.style.display = vista === 'grafico' ? 'block' : 'none';
  if (vista === 'grafico') ejfRenderizarGrafico();
}

function ejfCambiarGrafico(tipo) {
  ejfGraficoActual = tipo;
  ['barras','pie','acum'].forEach(t => {
    document.getElementById(`ejf-gtab-${t}`)?.classList.toggle('active', t === tipo);
  });
  ejfRenderizarGrafico();
}

function _ejfGetColumnas() {
  if (ejfModoActual === 'completa') return { fi: true, hi: true, Fi: true, Hi: true };
  return {
    fi: document.getElementById('ejf-chk-fi')?.checked ?? true,
    hi: document.getElementById('ejf-chk-hi')?.checked ?? false,
    Fi: document.getElementById('ejf-chk-Fi')?.checked ?? false,
    Hi: document.getElementById('ejf-chk-Hi')?.checked ?? false,
  };
}

function _ejfGetFilas() {
  if (ejfModoActual === 'completa') return EJF_DATA;
  const chks = document.querySelectorAll('.ejf-cat-chk');
  return EJF_DATA.filter((_, i) => {
    const chk = document.querySelector(`.ejf-cat-chk[data-idx="${i}"]`);
    return chk ? chk.checked : true;
  });
}

function ejfActualizarVista() {
  if (ejfVistaActual === 'tabla') ejfRenderizarTabla();
  else ejfRenderizarGrafico();
}

function ejfRenderizarTabla() {
  const cols = _ejfGetColumnas();
  const filas = _ejfGetFilas();
  const wrapper = document.getElementById('ejf-tabla-wrapper');
  const titleEl = document.getElementById('ejf-tabla-title');
  if (!wrapper) return;

  // Titulo
  const colNames = [];
  if (cols.fi) colNames.push('fᵢ');
  if (cols.hi) colNames.push('fᵣ');
  if (cols.Fi) colNames.push('Fᵢ');
  if (cols.Hi) colNames.push('Fᵣ');
  if (titleEl) titleEl.textContent = ejfModoActual === 'completa'
    ? 'Tabla de frecuencias completa — Bebidas para estudiar (N = 40)'
    : `Vista personalizada: ${colNames.join(', ')} — ${filas.length} categoría(s)`;

  let html = '<table><thead><tr><th>Bebida</th>';
  if (cols.fi) html += '<th>fᵢ</th>';
  if (cols.hi) html += '<th class="ejf-th-hi">fᵣ</th>';
  if (cols.Fi) html += '<th class="ejf-th-Fi">Fᵢ</th>';
  if (cols.Hi) html += '<th class="ejf-th-Hi">Fᵣ</th>';
  html += '</tr></thead><tbody>';

  filas.forEach(row => {
    html += `<tr><td>${row.bebida}</td>`;
    if (cols.fi) html += `<td>${row.fi}</td>`;
    if (cols.hi) html += `<td class="ejf-td-hi">${row.hi.toFixed(2)}</td>`;
    if (cols.Fi) html += `<td class="ejf-td-Fi">${row.Fi}</td>`;
    if (cols.Hi) html += `<td class="ejf-td-Hi">${row.Hi.toFixed(2)}</td>`;
    html += '</tr>';
  });

  // Totales
  const totFi = filas.reduce((s, r) => s + r.fi, 0);
  const totHi = filas.reduce((s, r) => s + r.hi, 0);
  html += '<tr class="ejf-total-row"><td><strong>Total</strong></td>';
  if (cols.fi) html += `<td><strong>${totFi}</strong></td>`;
  if (cols.hi) html += `<td class="ejf-td-hi"><strong>${totHi.toFixed(2)}</strong></td>`;
  if (cols.Fi) html += `<td class="ejf-td-Fi"><strong>${filas[filas.length-1]?.Fi ?? '—'}</strong></td>`;
  if (cols.Hi) html += `<td class="ejf-td-Hi"><strong>${filas[filas.length-1]?.Hi?.toFixed(2) ?? '—'}</strong></td>`;
  html += '</tr></tbody></table>';

  wrapper.style.opacity = '0';
  setTimeout(() => {
    wrapper.innerHTML  = html;
    wrapper.style.opacity = '1';
    wrapper.style.transition = 'opacity .2s ease';
  }, 100);

  // Info bar
  const info = document.getElementById('ejf-info-text');
  if (info) {
    if (ejfModoActual === 'completa') {
      info.textContent = 'Tabla completa con las 4 frecuencias. Cambia a "Vista personalizada" para explorar columnas por separado.';
    } else if (colNames.length === 0) {
      info.textContent = '⚠️ Selecciona al menos una columna para mostrar.';
    } else {
      const mensajes = {
        fi: 'fᵢ: conteo directo de observaciones en cada categoría.',
        hi: 'fᵣ = fᵢ/N: proporción de cada categoría respecto al total.',
        Fi: 'Fᵢ: suma acumulada de frecuencias absolutas.',
        Hi: 'Fᵣ = Fᵢ/N: proporción acumulada hasta la categoría i.',
      };
      info.textContent = Object.entries(mensajes).filter(([k]) => cols[k]).map(([,v]) => v).join('  |  ');
    }
  }
}

function ejfRenderizarGrafico() {
  const ctx = document.getElementById('ejf-canvas')?.getContext('2d');
  if (!ctx) return;
  if (ejfChart) { ejfChart.destroy(); ejfChart = null; }

  const filas = _ejfGetFilas();
  const labels = filas.map(r => r.bebida);
  const tipo = ejfGraficoActual;

  const COLORES = ['rgba(26,58,90,.85)','rgba(46,107,79,.85)','rgba(200,168,75,.85)','rgba(91,141,184,.85)'];

  let config;
  if (tipo === 'barras') {
    config = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Frecuencia absoluta (fᵢ)',
          data: filas.map(r => r.fi),
          backgroundColor: filas.map((_,i) => COLORES[i % COLORES.length]),
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Frecuencia Absoluta por Bebida', font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'JetBrains Mono', size: 10 } } },
          x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 10 } } }
        },
        animation: { duration: 500, easing: 'easeOutQuart' }
      }
    };
  } else if (tipo === 'pie') {
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
          title: { display: true, text: 'Frecuencia Relativa (fᵣ) — Pastel', font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
        },
        animation: { duration: 500 }
      }
    };
  } else {
    // Acumulada (línea)
    config = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Fᵢ (abs. acumulada)',
            data: filas.map(r => r.Fi),
            borderColor: 'rgba(26,58,90,1)',
            backgroundColor: 'rgba(26,58,90,.08)',
            fill: true, tension: .3, pointRadius: 5,
          },
          {
            label: 'Fᵣ×40 (rel. acumulada ×N)',
            data: filas.map(r => +(r.Hi * 40).toFixed(1)),
            borderColor: 'rgba(200,168,75,1)',
            backgroundColor: 'rgba(200,168,75,.08)',
            fill: false, tension: .3, pointRadius: 5,
            borderDash: [5, 3],
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Inter', size: 10 }, boxWidth: 12 } },
          title: { display: true, text: 'Frecuencias Acumuladas', font: { family: 'Playfair Display', size: 13 }, color: '#1A3A5A' }
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'JetBrains Mono', size: 10 } } },
          x: { ticks: { font: { family: 'Inter', size: 10 } } }
        },
        animation: { duration: 500 }
      }
    };
  }

  ejfChart = new Chart(ctx, config);

  // Info bar
  const info = document.getElementById('ejf-info-text');
  if (info) {
    const msgs = {
      barras: 'Diagrama de barras: visualiza las frecuencias absolutas (fᵢ) de cada categoría.',
      pie:    'Gráfico de pastel (doughnut): muestra la proporción relativa (fᵣ) de cada categoría. ',
      acum:   'Gráfico de frecuencias acumuladas: Fᵢ crece de 0 a N=40; Fᵣ×40 superpone la misma curva normalizada.',
    };
    info.textContent = msgs[tipo];
  }
}

/* ════════════════════════════════
   INIT — DOMContentLoaded
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(ocultarLoading, 800);

  const repDot = document.getElementById('rep-dot');
  if (repDot) repDot.className = 'rep-dot is-tabla';

  // Inicializar tabla dinámica página 3
  renderizarP3Tabla();

  // Recuperar historiales de sesiones previas
  cargarHistorial(sessionId,             'chat-box');
  cargarHistorial(`cap3_${sessionId}`,   'chat-box2');
  cargarHistorial(`freq_unif_${sessionId}`, 'chat-freq-unif');

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
];

// Celdas que se ocultan en cada problema (índices: fila,col donde col: 0=fi,1=hi,2=Fi,3=Hi)
const P5C_VACIAS = [
  [[0,1],[1,1],[2,2],[3,2],[4,3],[1,3],[3,1],[0,2]],
  [[0,1],[1,2],[2,1],[3,3],[4,2],[0,3],[2,3],[1,1]],
  [[1,1],[0,3],[2,2],[3,1],[4,3],[0,2],[3,3],[2,1]],
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
  let html = `<table class="p5c-tabla"><thead><tr>
    <th>Categoría</th>
    ${cols.map(c=>`<th>${c}</th>`).join('')}
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
        const val = k === 'hi' || k === 'Hi' ? valores[r][k].toFixed(2) : valores[r][k];
        html += `<td class="p5c-given">${val}</td>`;
      }
    });
    html += '</tr>';
  });

  // Fila total
  html += `<tr class="p5c-total-row">
    <td><strong>Total</strong></td>
    <td class="p5c-given"><strong>${prob.N}</strong></td>
    <td class="p5c-given"><strong>1.00</strong></td>
    <td class="p5c-given"><strong>${prob.N}</strong></td>
    <td class="p5c-given"><strong>1.00</strong></td>
  </tr></tbody></table>`;

  wrap.innerHTML = html;
  p5cActualizarProgreso();
}

function p5cActualizarProgreso() {
  const inputs = document.querySelectorAll('.p5c-cell');
  let correctas = 0;
  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    const c = parseFloat(inp.dataset.correct);
    if (!isNaN(v) && Math.abs(v - c) < 0.011) {
      correctas++;
      inp.classList.add('p5c-ok');
      inp.classList.remove('p5c-err');
    } else if (inp.value !== '') {
      inp.classList.remove('p5c-ok');
      inp.classList.add('p5c-err');
    } else {
      inp.classList.remove('p5c-ok','p5c-err');
    }
  });
  const total = inputs.length;
  const bar   = document.getElementById('p5c-progress-bar');
  const lbl   = document.getElementById('p5c-progress-label');
  if (bar) bar.style.width = total ? `${(correctas/total)*100}%` : '0%';
  if (lbl) lbl.textContent = `${correctas} / ${total} celdas correctas`;
}

function p5cVerificar() {
  const inputs  = document.querySelectorAll('.p5c-cell');
  let correctas = 0, vacias = 0, incorrectas = 0;
  inputs.forEach(inp => {
    const v = parseFloat(inp.value);
    const c = parseFloat(inp.dataset.correct);
    if (inp.value === '') { vacias++; return; }
    if (Math.abs(v - c) < 0.011) { correctas++; inp.classList.add('p5c-ok'); inp.classList.remove('p5c-err'); }
    else { incorrectas++; inp.classList.add('p5c-err'); inp.classList.remove('p5c-ok'); }
  });
  const fb = document.getElementById('p5c-feedback');
  fb.style.display = 'block';
  if (vacias > 0) {
    fb.className = 'prob-feedback parcial';
    fb.textContent = `Hay ${vacias} celda(s) sin completar. Revisa la tabla e intenta de nuevo.`;
  } else if (incorrectas > 0) {
    fb.className = 'prob-feedback error';
    fb.textContent = `${incorrectas} celda(s) incorrecta(s) (marcadas en rojo). Revisa las fórmulas y vuelve a intentarlo.`;
  } else {
    fb.className = 'prob-feedback ok';
    fb.textContent = `✅ ¡Perfecto! Todas las celdas son correctas. La tabla está completa.`;
  }
  fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function p5cReset() {
  document.querySelectorAll('.p5c-cell').forEach(inp => {
    inp.value = '';
    inp.classList.remove('p5c-ok','p5c-err');
  });
  const fb = document.getElementById('p5c-feedback');
  fb.style.display = 'none';
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

  p5dRenderTabla(sit);
  p5dRenderPreguntas(sit);
}

function p5dRenderTabla(sit) {
  const wrap = document.getElementById('p5d-tabla-wrap');
  let html = `<table class="p5c-tabla p5d-tabla">
    <thead><tr>
      <th class="p5d-th-drag">☰</th>
      <th>Categoría</th><th>fᵢ</th><th>fᵣ</th><th>Fᵢ</th><th>Fᵣ</th>
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
      <td><input type="number" step="0.0001" class="p5c-cell p5d-hi-cell" placeholder="?" oninput="p5dActualizarCalculos()"></td>
      <td><input type="number" step="1"      class="p5c-cell p5d-Fi-cell" placeholder="?" oninput="p5dActualizarCalculos()"></td>
      <td><input type="number" step="0.0001" class="p5c-cell p5d-Hi-cell" placeholder="?" oninput="p5dActualizarCalculos()"></td>
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
      <textarea class="p5d-resp-input" id="${p.id}" rows="3"
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

  // Tabla tal como la construyó el estudiante (orden actual + valores ingresados)
  const hiCells = document.querySelectorAll('.p5d-hi-cell');
  const FiCells = document.querySelectorAll('.p5d-Fi-cell');
  const HiCells = document.querySelectorAll('.p5d-Hi-cell');

  let tablaTexto = 'Tabla construida por el estudiante (en el orden que eligió):\n';
  tablaTexto += `Categoría | fᵢ | fᵣ (estudiante) | Fᵢ (estudiante) | Fᵣ (estudiante) | fᵣ correcto | Fᵢ correcto | Fᵣ correcto\n`;

  let acumF = 0;
  p5dOrdenActual.forEach((catIdx, pos) => {
    const cat = sit.categorias[catIdx];
    acumF += cat.fi;
    const hiCorr = (cat.fi / N).toFixed(4);
    const FiCorr = acumF;
    const HiCorr = (acumF / N).toFixed(4);
    const hiEst  = hiCells[pos]?.value || '(vacío)';
    const FiEst  = FiCells[pos]?.value || '(vacío)';
    const HiEst  = HiCells[pos]?.value || '(vacío)';
    tablaTexto += `${cat.cat} | ${cat.fi} | ${hiEst} | ${FiEst} | ${HiEst} | ${hiCorr} | ${FiCorr} | ${HiCorr}\n`;
  });

  // Respuestas del estudiante a las 3 preguntas
  let respuestasTexto = '\nRespuestas del estudiante a las preguntas de análisis:\n';
  sit.preguntas.forEach((p, i) => {
    const resp = document.getElementById(p.id)?.value?.trim() || '(sin responder)';
    respuestasTexto += `\nPregunta ${i+1} [tipo ${p.tipo}]: ${p.texto}\nRespuesta: ${resp}\n`;
  });

  return `[CONTEXTO DE LA SITUACIÓN]\nSituación: ${sit.titulo}\nN = ${N}\nDescripción: ${sit.enunciado}\n\n${tablaTexto}${respuestasTexto}\n\nPor favor analiza las respuestas del estudiante, identifica el nivel de Curcio de cada una, cuestiona el razonamiento y empuja hacia niveles más profundos (N3/N4). Recuerda: una sola pregunta por turno al final.`;
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

  // Extraer valores ingresados en celdas
  const inputs = document.querySelectorAll('#probA-tabla-wrapper .cell-input');
  let celdasTexto = '';
  inputs.forEach(inp => {
    celdasTexto += `  Celda [fila ${inp.dataset.fila}, col ${inp.dataset.col}]: ingresado=${inp.value||'vacío'}, correcto=${inp.dataset.correcto}\n`;
  });

  return `[CONTEXTO — Problema de Formulación ${probAActual+1}]
Enunciado: ${p.enunciado.replace(/<[^>]+>/g,'')}
Pregunta: ${p.pregunta.replace(/<[^>]+>/g,'')}
N = ${p.N}
Variables fila: ${p.filas.join(', ')}
Variables columna: ${p.columnas.join(', ')}
Sistema de representación correcto: ${p.respuestaCorrecta}

Sistema escogido por el estudiante: ${tipo}
Justificación del estudiante: ${justif}

Celdas ocultas (ingresado vs correcto):
${celdasTexto}
Pregunta de reflexión del problema: ${p.analisis}

Analiza la elección de sistema, la justificación y los valores. Cuestiona el razonamiento usando TSD y Curcio. No des la respuesta directa.`;
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

  const inputs = document.querySelectorAll('#probB-tabla-wrapper .cell-input');
  let celdasTexto = '';
  inputs.forEach(inp => {
    celdasTexto += `  Celda [${inp.dataset.fila},${inp.dataset.col}]: ingresado=${inp.value||'vacío'}, correcto=${inp.dataset.correcto}\n`;
  });

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

Celdas construidas (ingresado vs correcto):
${celdasTexto}
Respuestas a preguntas de análisis:${respuestasTexto}
Analiza todo lo anterior: la construcción de la tabla, la elección de sistema y las respuestas de análisis. Clasifica cada respuesta por nivel de Curcio (N1–N4) y cuestiona para empujar hacia N3/N4. No des respuestas directas.`;
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
  const ctx=`[CONTEXTO P16 — Construir independencia]
${tablaEst}
Respuesta del estudiante a la pregunta de interpretación (N3) — "si lo observado se pareciera/difiriera de esta tabla sin relación, ¿qué dirías?": ${n3}
El estudiante debe descubrir por sí mismo la fórmula Eᵢⱼ=(fᵢ·×f·ⱼ)/N. NO la des directamente. Devuelve consecuencias matemáticas de su distribución y pregunta si se le ocurre una forma de calcular cada celda con solo los marginales. Sobre la respuesta N3, empuja: ¿qué tan parecidos o distintos tendrían que ser O y E para hablar de "relación"?`;
  await chi3Enviar('p16', ctx, true);
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
  const ctx=`[CONTEXTO P18 — Descubrimiento del cuadrado · turno inicial]
El estudiante acaba de comprobar que sumar las diferencias Oᵢⱼ−Eᵢⱼ da cero porque los signos se cancelan.
Propuesta del estudiante para eliminar el problema de los signos: "${idea}"

Tu tarea: dialogar con el estudiante hasta que muestre que comprende por qué elevar al cuadrado resuelve el problema. NO reveles la fórmula completa de χ² todavía.

Reglas de avance (CRÍTICAS):
- Si la propuesta del estudiante es elevar al cuadrado O usar valor absoluto: valida la idea, pero cuestiónalo con una pregunta breve para que ARGUMENTE por qué funciona (no basta con que lo nombre). Una vez argumente con sus palabras que el cuadrado/valor absoluto convierte los negativos en positivos y por eso evita la cancelación, considera que comprendió.
- Si propone otra cosa o no responde: guíalo con una pregunta — "¿qué operación convierte −5 y +5 en el mismo valor positivo?" — sin dar la respuesta.
- Cuando, y SOLO cuando, el estudiante haya argumentado con sus palabras por qué el cuadrado (o valor absoluto) resuelve la cancelación de signos, termina tu respuesta con esta frase-señal exacta en una línea aparte, sin formato adicional:
[AVANZAR]
- Nunca escribas [AVANZAR] en el primer intercambio aunque la propuesta sea correcta — primero pide la argumentación. La señal va solo después de que el estudiante haya razonado, no solo nombrado.`;
  // Enviar al tutor principal de pág 18
  agregarMensajeGen('chat-chi3-p18', '💡 Propuesta sobre los signos: ' + idea, 'user');
  const tid=agregarTypingGen('chat-chi3-p18');
  setStatusGen('ts-chi3-p18','Analizando…');
  const sid=`chi3_p18_${sessionId}`;
  try {
    const res=await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:ctx,session_id:sid})});
    const data=await res.json();
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    if(data.reply){
      const avanzar=data.reply.includes('[AVANZAR]');
      const visible=data.reply.replace(/\[AVANZAR\]/g,'').trim();
      agregarMensajeGen('chat-chi3-p18',visible,'tutor');
      if(avanzar){
        const paso3=document.getElementById('chi3-descubre-paso3');
        const calculo=document.getElementById('chi3-p18-calculo');
        if(paso3) paso3.style.display='block';
        if(calculo) calculo.style.display='block';
        setTimeout(()=>paso3?.scrollIntoView({behavior:'smooth',block:'nearest'}),400);
      }
    }
  } catch(e){
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    agregarMensajeGen('chat-chi3-p18','Problema de conexión. Intenta de nuevo.','tutor');
  }
  setTimeout(()=>panelPrincipal?.scrollIntoView({behavior:'smooth',block:'nearest'}),200);
}


async function chi3EnviarPrincipalP18(texto) {
  const sid=`chi3_p18_${sessionId}`;
  agregarMensajeGen('chat-chi3-p18',texto,'user');
  const tid=agregarTypingGen('chat-chi3-p18');
  setStatusGen('ts-chi3-p18','Escribiendo…');
  try {
    const res=await fetch(URL_BACKEND,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:texto,session_id:sid})});
    const data=await res.json();
    quitarTypingGen(tid); setStatusGen('ts-chi3-p18','En línea');
    if(data.reply){
      const avanzar=data.reply.includes('[AVANZAR]');
      const visible=data.reply.replace(/\[AVANZAR\]/g,'').trim();
      agregarMensajeGen('chat-chi3-p18',visible,'tutor');
      if(avanzar){
        const paso3=document.getElementById('chi3-descubre-paso3');
        const calculo=document.getElementById('chi3-p18-calculo');
        if(paso3) paso3.style.display='block';
        if(calculo) calculo.style.display='block';
        setTimeout(()=>paso3?.scrollIntoView({behavior:'smooth',block:'nearest'}),400);
      }
    }
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
  inputs.forEach(inp=>{detalle+=`  ${inp.id}: ingresado=${inp.value||'vacío'}, correcto=${inp.dataset.correct}\n`;});
  const q1=document.getElementById('chi3-p18-q1')?.value||'(sin responder)';
  const q2=document.getElementById('chi3-p18-q2')?.value||'(sin responder)';
  const q3=document.getElementById('chi3-p18-q3')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P18 — Calcular χ²]
Oᵢⱼ=${JSON.stringify(CHI3_O)}, Eᵢⱼ=${JSON.stringify(CHI3_E.map(r=>r.map(v=>v.toFixed(2))))}.
χ² correcto = ${CHI3_CHI2.toFixed(4)}.
Contribuciones ingresadas:\n${detalle}
P1 (¿Por qué elevar al cuadrado?): ${q1}
P2 (¿Qué significa χ²=0?): ${q2}
P3 (N3 — celda de mayor contribución y qué revela): ${q3}
Analiza los cálculos y las tres respuestas. P1 y P2 son N2 (concepto). P3 es N3 (interpretación). Si P3 solo nombra la celda sin contar la "historia" de la asociación, empuja a interpretar. No des la respuesta directa.`;
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
  const eInputs=document.querySelectorAll('.chi3-p24-e-cell');
  const ctInputs=document.querySelectorAll('.chi3-p24-contrib-cell');
  let eVals='',ctVals='';
  CHI3_P24_FILAS.forEach((f,i)=>CHI3_P24_COLS.forEach((c,j)=>{
    eVals+=`  E[${f}/${c}]: est=${document.getElementById(`chi3-p24-e-${i}-${j}`)?.value||'vacío'}, corr=${CHI3_P24_E[i][j].toFixed(2)}\n`;
    ctVals+=`  (O-E)²/E[${f}/${c}]: est=${document.getElementById(`chi3-p24-ct-${i}-${j}`)?.value||'vacío'}, corr=${(Math.pow(CHI3_P24_O[i][j]-CHI3_P24_E[i][j],2)/CHI3_P24_E[i][j]).toFixed(4)}\n`;
  }));
  const concl=document.getElementById('chi3-p24-concl')?.value||'(sin responder)';
  const q1=document.getElementById('chi3-p24-q1')?.value||'(sin responder)';
  const q2=document.getElementById('chi3-p24-q2')?.value||'(sin responder)';
  const ctx=`[CONTEXTO P24 — Situación libre final]
Datos: Internet×Rendimiento, N=${CHI3_P24_N}, O=${JSON.stringify(CHI3_P24_O)}.
χ² correcto=${CHI3_P24_CHI2.toFixed(4)}, gl=${CHI3_P24_GL}, vc=9.488.
E��ⱼ ingresadas:\n${eVals}
Contribuciones:\n${ctVals}
Conclusión del estudiante: ${concl}
P1 (causalidad/variable oculta): ${q1}
P2 (implicaciones para política educativa): ${q2}
Evalúa el ciclo completo. Clasifica el nivel de Curcio de la conclusión y las respuestas N4. Cuestiona lo que esté superficial. Si todo está en N4, valida y cierra el capítulo.`;
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
  // Calcular distribución de cada columna categórica (conteos)
  const catCols=cols.filter(c=>tipos[c]==='categórica');
  let distrib='';
  catCols.forEach(c=>{
    const counts=p25ContarUna(c);
    const resumen=Object.entries(counts).map(([v,n])=>`${v}:${n}`).join(', ');
    distrib+=`  "${c}" → ${resumen}\n`;
  });
  const v1=document.getElementById('p25-sel-var1')?.value;
  const v2=document.getElementById('p25-sel-var2')?.value;
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

function p1ToggleGlosario(termino, el) {
  const panel = document.getElementById('p1-glosario-panel');
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
