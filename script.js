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
// para que funcione la IA
let cap3Iniciado   = false; // Para la página 5
let probAIniciado  = false; // Para la página 7
let probBIniciado  = false; // Para la página 8
let chiIniciado    = false; // Para la página 9

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

  // Iniciar tutor Chi al llegar a página 9
  if (n === 9 && !chiIniciado) {
    chiIniciado = true;
    setTimeout(inicializarTutorChi, 400);
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

// Función: recibe el ID de sesión y a qué "chat-box" debe enviar los mensajes
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
            
            box.innerHTML = ''; // Limpiar antes de cargar
            data.history.forEach(msg => {
                // Si es el chat principal, usa agregarMensaje; si es el chat2, usa agregarMensaje2
                if (contenedorId === 'chat-box') {
                    if (msg.role === 'user') agregarMensaje(msg.content, 'user');
                    else if (msg.role === 'assistant') agregarMensaje(msg.content, 'tutor');
                } else if (contenedorId === 'chat-box2') {
                    if (msg.role === 'user') agregarMensaje2(msg.content, 'user');
                    else if (msg.role === 'assistant') agregarMensaje2(msg.content, 'tutor');
                }
            });
            
            // Actualizar fase solo si es el Cap 2
            if (contenedorId === 'chat-box' && data.history.length > 0) {
                actualizarFase(data.history[data.history.length - 1].content);
            }
        }
    } catch (err) { console.error(`Error al recuperar historial ${idSesion}:`, err); }
}

/* ════════════════════════════════════════════════
   PÁG 6 — EJEMPLOS DINÁMICOS
   Dataset: 150 estudiantes UIS
   Filas: Ciencias / Ingenierías / Humanidades
   Cols:  Presencial / Virtual / Híbrida
════════════════════════════════════════════════ */
const EJ_DATA = {
  filas:    ['Ciencias', 'Ingenierías', 'Humanidades'],
  columnas: ['Presencial', 'Virtual', 'Híbrida'],
  matriz: [
    [18, 12, 20],
    [30,  8, 22],
    [14, 16, 10],
  ],
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
  total:    { tag: 'Tipo 2 · % sobre el total', texto: 'Cada celda dividida entre <strong>N=150</strong>. Responde: ¿qué fracción del <em>total</em> representa cada combinación?', alerta: '⚠️ La suma de todas las celdas es 100%.' },
  fila:     { tag: 'Tipo 3a · % por fila', texto: 'Cada celda dividida entre el <strong>total de su fila</strong>. Compara las modalidades <em>dentro de cada facultad</em>.', alerta: '⚠️ Cada fila suma 100%. Permite comparar filas entre sí.' },
  columna:  { tag: 'Tipo 3b · % por columna', texto: 'Cada celda dividida entre el <strong>total de su columna</strong>. Compara las facultades <em>dentro de cada modalidad</em>.', alerta: '⚠️ Cada columna suma 100%. Permite comparar columnas entre sí.' }
};

let ejGraficoActual = null;
let ejTipoActual = 'absoluta';

