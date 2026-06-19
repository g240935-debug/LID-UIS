/* ═══════════════════════════════════════════════════════
   LID — script.js
   Conexión al backend: https://lid-uis.onrender.com/api/chat
   No modificar URL_BACKEND sin actualizar el servidor.
═══════════════════════════════════════════════════════ */

const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';
let sessionId = localStorage.getItem('lid_uid');
if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('lid_uid', sessionId);
}

// ── Estado global ──
let graficoActual  = null;
let vistaActual    = 'tabla';   // 'tabla' | 'grafico'
let paginaActual   = 0;
let chatIniciado   = false;

// Datos por defecto (se sobreescriben con la respuesta del backend)
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

  // Preparar nueva página fuera de pantalla
  pNueva.style.transform = avanza ? 'translateX(48px)' : 'translateX(-48px)';
  pNueva.style.opacity   = '0';

  // Salida de la actual
  pVieja.style.transform = avanza ? 'translateX(-48px)' : 'translateX(48px)';
  pVieja.style.opacity   = '0';
  pVieja.style.transition = 'opacity .38s ease, transform .38s ease';
  pVieja.classList.remove('active');

  // Entrada de la nueva
  requestAnimationFrame(() => {
    pNueva.style.transition = 'opacity .38s ease, transform .38s ease';
    pNueva.classList.add('active');
    pNueva.style.transform = 'translateX(0)';
    pNueva.style.opacity   = '1';
  });

  // Limpiar estilos inline después de la transición
  setTimeout(() => {
    pVieja.style.transform  = '';
    pVieja.style.opacity    = '';
    pVieja.style.transition = '';
    pNueva.style.transition = '';
  }, 420);

  paginaActual = n;
  actualizarIndicadores();

  // Iniciar tutor Cap 2 al llegar a página 2
  if (n === 2 && !chatIniciado) {
    chatIniciado = true;
    inicializarChat();
  }

  // Iniciar tutor Cap 3 al llegar a página 5
  if (n === 5 && !cap3Iniciado) {
    cap3Iniciado = true;
    setTimeout(inicializarChat2, 400);
  }
}

function actualizarIndicadores() {
  document.querySelectorAll('.pi-dot').forEach((d, i) =>
    d.classList.toggle('active', i === paginaActual)
  );
}

/* ════════════════════════════════
   FASES DE BROUSSEAU — indicador visual
   Se actualiza según keywords en la respuesta del tutor.
   Fase A: exploración inicial (frecuencia conjunta)
   Fase B: frecuencias marginales
   Fase C: transnumeración / frecuencia condicionada
════════════════════════════════ */
function actualizarFase(texto) {
  const dot   = document.getElementById('phaseIndicator')?.querySelector('.phase-dot');
  const label = document.getElementById('phaseLabel');
  if (!dot || !label) return;

  // Keywords del system_prompt para detectar la fase activa
  const esB = texto.includes('Frecuencia Marginal') || texto.includes('bordes de la tabla') ||
               texto.includes('total de mujeres') || texto.includes('total general');
  const esC = texto.includes('titular impactante') || texto.includes('cambiar la forma') ||
               texto.includes('Frecuencia Condicionada') || texto.includes('h_i|j') ||
               texto.includes('proporción') || texto.includes('porcentaje');
  const fin  = texto.includes('Frecuencia Condicionada') && texto.includes('¡Muy bien!');

  if (fin) {
    dot.className   = 'phase-dot phase-done';
    label.textContent = 'Institucionalización';
  } else if (esC) {
    dot.className   = 'phase-dot phase-c';
    label.textContent = 'Transnumeración';
    mostrarBotonTransnum();
  } else if (esB) {
    dot.className   = 'phase-dot phase-b';
    label.textContent = 'Frecuencias marginales';
  } else {
    dot.className   = 'phase-dot phase-a';
    label.textContent = 'Exploración';
  }
}

