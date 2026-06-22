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
let chatFreqBIniciado  = false;  // pág 3
let chatFreqCIniciado  = false;  // pág 4 (fase C: frec. abs. acumulada)
let chatFreqDIniciado  = false;  // pág 4 (fase D: frec. rel. acumulada)

let freqCCompletado = false;     // true cuando la IA de fase C termina
let chiActual       = 0;

// Datos por defecto para el gráfico de contingencia Cap II
let datosGrafico = {
  labels:  ['Deportes', 'Danza', 'Música'],
  hombres: [30, 5, 15],
  mujeres: [10, 25, 15]
};

/* ════════════════════════════════
   PAGINACIÓN
════════════════════════════════ */
function irAPagina(n) {
  if (n === paginaActual) return;

  const pVieja = document.getElementById(`page-${paginaActual}`);
  const pNueva = document.getElementById(`page-${n}`);
  if (!pVieja || !pNueva) return;

  const avanza = n > paginaActual;

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

  // Cap I — Fase A+B (frec. absoluta + relativa)
  if (n === 2 && !chatFreqAIniciado) {
    chatFreqAIniciado = true;
    setTimeout(inicializarChatFreqA, 400);
  }

  // Cap I — Fase B (Curcio N3/N4)
  if (n === 3 && !chatFreqBIniciado) {
    chatFreqBIniciado = true;
    setTimeout(inicializarChatFreqB, 400);
  }

  // Cap I — Fase C+D (frec. acumuladas)
  if (n === 4 && !chatFreqCIniciado) {
    chatFreqCIniciado = true;
    setTimeout(inicializarChatFreqC, 400);
  }

  // Cap II — Tablas de contingencia
  if (n === 7 && !chatCap2Iniciado) {
    chatCap2Iniciado = true;
    setTimeout(inicializarChatCap2, 400);
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
}

function actualizarIndicadores() {
  document.querySelectorAll('.pi-dot').forEach((d, i) =>
    d.classList.toggle('active', i === paginaActual)
  );
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
               texto.includes('Frecuencia Condicionada') || texto.includes('proporción') ||
               texto.includes('porcentaje');
  const fin  = texto.includes('Frecuencia Condicionada') && texto.includes('¡Muy bien!');

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
  const tieneRelativa = texto.includes('Frecuencia Relativa') || texto.includes('h_i') || texto.includes('hᵢ');

  if (completado) {
    dot.className     = 'phase-dot phase-done';
    label.textContent = 'Completado';
    // Mostrar tabla expandida con hᵢ
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
    }
  } catch (err) {
    quitarTypingGen(tid);
    setStatusFreq('tutor-status-freq-b', 'En línea');
    agregarMensajeGen('chat-freq-b', 'Problema de conexión. Intenta de nuevo.', 'tutor');
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
      if (contenedorId === 'chat-freq-b') actualizarFaseFreqB(ultimo);
      if (contenedorId === 'chat-freq-c') { actualizarFaseFreqC(ultimo); actualizarFaseFreqD(ultimo); }
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
    enunciado: 'La siguiente tabla registra la preferencia de <strong>80 estudiantes UIS</strong> según su <strong>semestre</strong> (Primeros / Medios / Últimos) y el <strong>tipo de evaluación preferida</strong> (Oral / Escrita / Proyecto). Algunas celdas están ocultas.',
    pregunta: '¿Qué sistema de representación usarías para saber, <em>dentro del grupo de últimos semestres</em>, qué tipo de evaluación prefieren más? Completa las celdas vacías.',
    filas: ['Primeros', 'Medios', 'Últimos'], columnas: ['Oral', 'Escrita', 'Proyecto'],
    matriz: [[8,14,8],[6,12,12],[4,8,8]], ocultas: [[1,0],[1,2],[2,1]],
    respuestaCorrecta: 'fila', N: 80
  },
  {
    enunciado: 'Tabla de <strong>100 estudiantes UIS</strong> cruzando <strong>tipo de vivienda</strong> (Propia / Arrendada / Residencia) con <strong>satisfacción académica</strong> (Alta / Media / Baja). Algunas celdas están ocultas.',
    pregunta: '¿Qué porcentaje del <em>total de encuestados</em> vive en arriendo y tiene satisfacción alta? Completa las celdas vacías.',
    filas: ['Propia', 'Arrendada', 'Residencia'], columnas: ['Alta', 'Media', 'Baja'],
    matriz: [[15,10,5],[12,18,10],[8,14,8]], ocultas: [[0,2],[1,0],[2,2]],
    respuestaCorrecta: 'total', N: 100
  },
  {
    enunciado: 'Tabla de <strong>120 estudiantes</strong> cruzando <strong>área de conocimiento</strong> (Exactas / Sociales / Artes) y <strong>medio de acceso a internet</strong> (Móvil / Fijo / Universidad). Algunas celdas están ocultas.',
    pregunta: 'De quienes acceden por <em>red universitaria</em>, ¿qué porcentaje es de Exactas? Completa las celdas vacías.',
    filas: ['Exactas', 'Sociales', 'Artes'], columnas: ['Móvil', 'Fijo', 'Universidad'],
    matriz: [[20,12,18],[15,10,15],[14,8,8]], ocultas: [[0,0],[1,2],[2,1]],
    respuestaCorrecta: 'columna', N: 120
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
  _renderizarTablaA();
}

function renderizarProbA() {
  const p = PROBLEMAS_A[probAActual];
  document.getElementById('probA-enunciado').innerHTML   = p.enunciado;
  document.getElementById('probA-pregunta').innerHTML    = p.pregunta;
  document.getElementById('probA-counter').textContent   = `${probAActual+1} / ${PROBLEMAS_A.length}`;
  document.getElementById('probA-num-badge').textContent = probAActual + 1;
  document.getElementById('probA-feedback').style.display = 'none';
  tipoEscogidoA = null;
  document.querySelectorAll('#page-12 .pts-btn').forEach(b => b.classList.remove('selected','correcto','incorrecto'));
  document.getElementById('probA-tipo-feedback').style.display = 'none';
  _renderizarTablaA();
}

function _renderizarTablaA() {
  const p    = PROBLEMAS_A[probAActual];
  const tipo = tipoEscogidoA || 'absoluta';
  const { filas, columnas, matriz, ocultas, N } = p;
  const totalesCol  = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr><th>Categoría</th>';
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

function calcularCeldaNum(tipo, val, totalFila, totalCol, N) {
  if (tipo === 'absoluta') return val;
  if (tipo === 'total')    return parseFloat((val / N * 100).toFixed(1));
  if (tipo === 'fila')     return parseFloat((val / totalFila * 100).toFixed(1));
  if (tipo === 'columna')  return parseFloat((val / totalCol * 100).toFixed(1));
  return val;
}

function verificarProblemaA() {
  const p      = PROBLEMAS_A[probAActual];
  const fbTipo = document.getElementById('probA-tipo-feedback');
  if (!tipoEscogidoA) {
    fbTipo.style.display='block'; fbTipo.className='pts-feedback error'; fbTipo.textContent='⚠️ Primero selecciona el sistema de representación adecuado.'; return;
  }
  const tipoOk = tipoEscogidoA === p.respuestaCorrecta;
  document.querySelectorAll('#page-12 .pts-btn').forEach(b => {
    b.classList.remove('correcto','incorrecto');
    if (b.dataset.tipo === tipoEscogidoA) b.classList.add(tipoOk ? 'correcto' : 'incorrecto');
  });
  fbTipo.style.display='block';
  fbTipo.className = tipoOk ? 'pts-feedback ok' : 'pts-feedback error';
  fbTipo.innerHTML = tipoOk
    ? `✅ ¡Correcto! El <strong>% por ${p.respuestaCorrecta}</strong> es el sistema adecuado.`
    : `❌ El sistema <strong>${tipoEscogidoA}</strong> no es el más adecuado. ¿Qué grupo es el "universo" de la pregunta?`;

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
  if (correctas===total && tipoOk) { fb.className='prob-feedback ok'; fb.innerHTML='✅ ¡Perfecto! Escogiste el sistema correcto y completaste todas las celdas.'; }
  else if (correctas===total && !tipoOk) { fb.className='prob-feedback parcial'; fb.innerHTML='⚠️ Las celdas son correctas para el tipo escogido, pero el sistema no responde la pregunta.'; }
  else { fb.className='prob-feedback parcial'; fb.innerHTML=`⚠️ ${correctas} de ${total} celdas correctas.`; }
}

function cambiarProbA(dir) {
  const nuevo = probAActual + dir;
  if (nuevo < 0 || nuevo >= PROBLEMAS_A.length) return;
  probAActual = nuevo; tipoEscogidoA = null; renderizarProbA();
}

/* ════════════════════════════════════════════════
   CAP IV — PROBLEMAS TIPO B (página 13)
════════════════════════════════════════════════ */
const PROBLEMAS_B = [
  {
    enunciado: 'Se encuestaron <strong>90 estudiantes</strong> de la UIS sobre su <strong>medio de transporte</strong> (Bus / Bicicleta / A pie) y su <strong>puntualidad</strong> (Siempre / A veces / Nunca).',
    frases: ['30 estudiantes usan Bus.','De quienes usan Bicicleta, la mitad llega Siempre.','10 estudiantes van A pie y llegan A veces.','Solo 3 estudiantes van A pie y Nunca llegan.','En total, 24 estudiantes llegan Siempre a tiempo.'],
    pregunta: '¿Qué medio de transporte se asocia con mejor puntualidad?',
    filas: ['Bus','Bicicleta','A pie'], columnas: ['Siempre','A veces','Nunca'],
    solucion: [[10,14,6],[12,8,5],[2,10,3]], respuestaCorrecta: 'absoluta', N: 90
  },
  {
    enunciado: 'Se encuestaron <strong>60 estudiantes</strong> sobre su <strong>programa</strong> (Matemáticas / Física / Estadística) y el <strong>software estadístico</strong> que más usan (R / Python / SPSS).',
    frases: ['25 estudiantes son de Matemáticas.','El 40% de los estudiantes de Física usa R.','8 estudiantes de Estadística usan Python.','Solo 2 estudiantes de Matemáticas usan SPSS.','En total, 22 estudiantes usan Python.'],
    pregunta: 'Dentro de cada programa, ¿cuál es el software más usado?',
    filas: ['Matemáticas','Física','Estadística'], columnas: ['R','Python','SPSS'],
    solucion: [[12,11,2],[6,6,3],[4,8,8]], respuestaCorrecta: 'fila', N: 60
  },
  {
    enunciado: 'Se encuestaron <strong>75 estudiantes</strong> sobre su <strong>nivel de inglés</strong> (Básico / Intermedio / Avanzado) y su <strong>participación en intercambios</strong> (Sí / No).',
    frases: ['30 estudiantes tienen nivel Básico.','20 estudiantes tienen nivel Avanzado.','El 60% de los de nivel Avanzado participó en intercambio.','Solo 3 estudiantes de nivel Básico participaron.','En total, 22 estudiantes participaron en intercambio.'],
    pregunta: 'De quienes participaron en intercambio, ¿de qué nivel son?',
    filas: ['Básico','Intermedio','Avanzado'], columnas: ['Sí','No'],
    solucion: [[3,27],[7,18],[12,8]], respuestaCorrecta: 'columna', N: 75
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
  _renderizarTablaB();
}

function renderizarProbB() {
  const p = PROBLEMAS_B[probBActual];
  document.getElementById('probB-enunciado').innerHTML  = p.enunciado;
  document.getElementById('probB-pregunta').innerHTML   = p.pregunta;
  document.getElementById('probB-num').textContent      = probBActual + 1;
  document.getElementById('probB-counter').textContent  = `${probBActual+1} / ${PROBLEMAS_B.length}`;
  document.getElementById('probB-feedback').style.display = 'none';
  const frasesEl = document.getElementById('probB-frases');
  if (frasesEl) frasesEl.innerHTML = p.frases.map(f => `<div class="prob-frase">• ${f}</div>`).join('');
  tipoEscogidoB = null;
  document.querySelectorAll('#page-13 .pts-btn').forEach(b => b.classList.remove('selected','correcto','incorrecto'));
  document.getElementById('probB-tipo-feedback').style.display = 'none';
  _renderizarTablaB();
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
    fbTipo.style.display='block'; fbTipo.className='pts-feedback error'; fbTipo.textContent='⚠️ Primero selecciona el sistema de representación.'; return;
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
    : `❌ El sistema <strong>${tipoEscogidoB}</strong> no es el adecuado. ¿Quién es el "universo" de comparación?`;

  const inputs = document.querySelectorAll('#probB-tabla-wrapper .cell-input');
  let correctas=0, total=inputs.length;
  inputs.forEach(inp => {
    const val=parseFloat(inp.value), correcto=parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && Math.abs(val-correcto)<0.2) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value!=='') inp.classList.add('incorrecto');
  });
  const fb = document.getElementById('probB-feedback');
  fb.style.display='block';
  if (correctas===total && tipoOk)       { fb.className='prob-feedback ok';     fb.innerHTML='✅ ¡Excelente! Escogiste el sistema correcto y construiste la tabla completa.'; }
  else if (correctas===total && !tipoOk) { fb.className='prob-feedback parcial'; fb.innerHTML='⚠️ Los valores son correctos pero el sistema no responde la pregunta planteada.'; }
  else                                   { fb.className='prob-feedback parcial'; fb.innerHTML=`⚠️ ${correctas} de ${total} celdas correctas.`; }
}

function cambiarProbB(dir) {
  const nuevo = probBActual + dir;
  if (nuevo < 0 || nuevo >= PROBLEMAS_B.length) return;
  probBActual = nuevo; tipoEscogidoB = null; renderizarProbB();
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

/* ════════════════════════════════
   INIT — DOMContentLoaded
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(ocultarLoading, 800);

  const repDot = document.getElementById('rep-dot');
  if (repDot) repDot.className = 'rep-dot is-tabla';

  // Recuperar historiales de sesiones previas
  cargarHistorial(sessionId,             'chat-box');
  cargarHistorial(`cap3_${sessionId}`,   'chat-box2');
  cargarHistorial(`freq_A_${sessionId}`, 'chat-freq-a');
  cargarHistorial(`freq_B_${sessionId}`, 'chat-freq-b');
  cargarHistorial(`freq_C_${sessionId}`, 'chat-freq-c');

  // Renderizar tablas y gráficos estáticos
  renderizarFPTabla('absoluta');
  renderizarFPRefTable();
  renderizarEjTabla('absoluta');
  renderizarEjGrafico('absoluta');
  renderizarProbA();
  renderizarProbB();
  renderizarChi();
});
