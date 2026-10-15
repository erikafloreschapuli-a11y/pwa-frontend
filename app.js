/**
 * SIDII PWA - Archivo global (se carga en TODAS las páginas)
 *
 * Solo lógica compartida. Aquí NO hay HTML ni estilos: los textos, colores y
 * plantillas viven en los .html; este archivo solo muestra u oculta lo que
 * ya está escrito en ellos.
 */

// URL del backend en Render conectado a MongoDB Atlas
const API_URL = 'https://pwa-api-3g8d.onrender.com/api/indicadores';

/**
 * Muestra solo la variante indicada de un grupo y oculta las demás.
 * En el HTML:  <p data-grupo="red" data-variante="online">...</p>
 *              <p data-grupo="red" data-variante="offline" hidden>...</p>
 */
function mostrarVariante(grupo, estado) {
    document.querySelectorAll(`[data-grupo="${grupo}"]`).forEach(elemento => {
        elemento.hidden = elemento.dataset.variante !== estado;
    });
}

/**
 * Evento de instalación de la PWA (se guarda para usarlo en el botón)
 */
let promptInstalacion = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalacion = e;
    const btn = document.getElementById('btn-pwa-install');
    if (btn) btn.hidden = false;
});

// Inicialización cuando carga el documento
document.addEventListener('DOMContentLoaded', () => {
    // 1. Registrar Service Worker para PWA (offline cache)
    registrarServiceWorker();

    // 2. Indicador de conexión (online / offline)
    configurarEstadoRed();

    // 3. Botón "Instalar"
    configurarBotonInstalar();
});

/**
 * Registro de Service Worker para PWA
 */
function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('../sw.js')
            .then(reg => console.log('✅ Service Worker PWA registrado con éxito:', reg.scope))
            .catch(err => console.warn('⚠️ Service Worker no registrado:', err));
    }
}

/**
 * Indicador de conexión: en el HTML se marca con data-grupo="red"
 * y las variantes "online" / "offline".
 */
function configurarEstadoRed() {
    const actualizar = () => mostrarVariante('red', navigator.onLine ? 'online' : 'offline');

    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    actualizar();
}

/**
 * Botón "Instalar" de la barra superior móvil
 */
function configurarBotonInstalar() {
    const btn = document.getElementById('btn-pwa-install');
    if (!btn) return;

    btn.hidden = !promptInstalacion;

    btn.addEventListener('click', async () => {
        if (!promptInstalacion) return;
        promptInstalacion.prompt();
        await promptInstalacion.userChoice;
        promptInstalacion = null;
        btn.hidden = true;
    });

    window.addEventListener('appinstalled', () => { btn.hidden = true; });
}