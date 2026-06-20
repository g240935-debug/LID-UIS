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

let probAActual = 0;
let repAActual = 'absoluta';

function renderizarProbA() {
  const p = PROBLEMAS_A[probAActual];
  document.getElementById('probA-enunciado').innerHTML = p.enunciado;
  document.getElementById('probA-pregunta').innerHTML  = p.pregunta;
  document.getElementById('probA-counter').textContent = `${probAActual+1} / ${PROBLEMAS_A.length}`;
  document.getElementById('probA-feedback').style.display = 'none';
  repAActual = 'absoluta';
  document.getElementById('btn-rep-A-label').textContent = 'Ver como % por fila';
  document.getElementById('btn-rep-A')?.classList.remove('is-chart');

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
      const celda = calcularCelda(repAActual, val, totalesFila[i], totalesCol[j], N);
      if (esOculta) {
        html += `<td><input type="number" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${val}" placeholder="?"></td>`;
      } else {
        html += `<td>${celda}</td>`;
      }
    });
    html += `<td class="td-marg">${totalesFila[i]}</td></tr>`;
  });

  html += '<tr><td>Total</td>';
  totalesCol.forEach(tc => { html += `<td>${tc}</td>`; });
  html += `<td>${N}</td></tr></tbody></table>`;

  document.getElementById('probA-tabla-wrapper').innerHTML = html;
}

function toggleRepA() {
  const tipos = ['absoluta','total','fila','columna'];
  const idx = tipos.indexOf(repAActual);
  repAActual = tipos[(idx+1) % tipos.length];
  const labels = { absoluta:'Ver como % total', total:'Ver como % fila', fila:'Ver como % columna', columna:'Ver como frecuencias' };
  document.getElementById('btn-rep-A-label').textContent = labels[repAActual];
  // Re-renderizar manteniendo los valores ingresados
  const inputs = document.querySelectorAll('#probA-tabla-wrapper .cell-input');
  const valores = {};
  inputs.forEach(inp => { valores[`${inp.dataset.fila}_${inp.dataset.col}`] = inp.value; });
  renderizarProbA();
  // Restaurar valores
  setTimeout(() => {
    document.querySelectorAll('#probA-tabla-wrapper .cell-input').forEach(inp => {
      const key = `${inp.dataset.fila}_${inp.dataset.col}`;
      if (valores[key]) inp.value = valores[key];
    });
  }, 50);
}

function verificarProblemaA() {
  const inputs = document.querySelectorAll('#probA-tabla-wrapper .cell-input');
  let correctas = 0; let total = inputs.length;
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    const correcto = parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && val === correcto) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value !== '') inp.classList.add('incorrecto');
  });

  const fb = document.getElementById('probA-feedback');
  fb.style.display = 'block';
  const p = PROBLEMAS_A[probAActual];

  if (correctas === total) {
    fb.className = 'prob-feedback ok';
    fb.innerHTML = `✅ ¡Correcto! Todas las celdas son correctas. El sistema de representación adecuado para esta pregunta es <strong>% ${p.respuestaCorrecta}</strong>.`;
    enviarContextoProbA(`El estudiante completó correctamente todas las celdas del Problema ${probAActual+1}. Confirma y explica por qué el % ${p.respuestaCorrecta} es el sistema adecuado para responder la pregunta planteada.`);
  } else if (correctas === 0) {
    fb.className = 'prob-feedback error';
    fb.innerHTML = `❌ Ninguna celda es correcta todavía. Revisa los datos del enunciado y vuelve a intentarlo.`;
    enviarContextoProbA(`El estudiante no pudo completar ninguna celda del Problema ${probAActual+1}. La pregunta es: "${p.pregunta}". Guíalo con una pista sin dar la respuesta directa.`);
  } else {
    fb.className = 'prob-feedback parcial';
    fb.innerHTML = `⚠️ ${correctas} de ${total} celdas correctas. Revisa las marcadas en rojo.`;
    enviarContextoProbA(`El estudiante completó ${correctas} de ${total} celdas del Problema ${probAActual+1}. Tiene errores. Guíalo para que encuentre dónde se equivocó sin decirle la respuesta.`);
  }
}

function cambiarProbA(dir) {
  const nuevo = probAActual + dir;
  if (nuevo < 0 || nuevo >= PROBLEMAS_A.length) return;
  probAActual = nuevo;
  renderizarProbA();
}

/* ── Tutor Tipo A ── */
let probAIniciado = false;

async function enviarContextoProbA(contexto) {
  setStatusProbA('Analizando…');
  const msg = `[CONTEXTO AUTOMÁTICO]: ${contexto}`;
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, session_id: `probA_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) agregarMensajeProbA(data.reply, 'tutor');
    setStatusProbA('En línea');
  } catch { setStatusProbA('En línea'); }
}

async function enviarMensajeProbA() {
  const input = document.getElementById('input-probA');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeProbA(texto, 'user');
  setStatusProbA('Escribiendo…');
  const tid = agregarTypingGen('chat-probA');
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `probA_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    if (data.reply) agregarMensajeProbA(data.reply, 'tutor');
    setStatusProbA('En línea');
  } catch { quitarTypingGen(tid); setStatusProbA('En línea'); }
}