/* ════════════════════════════════
   TRANSNUMERACIÓN — aparece en Fase C
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
    // Tabla → Gráfico
    tablaEl.classList.add('fade-out');
    setTimeout(() => {
      tablaEl.style.display   = 'none';
      tablaEl.classList.remove('fade-out');
      graficoEl.style.display = 'block';
      graficoEl.classList.add('fade-in');
      renderizarGrafico();
      setTimeout(() => graficoEl.classList.remove('fade-in'), 400);
    }, 250);

    vistaActual = 'grafico';
    btnLabel.textContent = 'Ver como Tabla de Contingencia';
    btnEl.classList.add('is-chart');
    repDot.className   = 'rep-dot is-grafico';
    repText.textContent = 'Diagrama de barras activo';

  } else {
    // Gráfico → Tabla
    graficoEl.classList.add('fade-out');
    setTimeout(() => {
      graficoEl.style.display = 'none';
      graficoEl.classList.remove('fade-out');
      tablaEl.style.display   = 'block';
      tablaEl.classList.add('fade-in');
      setTimeout(() => tablaEl.classList.remove('fade-in'), 400);
    }, 250);

    vistaActual = 'tabla';
    btnLabel.textContent = 'Ver como Diagrama de Barras';
    btnEl.classList.remove('is-chart');
    repDot.className   = 'rep-dot is-tabla';
    repText.textContent = 'Representación tabular activa';
  }
}

function renderizarGrafico() {
  const ctx = document.getElementById('miGrafico')?.getContext('2d');
  if (!ctx) return;
  if (graficoActual) graficoActual.destroy();

  graficoActual = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: datosGrafico.labels,
      datasets: [
        {
          label: 'Hombres',
          data: datosGrafico.hombres,
          backgroundColor: 'rgba(26,58,90,.83)',
          borderRadius: 3
        },
        {
          label: 'Mujeres',
          data: datosGrafico.mujeres,
          backgroundColor: 'rgba(46,107,79,.83)',
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      animation: { duration: 550, easing: 'easeOutQuart' },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { family: 'Inter', size: 11 }, boxWidth: 12 }
        },
        title: {
          display: true,
          text: 'Actividades extracurriculares por género — Bucaramanga',
          font: { family: 'Playfair Display', size: 12 },
          color: '#1A3A5A', padding: { bottom: 10 }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { font: { family: 'JetBrains Mono', size: 10 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 } }
        }
      }
    }
  });
}

/* ════════════════════════════════
   TABLA DE CONTINGENCIA
════════════════════════════════ */
function actualizarTabla(matriz, cabeceras) {
  let html = '<table><thead><tr>';
  cabeceras.forEach((h, i) => {
    html += `<th${i === 0 ? ' style="text-align:left"' : ''}>${h}</th>`;
  });
  html += '</tr></thead><tbody>';
  matriz.forEach((fila) => {
    html += '<tr>';
    fila.forEach((celda) => {
      html += `<td>${celda}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  const cont = document.getElementById('tabla-container');
  if (cont) cont.innerHTML = html;
}

/* ════════════════════════════════
   CHAT / TUTOR
════════════════════════════════ */
async function inicializarChat() {
  setStatus('Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, estoy listo para aprender.', session_id: sessionId })
});
    const data = await res.json();

    if (data.reply) {
      agregarMensaje(data.reply, 'tutor');
      actualizarFase(data.reply);
    }
    if (data.table)       actualizarTabla(data.table, data.headers);
    if (data.grafico_data) sincronizarDatosGrafico(data.grafico_data);

    setStatus('En línea');
  } catch (err) {
    console.error('Error al inicializar chat:', err);
    agregarMensaje('¡Hola! Estoy aquí para guiarte. Escribe tu primera respuesta para comenzar.', 'tutor');
    setStatus('En línea');
  } finally {
    ocultarLoading();
  }
}

async function enviarMensaje() {
  const input = document.getElementById('user-input');
  if (!input || !input.value.trim()) return;

  const texto = input.value.trim();
  input.value = '';
  agregarMensaje(texto, 'user');

  const typingId = agregarTyping();
  setStatus('Escribiendo…');

  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: sessionId })
});
    const data = await res.json();

    quitarTyping(typingId);
    setStatus('En línea');

    if (data.reply) {
      agregarMensaje(data.reply, 'tutor');
      actualizarFase(data.reply);
    }
    if (data.table)       actualizarTabla(data.table, data.headers);
    if (data.grafico_data) sincronizarDatosGrafico(data.grafico_data);

    // Si está en vista gráfico, refresca el chart
    if (vistaActual === 'grafico') renderizarGrafico();

  } catch (err) {
    quitarTyping(typingId);
    setStatus('En línea');
    agregarMensaje('Hubo un problema de conexión. Por favor intenta de nuevo.', 'tutor');
  }
}

/* ════════════════════════════════
   HELPERS
════════════════════════════════ */
function sincronizarDatosGrafico(arr) {
  // El backend envía [Hombres_Danza, Mujeres_Danza, Total_Danza]
  // Conservamos el formato completo para el gráfico agrupado
  if (arr && arr.length >= 2) {
    datosGrafico.hombres = [30, arr[0], 15];
    datosGrafico.mujeres = [10, arr[1], 15];
  }
}

function agregarMensaje(texto, tipo) {
  const box = document.getElementById('chat-box');
  if (!box) return;
  const div = document.createElement('div');
  div.className = tipo === 'user' ? 'msg-user' : 'msg-tutor';
  // Convierte *texto* en <em> y preserva saltos de párrafo
  div.innerHTML = texto
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function agregarTyping() {
  const box = document.getElementById('chat-box');
  if (!box) return null;
  const id  = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id        = id;
  div.className = 'msg-typing';
  div.textContent = 'El tutor está escribiendo…';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}

function quitarTyping(id) {
  if (id) document.getElementById(id)?.remove();
}

function setStatus(txt) {
  const el = document.getElementById('tutor-status-text');
  if (el) el.textContent = txt;
}

function ocultarLoading() {
  document.getElementById('loadingOverlay')?.classList.add('hidden');
}

/* ════════════════════════════════════════════════
   CAP III — TABLA INTERACTIVA (página 4)
   
   DÓNDE VA ESTE BLOQUE: solo afecta la página 4.
   No toca el backend. Todo el cálculo es local.
   
   Dataset: 120 estudiantes UIS
   Filas   → Rendimiento: Bajo / Medio / Alto
   Columnas → Horas/semana: <5h / 5-10h / >10h
════════════════════════════════════════════════ */

// Datos absolutos base (no se modifican)
const FP_DATA = {
  filas:    ['Bajo', 'Medio', 'Alto'],
  columnas: ['< 5h', '5–10h', '> 10h'],
  matriz: [
    [22, 10,  3],  // Bajo
    [12, 28, 10],  // Medio
    [ 4, 17, 14],  // Alto
  ],
  N: 120
};

// Pregunta interpretativa para cada tipo
const FP_PREGUNTAS = {
  absoluta: '¿Cuántos estudiantes tienen rendimiento Alto y estudian más de 10h semanales?',
  total:    '¿Qué porcentaje de toda la muestra tiene rendimiento Alto y estudia más de 10h?',
  fila:     'Del grupo con rendimiento Alto, ¿qué porcentaje estudia más de 10h?',
  columna:  'De quienes estudian más de 10h, ¿qué porcentaje tiene rendimiento Alto?'
};

// Celda que responde la pregunta (fila, columna) — siempre es Alto × >10h = [2][2]
const FP_HIGHLIGHT = [2, 2];

let fpTipoActual = 'absoluta';

function cambiarTipoTabla(tipo) {
  fpTipoActual = tipo;

  // Actualizar tabs
  document.querySelectorAll('.fp-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById(`tab-${tipo}`);
  if (tabEl) tabEl.classList.add('active');

  // Actualizar tabla
  renderizarFPTabla(tipo);

  // Actualizar explicación derecha
  document.querySelectorAll('.fpe-content').forEach(c => c.classList.add('hidden'));
  const explEl = document.getElementById(`fpe-${tipo}`);
  if (explEl) explEl.classList.remove('hidden');

  // Actualizar pregunta
  const qEl = document.getElementById('fp-question-text');
  if (qEl) qEl.textContent = FP_PREGUNTAS[tipo];

  // Color del borde de la pregunta según tipo
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

  // Totales marginales
  const totalesCol = columnas.map((_, j) => matriz.reduce((s, r) => s + r[j], 0));
  const totalesFila = matriz.map(r => r.reduce((s, v) => s + v, 0));

  let html = '<table><thead><tr>';
  html += '<th>Rendimiento \\ Horas</th>';
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
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td>`;
    html += '</tr>';
  });

  // Fila de totales de columna
  html += '<tr>';
  html += '<td>Total columna</td>';
  totalesCol.forEach(tc => {
    html += `<td>${calcularMarginalCol(tipo, tc, N)}</td>`;
  });
  html += `<td>${tipo === 'absoluta' ? N : '100%'}</td>`;
  html += '</tr>';

  html += '</tbody></table>';

  const wrapper = document.getElementById('fp-tabla-wrapper');
  if (wrapper) {
    wrapper.style.opacity = '0';
    setTimeout(() => {
      wrapper.innerHTML = html;
      wrapper.style.opacity = '1';
      wrapper.style.transition = 'opacity .25s ease';
    }, 120);
  }
}

// Tabla de referencia fija en página 5 (siempre absoluta)
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
  html += `<td>${FP_DATA.N}</td></tr>`;
  html += '</tbody></table>';

  const el = document.getElementById('fp-ref-table');
  if (el) el.innerHTML = html;
}

/* ════════════════════════════════════════════════
   CAP III — TUTOR IA (página 5)

   DÓNDE VA: solo afecta la página 5.
   Usa session_id "cap3_user" → sesión INDEPENDIENTE
   del Cap 2 (que usa "default_user").
   El system_prompt del backend (app.py) debería
   tener un endpoint o lógica para manejar este
   session_id con un prompt distinto, o por ahora
   reutiliza el mismo endpoint con otro session_id
   para que el historial no se mezcle.
════════════════════════════════════════════════ */

let cap3Iniciado = false;
let cap3Historia = [];

async function inicializarChat2() {
  setStatus2('Conectando…');
  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hola, inicio Cap 3.', session_id: 'cap3_user' })
});
    const data = await res.json();
    if (data.reply) agregarMensaje2(data.reply, 'tutor');
    setStatus2('En línea');
  } catch (err) {
    agregarMensaje2('¡Hola! Continuemos con las formas parciales. ¿Listo?', 'tutor');
    setStatus2('En línea');
  }
}

