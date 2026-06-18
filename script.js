// 1. Lógica del Gráfico y Botones
let mostrandoTabla = true;
const ctx = document.getElementById('miGrafico').getContext('2d');
const miGrafico = new Chart(ctx, {
    type: 'bar',
    data: {
        labels: ['Deportes', 'Danza', 'Música'],
        datasets: [{ label: 'Hombres', data: [30, 5, 15], backgroundColor: '#1a3a5a' },
                   { label: 'Mujeres', data: [10, 25, 15], backgroundColor: '#2e7d32' }]
    }
});

function cambiarRepresentacion() {
    const t = document.getElementById('vista-tabla');
    const g = document.getElementById('vista-grafico');
    t.classList.toggle('oculto');
    g.classList.toggle('oculto');
    mostrandoTabla = !mostrandoTabla;
}

// 2. Conexión con el Servidor Python
async function enviarMensaje() {
    const input = document.getElementById('input-estudiante');
    const texto = input.value.trim();
    if (!texto) return;

    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML += `<div class="mensaje estudiante">${texto}</div>`;
    input.value = '';

    // URL PROPORCIONADA POR RENDER
    const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';

    try {
        const res = await fetch(URL_BACKEND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mensaje: texto })
        });
        const data = await res.json();
        chatBox.innerHTML += `<div class="mensaje tutor">${data.respuesta}</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
    } catch (e) {
        chatBox.innerHTML += `<div class="mensaje tutor">Error de conexión con el servidor.</div>`;
    }
}