function agregarMensajeProbA(texto, tipo) {
  const box = document.getElementById('chat-probA');
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

function setStatusProbA(txt) {
  const el = document.getElementById('tutor-status-probA');
  if (el) el.textContent = txt;
}

/* ════════════════════════════════════════════════
   PÁG 7 — PROBLEMAS TIPO B (construir tabla)
   3 problemas: se da N y frases; el estudiante
   debe llenar TODA la tabla para que responda.
════════════════════════════════════════════════ */
const PROBLEMAS_B = [
  {
    enunciado: 'Se encuestaron <strong>90 estudiantes</strong> de la UIS sobre su <strong>medio de transporte</strong> (Bus / Bicicleta / A pie) y su <strong>puntualidad</strong> (Siempre / A veces / Nunca).',
    frases: [
      '30 estudiantes usan Bus.',
      '24 estudiantes llegan Siempre a tiempo.',
      'De quienes usan Bicicleta, el 50% llega Siempre.',
      '10 estudiantes van A pie y llegan A veces.',
      'Solo 3 estudiantes van A pie y Nunca llegan.'
    ],
    pregunta: 'Construye la tabla en frecuencias absolutas que permita responder: ¿qué medio de transporte tiene mejor puntualidad?',
    filas: ['Bus', 'Bicicleta', 'A pie'],
    columnas: ['Siempre', 'A veces', 'Nunca'],
    solucion: [[10,14,6],[12,8,5],[2,10,3]],
    N: 90
  },
  {
    enunciado: 'Se encuestaron <strong>60 estudiantes</strong> sobre su <strong>programa académico</strong> (Matemáticas / Física / Estadística) y su <strong>uso de software estadístico</strong> (R / Python / SPSS).',
    frases: [
      '25 estudiantes son de Matemáticas.',
      'El 40% de los estudiantes de Física usa R.',
      '8 estudiantes de Estadística usan Python.',
      'Solo 2 estudiantes de Matemáticas usan SPSS.',
      'En total, 22 estudiantes usan Python.'
    ],
    pregunta: 'Construye la tabla en % por fila que responda: dentro de cada programa, ¿cuál es el software más usado?',
    filas: ['Matemáticas', 'Física', 'Estadística'],
    columnas: ['R', 'Python', 'SPSS'],
    solucion: [[12,11,2],[6,6,3],[4,8,8]],
    N: 60
  },
  {
    enunciado: 'Se encuestaron <strong>75 estudiantes</strong> sobre su <strong>nivel de inglés</strong> (Básico / Intermedio / Avanzado) y su <strong>participación en intercambios</strong> (Sí / No).',
    frases: [
      'El 60% de los estudiantes de nivel Avanzado participó en intercambio.',
      '30 estudiantes tienen nivel Básico.',
      'Solo 3 estudiantes de nivel Básico participaron.',
      '20 estudiantes tienen nivel Avanzado.',
      'En total, 22 estudiantes participaron en intercambio.'
    ],
    pregunta: 'Construye la tabla en % por columna que responda: de quienes participaron en intercambio, ¿de qué nivel son?',
    filas: ['Básico', 'Intermedio', 'Avanzado'],
    columnas: ['Sí', 'No'],
    solucion: [[3,27],[7,18],[12,8]],
    N: 75
  }
];

let probBActual = 0;

function renderizarProbB() {
  const p = PROBLEMAS_B[probBActual];
  document.getElementById('probB-enunciado').innerHTML = p.enunciado;
  document.getElementById('probB-pregunta').innerHTML  = p.pregunta;
  document.getElementById('probB-num').textContent     = probBActual + 1;
  document.getElementById('probB-counter').textContent = `${probBActual+1} / ${PROBLEMAS_B.length}`;
  document.getElementById('probB-feedback').style.display = 'none';

  // Frases
  const frasesEl = document.getElementById('probB-frases');
  if (frasesEl) {
    frasesEl.innerHTML = p.frases.map(f => `<div class="prob-frase">• ${f}</div>`).join('');
  }

  // Tabla editable — todas las celdas vacías excepto encabezados
  const { filas, columnas, N } = p;
  let html = '<table><thead><tr><th>↓ Filas / Columnas →</th>';
  columnas.forEach(c => { html += `<th>${c}</th>`; });
  html += '<th>Total fila</th></tr></thead><tbody>';

  filas.forEach((fila, i) => {
    html += `<tr><td>${fila}</td>`;
    columnas.forEach((_, j) => {
      html += `<td><input type="number" class="cell-input" data-fila="${i}" data-col="${j}" data-correcto="${p.solucion[i][j]}" placeholder="?"></td>`;
    });
    html += `<td><input type="number" class="cell-input cell-marg-input" data-tipo="fila" data-idx="${i}" placeholder="?"></td></tr>`;
  });

  html += '<tr><td>Total col</td>';
  columnas.forEach((_, j) => {
    html += `<td><input type="number" class="cell-input cell-marg-input" data-tipo="col" data-idx="${j}" placeholder="?"></td>`;
  });
  html += `<td><input type="number" class="cell-input cell-marg-input" data-tipo="n" placeholder="${N}"></td></tr>`;
  html += '</tbody></table>';

  document.getElementById('probB-tabla-wrapper').innerHTML = html;
}

function verificarProblemaB() {
  const inputs = document.querySelectorAll('#probB-tabla-wrapper .cell-input:not(.cell-marg-input)');
  let correctas = 0; let total = inputs.length;
  inputs.forEach(inp => {
    const val = parseFloat(inp.value);
    const correcto = parseFloat(inp.dataset.correcto);
    inp.classList.remove('correcto','incorrecto');
    if (!isNaN(val) && val === correcto) { inp.classList.add('correcto'); correctas++; }
    else if (inp.value !== '') inp.classList.add('incorrecto');
  });

  const fb = document.getElementById('probB-feedback');
  fb.style.display = 'block';
  const p = PROBLEMAS_B[probBActual];

  if (correctas === total) {
    fb.className = 'prob-feedback ok';
    fb.innerHTML = `✅ ¡Excelente! Construiste correctamente la tabla completa.`;
    enviarContextoProbB(`El estudiante construyó correctamente toda la tabla del Problema ${probBActual+1}. Felicítalo y refuerza por qué este sistema de representación responde la pregunta planteada.`);
  } else if (correctas === 0) {
    fb.className = 'prob-feedback error';
    fb.innerHTML = `❌ Todavía no hay celdas correctas. Usa las frases del enunciado como pistas.`;
    enviarContextoProbB(`El estudiante no pudo construir ninguna celda del Problema ${probBActual+1}. Las frases pista son: ${p.frases.join(' | ')}. Guíalo sin dar la respuesta directa.`);
  } else {
    fb.className = 'prob-feedback parcial';
    fb.innerHTML = `⚠️ ${correctas} de ${total} celdas correctas. Sigue revisando.`;
    enviarContextoProbB(`El estudiante tiene ${correctas} de ${total} celdas correctas en el Problema ${probBActual+1}. Tiene errores. Haz una pregunta guía para que revise sus cálculos.`);
  }
}

function cambiarProbB(dir) {
  const nuevo = probBActual + dir;
  if (nuevo < 0 || nuevo >= PROBLEMAS_B.length) return;
  probBActual = nuevo;
  renderizarProbB();
}

/* ── Tutor Tipo B ── */
async function enviarContextoProbB(contexto) {
  setStatusProbB('Analizando…');
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: `[CONTEXTO AUTOMÁTICO]: ${contexto}`, session_id: `probB_${sessionId}` })
    });
    const data = await res.json();
    if (data.reply) agregarMensajeProbB(data.reply, 'tutor');
    setStatusProbB('En línea');
  } catch { setStatusProbB('En línea'); }
}