async function enviarMensaje2() {
  const input = document.getElementById('user-input2');
  if (!input || !input.value.trim()) return;

  const texto = input.value.trim();
  input.value = '';
  agregarMensaje2(texto, 'user');

  const typingId = agregarTyping2();
  setStatus2('Escribiendo…');

  try {
    const res  = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: 'cap3_user' })
});
    const data = await res.json();
    quitarTyping2(typingId);
    setStatus2('En línea');
    if (data.reply) agregarMensaje2(data.reply, 'tutor');
  } catch (err) {
    quitarTyping2(typingId);
    setStatus2('En línea');
    agregarMensaje2('Hubo un problema de conexión. Intenta de nuevo.', 'tutor');
  }
}

function agregarMensaje2(texto, tipo) {
  const box = document.getElementById('chat-box2');
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

function agregarTyping2() {
  const box = document.getElementById('chat-box2');
  if (!box) return null;
  const id  = 'typing2-' + Date.now();
  const div = document.createElement('div');
  div.id = id; div.className = 'msg-typing';
  div.textContent = 'El tutor está escribiendo…';
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return id;
}
function quitarTyping2(id) { if (id) document.getElementById(id)?.remove(); }
function setStatus2(txt) {
  const el = document.getElementById('tutor-status-text2');
  if (el) el.textContent = txt;
}

async function cargarHistorial(idSesion, contenedorId) {
    try {
        const res = await fetch(URL_BACKEND.replace('/api/chat', '/api/chat/historial'), {
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
                // Si es el chat del Cap 2, usa agregarMensaje, si es Cap 3 usa agregarMensaje2
                if (contenedorId === 'chat-box') {
                    if (msg.role === 'user') agregarMensaje(msg.content, 'user');
                    else if (msg.role === 'assistant') agregarMensaje(msg.content, 'tutor');
                } else if (contenedorId === 'chat-box2') {
                    if (msg.role === 'user') agregarMensaje2(msg.content, 'user');
                    else if (msg.role === 'assistant') agregarMensaje2(msg.content, 'tutor');
                }
            });
            // Solo actualizamos fases si es el chat principal (Cap 2)
            if (contenedorId === 'chat-box') {
                actualizarFase(data.history[data.history.length - 1].content);
            }
        }
    } catch (err) { console.error(`Error al recuperar historial ${idSesion}:`, err); }
}

/* ════════════════════════════════
   INIT
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(ocultarLoading, 800);

    // Rep-dot inicial del Cap 2
    const repDot = document.getElementById('rep-dot');
    if (repDot) repDot.className = 'rep-dot is-tabla';

    // --- CARGAR AMBOS HISTORIALES ---
    cargarHistorial(sessionId, 'chat-box');       // Carga Cap 2
    cargarHistorial('cap3_user', 'chat-box2');    // Carga Cap 3
    
    // Renderizar tablas
    renderizarFPTabla('absoluta');
    renderizarFPRefTable();
});