function cambiarEjemplo(tipo) {
  ejTipoActual = tipo;

  // Tabs
  document.querySelectorAll('[id^="etab-"]').forEach(t => t.classList.remove('active'));
  document.getElementById(`etab-${tipo}`)?.classList.add('active');

  // Tabla
  renderizarEjTabla(tipo);

  // Gráfico
  renderizarEjGrafico(tipo);

  // Pregunta
  const q = document.getElementById('ej-question-text');
  if (q) q.textContent = EJ_PREGUNTAS[tipo];

  // Explicación
  const info = EJ_EXPLICA[tipo];
  const tag = document.getElementById('ej-tag');
  const txt = document.getElementById('ej-explain-text');
  const alt = document.getElementById('ej-alert');
  if (tag) tag.textContent = info.tag;
  if (txt) txt.innerHTML = info.texto;
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
    fila.forEach((val, j) => {
      html += `<td>${calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N)}</td>`;
    });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });

  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td>${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td>${tipo === 'absoluta' ? N : '100%'}</td></tr>`;
  html += '</tbody></table>';

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
    data: matriz[i].map((val, j) => {
      const v = calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N);
      return parseFloat(String(v).replace('%',''));
    }),
    backgroundColor: ['rgba(26,58,90,.8)', 'rgba(46,107,79,.8)', 'rgba(200,168,75,.8)'][i],
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
   PÁG 7 — PROBLEMAS TIPO A (tabla incompleta)
   3 problemas con celdas ocultas que el estudiante
   debe completar eligiendo el sistema de representación.
════════════════════════════════════════════════ */
const PROBLEMAS_A = [
  {
    enunciado: 'La siguiente tabla registra la preferencia de <strong>80 estudiantes UIS</strong> según su <strong>semestre</strong> (Primeros / Medios / Últimos) y el <strong>tipo de evaluación preferida</strong> (Oral / Escrita / Proyecto). Algunas celdas están ocultas.',
    pregunta: '¿Qué sistema de representación usarías para saber, <em>dentro del grupo de últimos semestres</em>, qué tipo de evaluación prefieren más? Completa las celdas vacías.',
    filas: ['Primeros', 'Medios', 'Últimos'],
    columnas: ['Oral', 'Escrita', 'Proyecto'],
    matriz: [[8,14,8],[6,12,12],[4,8,8]],
    ocultas: [[1,0],[1,2],[2,1]],   // [fila,col] que se ocultan
    respuestaCorrecta: 'fila',      // sistema que responde la pregunta
    N: 80
  },
  {
    enunciado: 'Tabla de <strong>100 estudiantes UIS</strong> cruzando <strong>tipo de vivienda</strong> (Propia / Arrendada / Residencia) con <strong>satisfacción académica</strong> (Alta / Media / Baja). Algunas celdas están ocultas.',
    pregunta: '¿Qué porcentaje del <em>total de encuestados</em> vive en arriendo y tiene satisfacción alta? Completa las celdas vacías.',
    filas: ['Propia', 'Arrendada', 'Residencia'],
    columnas: ['Alta', 'Media', 'Baja'],
    matriz: [[15,10,5],[12,18,10],[8,14,8]],
    ocultas: [[0,2],[1,0],[2,2]],
    respuestaCorrecta: 'total',
    N: 100
  },
  {
    enunciado: 'Tabla de <strong>120 estudiantes</strong> cruzando <strong>área de conocimiento</strong> (Exactas / Sociales / Artes) y <strong>medio de acceso a internet</strong> (Móvil / Fijo / Universidad). Algunas celdas están ocultas.',
    pregunta: 'De quienes acceden por <em>red universitaria</em>, ¿qué porcentaje es de Exactas? Completa las celdas vacías.',
    filas: ['Exactas', 'Sociales', 'Artes'],
    columnas: ['Móvil', 'Fijo', 'Universidad'],
    matriz: [[20,12,18],[15,10,15],[14,8,8]],
    ocultas: [[0,0],[1,2],[2,1]],
    respuestaCorrecta: 'columna',
    N: 120
  }
];

let probAActual  = 0;
let tipoEscogidoA = null;  // tipo que el estudiante seleccionó
let probAIniciado = false;

/* ── Escogencia del tipo en pág 7 — actualiza tabla inmediatamente ── */
function escogerTipoA(tipo) {
  tipoEscogidoA = tipo;
  document.querySelectorAll('#page-7 .pts-btn').forEach(b => {
    b.classList.remove('selected','correcto','incorrecto');
    if (b.dataset.tipo === tipo) b.classList.add('selected');
  });
  const fb = document.getElementById('probA-tipo-feedback');
  if (fb) fb.style.display = 'none';
  _renderizarTablaA(); // solo re-renderiza la tabla, no toca el enunciado
}

function renderizarProbA() {
  const p = PROBLEMAS_A[probAActual];
  const el_en = document.getElementById('probA-enunciado');
  const el_pq = document.getElementById('probA-pregunta');
  const el_ct = document.getElementById('probA-counter');
  const el_bg = document.getElementById('probA-num-badge');
  const el_fb = document.getElementById('probA-feedback');
  if (el_en) el_en.innerHTML = p.enunciado;
  if (el_pq) el_pq.innerHTML = p.pregunta;
  if (el_ct) el_ct.textContent = `${probAActual+1} / ${PROBLEMAS_A.length}`;
  if (el_bg) el_bg.textContent = probAActual + 1;
  if (el_fb) el_fb.style.display = 'none';

  // Reset tipo SOLO al cargar un problema nuevo (no al cambiar tipo)
  tipoEscogidoA = null;
  document.querySelectorAll('#page-7 .pts-btn').forEach(b => b.classList.remove('selected','correcto','incorrecto'));
  const fbTipo = document.getElementById('probA-tipo-feedback');
  if (fbTipo) fbTipo.style.display = 'none';

  _renderizarTablaA();
}

// Renderiza SOLO la tabla según el tipo activo (sin tocar el enunciado)
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
      const esOculta = ocultas.some(([oi,oj]) => oi===i && oj===j);
      const valorCorrecto = calcularCeldaNum(tipo, val, totalesFila[i], totalesCol[j], N);
      const celdaDisplay  = calcularCelda(tipo, val, totalesFila[i], totalesCol[j], N);
      if (esOculta) {
        html += `<td><input type="number" step="any" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${valorCorrecto}" placeholder="?"></td>`;
      } else {
        html += `<td>${celdaDisplay}</td>`;
      }
    });
    html += `<td class="td-marg">${calcularMarginalFila(tipo, totalesFila[i], N)}</td></tr>`;
  });

  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td class="td-marg">${calcularMarginalCol(tipo, tc, N)}</td>`; });
  html += `<td class="td-marg">${tipo === 'absoluta' ? N : '100%'}</td></tr></tbody></table>`;

  const w = document.getElementById('probA-tabla-wrapper');
  if (w) w.innerHTML = html;
}

// Retorna el número puro para comparar (sin el %)
function calcularCeldaNum(tipo, val, totalFila, totalCol, N) {
  if (tipo === 'absoluta') return val;
  if (tipo === 'total')    return parseFloat((val / N * 100).toFixed(1));
  if (tipo === 'fila')     return parseFloat((val / totalFila * 100).toFixed(1));
  if (tipo === 'columna')  return parseFloat((val / totalCol * 100).toFixed(1));
  return val;
}

function verificarProblemaA() {
  const p = PROBLEMAS_A[probAActual];

  // 1. Evaluar escogencia del tipo
  const fbTipo = document.getElementById('probA-tipo-feedback');
  if (!tipoEscogidoA) {
    if (fbTipo) { fbTipo.style.display='block'; fbTipo.className='pts-feedback error'; fbTipo.textContent='⚠️ Primero selecciona el sistema de representación adecuado.'; }
    return;
  }
  const tipoOk = tipoEscogidoA === p.respuestaCorrecta;
  document.querySelectorAll('#page-7 .pts-btn').forEach(b => {
    b.classList.remove('correcto','incorrecto');
    if (b.dataset.tipo === tipoEscogidoA) b.classList.add(tipoOk ? 'correcto' : 'incorrecto');
  });
  if (fbTipo) {
    fbTipo.style.display = 'block';
    if (tipoOk) {
      fbTipo.className = 'pts-feedback ok';
      fbTipo.innerHTML = `✅ ¡Correcto! El <strong>% por ${p.respuestaCorrecta}</strong> es el sistema adecuado para responder esta pregunta.`;
    } else {
      fbTipo.className = 'pts-feedback error';
      fbTipo.innerHTML = `❌ El sistema <strong>${tipoEscogidoA}</strong> no es el más adecuado. Piensa: ¿qué grupo es el "universo" de la pregunta?`;
    }
  }

  // 2. Evaluar celdas
  const inputs = document.querySelectorAll('#probA-tabla-wrapper .cell-input');
  let correctas = 0; let total = inputs.length;
  inputs.forEach(inp => {
    const val      = parseFloat(inp.value);
    const correcto = parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && Math.abs(val - correcto) < 0.2) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value !== '') inp.classList.add('incorrecto');
  });

  const fb = document.getElementById('probA-feedback');
  if (fb) {
    fb.style.display = 'block';
    if (correctas === total && tipoOk) {
      fb.className='prob-feedback ok';
      fb.innerHTML=`✅ ¡Perfecto! Escogiste el sistema correcto y completaste todas las celdas.`;
    } else if (correctas === total && !tipoOk) {
      fb.className='prob-feedback parcial';
      fb.innerHTML=`⚠️ Las celdas son correctas para el tipo que escogiste, pero el sistema no es el más adecuado para responder la pregunta.`;
    } else {
      fb.className='prob-feedback parcial';
      fb.innerHTML=`⚠️ ${correctas} de ${total} celdas correctas. Las incorrectas están en rojo.`;
    }
  }
}

function cambiarProbA(dir) {
  const nuevo = probAActual + dir;
  if (nuevo < 0 || nuevo >= PROBLEMAS_A.length) return;
  probAActual = nuevo;
  tipoEscogidoA = null;
  renderizarProbA();
}

/* ════════════════════════════════════════════════
   PÁG 8 — PROBLEMAS TIPO B (construir tabla)
════════════════════════════════════════════════ */
const PROBLEMAS_B = [
  {
    enunciado: 'Se encuestaron <strong>90 estudiantes</strong> de la UIS sobre su <strong>medio de transporte</strong> (Bus / Bicicleta / A pie) y su <strong>puntualidad</strong> (Siempre / A veces / Nunca).',
    frases: [
      '30 estudiantes usan Bus.',
      'De quienes usan Bicicleta, la mitad llega Siempre.',
      '10 estudiantes van A pie y llegan A veces.',
      'Solo 3 estudiantes van A pie y Nunca llegan.',
      'En total, 24 estudiantes llegan Siempre a tiempo.'
    ],
    pregunta: '¿Qué medio de transporte se asocia con mejor puntualidad?',
    filas: ['Bus', 'Bicicleta', 'A pie'],
    columnas: ['Siempre', 'A veces', 'Nunca'],
    solucion: [[10,14,6],[12,8,5],[2,10,3]],
    respuestaCorrecta: 'absoluta',
    N: 90
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
    filas: ['Matemáticas', 'Física', 'Estadística'],
    columnas: ['R', 'Python', 'SPSS'],
    solucion: [[12,11,2],[6,6,3],[4,8,8]],
    respuestaCorrecta: 'fila',
    N: 60
  },
  {
    enunciado: 'Se encuestaron <strong>75 estudiantes</strong> sobre su <strong>nivel de inglés</strong> (Básico / Intermedio / Avanzado) y su <strong>participación en intercambios</strong> (Sí / No).',
    frases: [
      '30 estudiantes tienen nivel Básico.',
      '20 estudiantes tienen nivel Avanzado.',
      'El 60% de los de nivel Avanzado participó en intercambio.',
      'Solo 3 estudiantes de nivel Básico participaron.',
      'En total, 22 estudiantes participaron en intercambio.'
    ],
    pregunta: 'De quienes participaron en intercambio, ¿de qué nivel son?',
    filas: ['Básico', 'Intermedio', 'Avanzado'],
    columnas: ['Sí', 'No'],
    solucion: [[3,27],[7,18],[12,8]],
    respuestaCorrecta: 'columna',
    N: 75
  }
];

let probBActual    = 0;
let tipoEscogidoB  = null;
let probBIniciado  = false;

function escogerTipoB(tipo) {
  tipoEscogidoB = tipo;
  document.querySelectorAll('#page-8 .pts-btn').forEach(b => {
    b.classList.remove('selected','correcto','incorrecto');
    if (b.dataset.tipo === tipo) b.classList.add('selected');
  });
  const fb = document.getElementById('probB-tipo-feedback');
  if (fb) fb.style.display = 'none';
  // Actualizar tabla inmediatamente — misma lógica que probA
  _renderizarTablaB();
}

function renderizarProbB() {
  const p = PROBLEMAS_B[probBActual];
  const el_en = document.getElementById('probB-enunciado');
  const el_pq = document.getElementById('probB-pregunta');
  const el_nm = document.getElementById('probB-num');
  const el_ct = document.getElementById('probB-counter');
  const el_fb = document.getElementById('probB-feedback');
  if (el_en) el_en.innerHTML = p.enunciado;
  if (el_pq) el_pq.innerHTML = p.pregunta;
  if (el_nm) el_nm.textContent = probBActual + 1;
  if (el_ct) el_ct.textContent = `${probBActual+1} / ${PROBLEMAS_B.length}`;
  if (el_fb) el_fb.style.display = 'none';

  const frasesEl = document.getElementById('probB-frases');
  if (frasesEl) frasesEl.innerHTML = p.frases.map(f => `<div class="prob-frase">• ${f}</div>`).join('');

  // Reset tipo SOLO al cargar problema nuevo
  tipoEscogidoB = null;
  document.querySelectorAll('#page-8 .pts-btn').forEach(b => b.classList.remove('selected','correcto','incorrecto'));
  const fbTipo = document.getElementById('probB-tipo-feedback');
  if (fbTipo) fbTipo.style.display = 'none';

  _renderizarTablaB();
}

// Renderiza tabla B con los valores según el tipo escogido
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
    const margVal = calcularMarginalFila(tipo, totalesFila[i], N);
    html += `<td class="td-marg">${margVal}</td></tr>`;
  });

  html += '<tr><td>Total col</td>';
  totalesCol.forEach(tc => {
    const margCol = calcularMarginalCol(tipo, tc, N);
    html += `<td class="td-marg">${margCol}</td>`;
  });
  html += `<td class="td-marg">${tipo === 'absoluta' ? N : '100%'}</td></tr>`;
  html += '</tbody></table>';
  const w = document.getElementById('probB-tabla-wrapper');
  if (w) w.innerHTML = html;
}

function verificarProblemaB() {
  const p = PROBLEMAS_B[probBActual];

  // 1. Escogencia del tipo
  const fbTipo = document.getElementById('probB-tipo-feedback');
  if (!tipoEscogidoB) {
    if (fbTipo) { fbTipo.style.display='block'; fbTipo.className='pts-feedback error'; fbTipo.textContent='⚠️ Primero selecciona el sistema de representación.'; }
    return;
  }
  const tipoOk = tipoEscogidoB === p.respuestaCorrecta;
  document.querySelectorAll('#page-8 .pts-btn').forEach(b => {
    b.classList.remove('correcto','incorrecto');
    if (b.dataset.tipo === tipoEscogidoB) b.classList.add(tipoOk ? 'correcto' : 'incorrecto');
  });
  if (fbTipo) {
    fbTipo.style.display = 'block';
    fbTipo.className = tipoOk ? 'pts-feedback ok' : 'pts-feedback error';
    fbTipo.innerHTML = tipoOk
      ? `✅ ¡Correcto! <strong>${p.respuestaCorrecta}</strong> es el sistema adecuado.`
      : `❌ El sistema <strong>${tipoEscogidoB}</strong> no es el adecuado. ¿Quién es el "universo" de comparación?`;
  }

  // 2. Celdas internas
  const inputs = document.querySelectorAll('#probB-tabla-wrapper .cell-input');
  let correctas=0; let total=inputs.length;
  inputs.forEach(inp => {
    const val=parseFloat(inp.value), correcto=parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && Math.abs(val-correcto)<0.2) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value!=='') inp.classList.add('incorrecto');
  });

  const fb = document.getElementById('probB-feedback');
  if (fb) {
    fb.style.display='block';
    if (correctas===total && tipoOk) {
      fb.className='prob-feedback ok';
      fb.innerHTML='✅ ¡Excelente! Escogiste el sistema correcto y construiste la tabla completa correctamente.';
    } else if (correctas===total && !tipoOk) {
      fb.className='prob-feedback parcial';
      fb.innerHTML='⚠️ Los valores son correctos pero el sistema de representación no responde la pregunta planteada.';
    } else {
      fb.className='prob-feedback parcial';
      fb.innerHTML=`⚠️ ${correctas} de ${total} celdas correctas. Las incorrectas están en rojo.`;
    }
  }
}

function cambiarProbB(dir) {
  const nuevo = probBActual + dir;
  if (nuevo < 0 || nuevo >= PROBLEMAS_B.length) return;
  probBActual = nuevo;
  tipoEscogidoB = null;
  renderizarProbB();
}

/* ════════════════════════════════════════════════
   PÁG 9 — ABREBOCAS CHI-CUADRADO
   El estudiante distribuye libremente datos en una
   tabla y la IA lo lleva a sentir la necesidad de
   una prueba formal — sin introducirla aún.
════════════════════════════════════════════════ */

const PROBLEMAS_CHI = [
  {
    badge: 'Situación 1',
    enunciado: 'En la UIS se quiere estudiar si existe relación entre el <strong>turno de clase preferido</strong> (Mañana / Tarde / Noche) y el <strong>rendimiento académico</strong> (Alto / Bajo). Se encuestaron <strong>90 estudiantes</strong>.',
    afirmacion: '"Los estudiantes que prefieren el turno de mañana tienden a tener mejor rendimiento académico."',
    filas: ['Mañana', 'Tarde', 'Noche'],
    columnas: ['Alto', 'Bajo'],
    totalesFila: [30, 35, 25],   // fijos — el estudiante solo distribuye dentro de cada fila
    N: 90
  },
  {
    badge: 'Situación 2',
    enunciado: 'Se investiga si hay relación entre el <strong>tipo de alimentación</strong> (Casera / Restaurante / Cafetería UIS) y el <strong>nivel de energía auto-reportado</strong> (Alto / Medio / Bajo) en <strong>120 estudiantes</strong> de la UIS.',
    afirmacion: '"Los estudiantes que comen en casa tienen mayor nivel de energía que los que comen en restaurante o cafetería."',
    filas: ['Casera', 'Restaurante', 'Cafetería UIS'],
    columnas: ['Alto', 'Medio', 'Bajo'],
    totalesFila: [40, 45, 35],
    N: 120
  }
];

let chiActual   = 0;
let chiIniciado = false;

function cambiarProbChi(idx) {
  chiActual = idx;
  document.querySelectorAll('.chi-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  renderizarChi();
}

function renderizarChi() {
  const p = PROBLEMAS_CHI[chiActual];
  const el_en = document.getElementById('chi-enunciado');
  const el_af = document.getElementById('chi-afirmacion');
  const el_bg = document.getElementById('chi-badge');
  const el_nl = document.getElementById('chi-N-label');
  const el_nd = document.getElementById('chi-N-display');
  const el_fb = document.getElementById('chi-feedback');
  if (el_en) el_en.innerHTML = p.enunciado;
  if (el_af) el_af.innerHTML = p.afirmacion;
  if (el_bg) el_bg.textContent = p.badge;
  if (el_nl) el_nl.textContent = p.N;
  if (el_nd) el_nd.textContent = p.N;
  if (el_fb) el_fb.style.display = 'none';

  // Tira de totales de fila (fijos)
  const strip = document.getElementById('chi-totales-strip');
  if (strip) {
    strip.innerHTML = p.filas.map((f,i) =>
      `<div class="chi-total-item"><span class="chi-total-label">${f}</span><span class="chi-total-val">${p.totalesFila[i]} encuestados</span></div>`
    ).join('');
  }

  // Tabla editable — el estudiante llena la distribución dentro de cada fila
  const { filas, columnas, totalesFila } = p;
  let html = '<table><thead><tr><th>Turno / Categoría</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total fila</th></tr></thead><tbody>';

  filas.forEach((fila, i) => {
    html += `<tr><td>${fila}</td>`;
    columnas.forEach((_, j) => {
      html += `<td><input type="number" min="0" class="cell-input chi-input"
        data-fila="${i}" data-col="${j}" placeholder="?"
        oninput="actualizarContadorChi()"></td>`;
    });
    html += `<td class="td-marg chi-total-fila" id="chi-marg-fila-${i}">${totalesFila[i]}</td></tr>`;
  });

  // Fila de totales de columna (calculados automáticamente)
  html += '<tr><td>Total col</td>';
  columnas.forEach((_, j) => {
    html += `<td class="td-marg" id="chi-marg-col-${j}">0</td>`;
  });
  html += `<td class="td-marg" id="chi-marg-total">${p.N}</td></tr>`;
  html += '</tbody></table>';

  const w = document.getElementById('chi-tabla-wrapper');
  if (w) w.innerHTML = html;

  actualizarContadorChi();
}

function actualizarContadorChi() {
  const p = PROBLEMAS_CHI[chiActual];
  const inputs = document.querySelectorAll('.chi-input');
  let total = 0;

  // Calcular totales de columna
  const totalPorCol = p.columnas.map(() => 0);
  inputs.forEach(inp => {
    const val = parseInt(inp.value) || 0;
    total += val;
    const j = parseInt(inp.dataset.col);
    totalPorCol[j] += val;
  });

  // Actualizar totales de columna en tabla
  p.columnas.forEach((_, j) => {
    const el = document.getElementById(`chi-marg-col-${j}`);
    if (el) el.textContent = totalPorCol[j];
  });

  // Barra de progreso
  const contador = document.getElementById('chi-total-contador');
  const barra    = document.getElementById('chi-progress-bar');
  if (contador) contador.textContent = total;
  if (barra) {
    const pct = Math.min(100, Math.round(total / p.N * 100));
    barra.style.width = pct + '%';
    barra.style.background = total === p.N ? 'var(--moss)' : total > p.N ? '#dc3545' : 'var(--sky)';
  }
}

function enviarTablaChiAlTutor() {
  const p = PROBLEMAS_CHI[chiActual];
  const inputs = document.querySelectorAll('.chi-input');

  // Leer tabla
  const tabla = p.filas.map((_, i) =>
    p.columnas.map((_, j) => {
      const inp = document.querySelector(`.chi-input[data-fila="${i}"][data-col="${j}"]`);
      return parseInt(inp?.value) || 0;
    })
  );

  // Verificar que suma N
  const total = tabla.flat().reduce((s,v)=>s+v,0);
  const fb = document.getElementById('chi-feedback');
  if (total !== p.N) {
    if (fb) { fb.style.display='block'; fb.className='prob-feedback error'; fb.innerHTML=`⚠️ La suma de tus celdas es <strong>${total}</strong>, pero deben ser <strong>${p.N}</strong>. Ajusta los valores.`; }
    return;
  }
  if (fb) fb.style.display = 'none';

  // Calcular % por fila para dar contexto al tutor
  const porcentajesFila = tabla.map((fila, i) =>
    fila.map(val => `${(val/p.totalesFila[i]*100).toFixed(1)}%`).join(' / ')
  );

  const contexto = `El estudiante está explorando la Situación ${chiActual+1}.
