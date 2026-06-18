const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';
let graficoActual = null; // Variable para gestionar el gráfico

async function enviarMensaje() {
    const input = document.getElementById('user-input');
    if (!input.value) return;

    agregarAlChat('Tú: ' + input.value, true);
    const mensaje = input.value;
    input.value = '';

    const res = await fetch(URL_BACKEND, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ message: mensaje })
    });
    const data = await res.json();

    if (data.reply) {
        agregarAlChat('Tutor: ' + data.reply, false);
        // Lógica de los botones
        if (data.reply.includes("titular impactante") || data.reply.includes("cambiar la forma")) {
            document.getElementById('btn-cambio-rep').style.display = 'block';
        }
    }
    if (data.table) {
        actualizarTabla(data.table, data.headers);
        document.getElementById('btn-toggle').style.display = 'block'; // Mostrar botón de gráfico
    }
}

// --- NUEVA LÓGICA DE VISUALIZACIÓN ---

function toggleVisualizacion() {
    const tabla = document.getElementById('tabla-container');
    const canvas = document.getElementById('miGrafico');
    
    if (tabla.style.display === 'none') {
        tabla.style.display = 'block';
        canvas.style.display = 'none';
    } else {
        tabla.style.display = 'none';
        canvas.style.display = 'block';
        renderizarGrafico(); // Dibuja el gráfico al cambiar
    }
}

function renderizarGrafico() {
    const ctx = document.getElementById('miGrafico').getContext('2d');
    if (graficoActual) graficoActual.destroy();
    
    // Aquí usamos datos de ejemplo. En una mejora futura, 
    // podrías hacer que el servidor envíe los datos listos para el gráfico.
    graficoActual = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Deportes', 'Danza', 'Música'],
            datasets: [{ label: 'Preferencia', data: [15, 25, 20], backgroundColor: '#007bff' }]
        }
    });
}

// --- FUNCIONES EXISTENTES ---

function agregarAlChat(txt, esUser) {
    const box = document.getElementById('chat-box');
    box.innerHTML += `<p class="${esUser ? 'mensaje-usuario' : 'mensaje-tutor'}">${txt}</p>`;
    box.scrollTop = box.scrollHeight;
}

function actualizarTabla(matriz, cabeceras) {
    let html = '<table><thead><tr>' + cabeceras.map(h => `<th>${h}</th>`).join('') + '</tr></thead><tbody>';
    matriz.forEach(f => html += `<tr>${f.map(c => `<td>${c}</td>`).join('')}</tr>`);
    document.getElementById('tabla-container').innerHTML = html + '</tbody></table>';
}

function solicitarCambioRepresentacion() {
    document.getElementById('user-input').value = "Estoy listo para ver la representación en proporciones.";
    document.getElementById('btn-cambio-rep').style.display = 'none';
    enviarMensaje();
}

async function inicializarChat() {
    try {
        const response = await fetch(URL_BACKEND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "Hola, estoy listo para aprender." })
        });
        const data = await response.json();
        if (data.reply) agregarAlChat('Tutor: ' + data.reply, false);
        if (data.table) {
            actualizarTabla(data.table, data.headers);
            document.getElementById('btn-toggle').style.display = 'block';
        }
    } catch (error) {
        console.error('Error al inicializar:', error);
    }
}

window.onload = inicializarChat;
// Ejecutar al cargar la página
window.onload = inicializarChat;
