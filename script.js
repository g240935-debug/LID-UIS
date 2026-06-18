const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';
let graficoActual = null;
let datosParaGraficar = [5, 25, 15]; // Valores iniciales por defecto

// Inicialización: Carga el chat y la tabla apenas abre la página
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(inicializarChat, 1000);
});

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
            // Mostramos el botón de transnumeración si ya hay datos
            document.getElementById('btn-toggle').style.display = 'block';
        }
    } catch (error) {
        console.error('Error al inicializar:', error);
        agregarAlChat('Tutor: Hola, bienvenido. Escribe un mensaje para comenzar.', false);
    }
}

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
        // Lógica de aparición del botón de Proporciones (Fase C)
        if (data.reply.includes("titular impactante") || data.reply.includes("cambiar la forma")) {
            document.getElementById('btn-cambio-rep').style.display = 'block';
        }
    }
    
    // Actualizamos datos si el servidor envía nuevos
    if (data.grafico_data) datosParaGraficar = data.grafico_data;
    if (data.table) {
        actualizarTabla(data.table, data.headers);
        document.getElementById('btn-toggle').style.display = 'block';
    }
}

function toggleVisualizacion() {
    const tabla = document.getElementById('tabla-container');
    const canvas = document.getElementById('miGrafico');
    const btn = document.getElementById('btn-toggle');
    
    if (tabla.style.display === 'none') {
        tabla.style.display = 'block';
        canvas.style.display = 'none';
        btn.textContent = "Cambiar a Representación Gráfica (Transnumerar)";
    } else {
        tabla.style.display = 'none';
        canvas.style.display = 'block';
        renderizarGrafico();
        btn.textContent = "Cambiar a Representación Tabular (Transnumerar)";
    }
}

function renderizarGrafico() {
    const ctx = document.getElementById('miGrafico').getContext('2d');
    if (graficoActual) graficoActual.destroy();
    
    graficoActual = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Deportes', 'Danza', 'Música'],
            datasets: [{
                label: 'Frecuencia de Actividades',
                data: datosParaGraficar,
                backgroundColor: ['#1a3a5a', '#28a745', '#ffc107']
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
}

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
window.onload = inicializarChat;