async function enviarMensajeProbB() {
  const input = document.getElementById('input-probB');
  if (!input?.value.trim()) return;
  const texto = input.value.trim(); input.value = '';
  agregarMensajeProbB(texto, 'user');
  setStatusProbB('Escribiendo…');
  const tid = agregarTypingGen('chat-probB');
  try {
    const res = await fetch(URL_BACKEND, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: texto, session_id: `probB_${sessionId}` })
    });
    const data = await res.json();
    quitarTypingGen(tid);
    if (data.reply) agregarMensajeProbB(data.reply, 'tutor');
    setStatusProbB('En línea');
  } catch { quitarTypingGen(tid); setStatusProbB('En línea'); }
}

function agregarMensajeProbB(texto, tipo) {
  const box = document.getElementById('chat-probB');
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

function setStatusProbB(txt) {
  const el = document.getElementById('tutor-status-probB');
  if (el) el.textContent = txt;
}

/* ── Cambiar entre tipo A y B ── */
function cambiarTipoProblema(tipo) {
  document.querySelectorAll('.prob-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`ptab-${tipo}`)?.classList.add('active');
  document.getElementById('prob-tipo-A').style.display = tipo === 'A' ? 'block' : 'none';
  document.getElementById('prob-tipo-B').style.display = tipo === 'B' ? 'block' : 'none';
}

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
    cargarHistorial('cap3_user', 'chat-box2');

    renderizarFPTabla('absoluta');
    renderizarFPRefTable();

    // Pág 6
    renderizarEjTabla('absoluta');
    renderizarEjGrafico('absoluta');

    // Pág 7
    renderizarProbA();
    renderizarProbB();
});

// Hooks de paginación para caps nuevos
const _irBase = irAPagina;
function irAPagina(n) {
  _irBase(n);
}