Afirmación: ${p.afirmacion}
Encuestados: N=${p.N}

La tabla que construyó es:
${p.filas.map((f,i) => `${f}: ${tabla[i].join(', ')} (total=${p.totalesFila[i]}) → % por fila: ${porcentajesFila[i]}`).join('\n')}

Totales por columna: ${p.columnas.map((c,j) => `${c}=${tabla.map(r=>r[j]).reduce((s,v)=>s+v,0)}`).join(', ')}

Tu rol: Hazle preguntas que lo lleven a notar que:
1. La afirmación parece cumplirse con su distribución — pero también podrían construirse otras tablas que la contradigan con los mismos totales marginales.
2. Desde la descripción de los datos no se puede afirmar con certeza si la asociación es real o producto del azar.
3. Genera la curiosidad: ¿existirá alguna herramienta estadística que permita responder esto con certeza? (NO menciones chi-cuadrado aún — solo deja la pregunta abierta).`;

  enviarContextoChi(contexto);
}

async function inicializarTutorChi() {
  setStatusChi('Conectando…');
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hola, estoy en la sección de exploración libre. Quiero distribuir datos y discutir si puedo afirmar algo con certeza.',
        session_id: `chi_${sessionId}`
      })
    });
    const data = await res.json();
    if (data.reply) agregarMensajeChi(data.reply, 'tutor');
    setStatusChi('En línea');
  } catch(e) {
    console.error('Error tutor chi:', e);
    agregarMensajeChi('¡Hola! Distribuye los datos en la tabla como creas que refleja la afirmación y envíamela. Te haré preguntas para que reflexionemos juntos.', 'tutor');
    setStatusChi('En línea');
  }
}

async function enviarContextoChi(contexto) {
  setStatusChi('Analizando…');
  const tid = agregarTypingGen('chat-chi');
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[CONTEXTO]: ${contexto}`, session_id: `chi_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    if (data.reply) agregarMensajeChi(data.reply, 'tutor');
    setStatusChi('En línea');
  } catch(e) {
    quitarTypingGen(tid);
    console.error('Error contexto chi:', e);
    setStatusChi('En línea');
  }
}

async function enviarMensajeChi() {
  const input = document.getElementById('input-chi');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeChi(texto, 'user');
  setStatusChi('Escribiendo…');
  const tid = agregarTypingGen('chat-chi');
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `chi_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    if (data.reply) agregarMensajeChi(data.reply, 'tutor');
    setStatusChi('En línea');
  } catch(e) {
    quitarTypingGen(tid);
    console.error('Error mensaje chi:', e);
    setStatusChi('En línea');
  }
}

