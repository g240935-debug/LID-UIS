const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';

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

  // Iniciar chat solo al llegar a la página de actividad
  if (n === 2 && !chatIniciado) {
    chatIniciado = true;
    inicializarChat();
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
      body: JSON.stringify({ message: 'Hola, estoy listo para aprender.' })
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
      body: JSON.stringify({ message: texto })
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

/* ════════════════════════════════
   INIT
════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // La portada se ve de inmediato, el loading se oculta
  setTimeout(ocultarLoading, 800);

  // Inicializar rep-dot en estado tabla
  const repDot = document.getElementById('rep-dot');
  if (repDot) repDot.className = 'rep-dot is-tabla';
});
