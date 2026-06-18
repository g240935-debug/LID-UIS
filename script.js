const URL_BACKEND = 'https://lid-uis.onrender.com/api/chat';

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
        if (data.reply.includes("titular impactante") || data.reply.includes("cambiar la forma")) {
            document.getElementById('btn-cambio-rep').style.display = 'block';
        }
    }
    if (data.table) actualizarTabla(data.table, data.headers);
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
// Función para inicializar la interfaz
async function inicializarChat() {
    try {
        // Hacemos una petición vacía o de inicio para que el tutor salude
        const response = await fetch(URL_BACKEND, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: "Hola, estoy listo para aprender." })
        });
        const data = await response.json();

        // Mostrar saludo del tutor y cargar tabla inicial
        if (data.reply) {
            agregarAlChat('Tutor: ' + data.reply, false);
        }
        if (data.table) {
            actualizarTabla(data.table, data.headers);
        }
    } catch (error) {
        console.error('Error al inicializar:', error);
        agregarAlChat('Tutor: Hola, bienvenido. Por favor escribe un mensaje para comenzar.', false);
    }
}

// Ejecutar al cargar la página
window.onload = inicializarChat;