function agregarMensajeChi(texto, tipo) {
  const box = document.getElementById('chat-chi');
  if (!box) return;
  const div = document.createElement('div');
  div.className = tipo === 'user' ? 'msg-user' : 'msg-tutor';
  const procesado = tipo === 'tutor' ? limpiarFormulas(texto) : texto;
  div.innerHTML = procesado
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/\n\n/g,'<br><br>').replace(/\n/g,'<br>');
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
function setStatusChi(txt) { const el=document.getElementById('tutor-status-chi'); if(el) el.textContent=txt; }

/* ── Helper typing genérico ── */
function agregarTypingGen(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return null;
  const id = 'tg-' + Date.now();
  const div = document.createElement('div');
  div.id = id; div.className = 'msg-typing';
  div.textContent = 'El tutor está escribiendo…';
  box.appendChild(div); box.scrollTop = box.scrollHeight;
  return id;
}
function quitarTypingGen(id) { if (id) document.getElementById(id)?.remove(); }

/* ════════════════════════════════
   INIT
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(ocultarLoading, 800);

  const repDot = document.getElementById('rep-dot');
  if (repDot) repDot.className = 'rep-dot is-tabla';

  cargarHistorial(sessionId, 'chat-box');
  cargarHistorial(`cap3_${sessionId}`, 'chat-box2');

  renderizarFPTabla('absoluta');
  renderizarFPRefTable();
  renderizarEjTabla('absoluta');
  renderizarEjGrafico('absoluta');
  renderizarProbA();
  renderizarProbB();
  renderizarChi();
});
