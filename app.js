/**
 * SIDII PWA - Archivo de lógica de interfaz y conexión con backend
 * Endpoints: MongoDB Atlas vía Express en http://localhost:4000
 */

// URL del backend local conectado a MongoDB Atlas
const API_URL = 'https://pwa-api-3g8d.onrender.com/api/indicadores';

// Inicialización cuando carga el documento
document.addEventListener('DOMContentLoaded', () => {
    // 1. Registrar Service Worker para PWA (offline cache)
    registrarServiceWorker();

    // 2. Cargar registros existentes desde MongoDB Atlas
    cargarRegistros();

    // 3. Configurar escucha del formulario de captura
    configurarFormularioMIR();
});

/**
 * Registro de Service Worker para PWA
 */
function registrarServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('../sw.js')
            .then(reg => console.log('✅ Service Worker PWA registrado con éxito:', reg.scope))
            .catch(err => console.warn('⚠️ Service Worker no registrado (modo desarrollo local):', err));
    }
}

/**
 * Escucha y envío del formulario MIR hacia el backend
 */
function configurarFormularioMIR() {
    const formMIR = document.getElementById('form-mir');
    const btnGuardar = document.getElementById('btn-guardar');

    if (!formMIR) return;

    formMIR.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Estado visual de carga en el botón
        if (btnGuardar) {
            btnGuardar.disabled = true;
            btnGuardar.innerHTML = `
                <i class="fa-solid fa-spinner fa-spin text-sm"></i>
                <span>Guardando en MongoDB Atlas...</span>
            `;
        }

        // Armar el payload estructurado conforme al modelo Mongoose IndicadorMIR
        const nuevoRegistro = {
            nivelMIR: document.getElementById('mir-nivel')?.value || 'Componente',
            resumenNarrativo: document.getElementById('mir-resumen')?.value?.trim() || '',
            nombreIndicador: document.getElementById('mir-indicador')?.value?.trim() || '',
            metas: {
                eneroAbril: {
                    programado: Number(document.getElementById('c1-prog')?.value) || 0,
                    realizado: Number(document.getElementById('c1-real')?.value) || 0
                },
                mayoAgosto: {
                    programado: Number(document.getElementById('c2-prog')?.value) || 0,
                    realizado: Number(document.getElementById('c2-real')?.value) || 0
                },
                septiembreDiciembre: {
                    programado: Number(document.getElementById('c3-prog')?.value) || 0,
                    realizado: Number(document.getElementById('c3-real')?.value) || 0
                }
            },
            usuarioRegistro: 'Liliana'
        };

        try {
            // Petición HTTP POST al backend Express
            const respuesta = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(nuevoRegistro)
            });

            const resultado = await respuesta.json();

            if (resultado.success) {
                // Notificación visual de éxito
                alert('🎉 ¡Registro guardado exitosamente en MongoDB Atlas!');
                
                // Limpiar formulario y resetear foco
                formMIR.reset();
                document.getElementById('mir-nivel').value = 'Componente';

                // Recargar listado en tiempo real
                await cargarRegistros();
            } else {
                alert('❌ Error al guardar: ' + (resultado.message || 'Error desconocido del servidor'));
            }
        } catch (error) {
            console.error('Error de comunicación con el backend:', error);
            alert('⚠️ No se pudo conectar al servidor en http://localhost:4000.\nAsegúrate de tener la terminal ejecutando "npm start".');
        } finally {
            // Restaurar estado del botón
            if (btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerHTML = `
                    <i class="fa-solid fa-cloud-arrow-up text-sm"></i>
                    <span>Guardar Registro MIR</span>
                `;
            }
        }
    });
}

/**
 * Consulta y renderizado de los registros guardados en MongoDB Atlas
 */
async function cargarRegistros() {
    const contenedor = document.getElementById('lista-registros');
    if (!contenedor) return;

    try {
        const respuesta = await fetch(API_URL);
        const resultado = await respuesta.json();

        if (resultado.success && resultado.data && resultado.data.length > 0) {
            contenedor.innerHTML = resultado.data.map(item => {
                const fechaFormateada = new Date(item.createdAt || Date.now()).toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                });

                // Total de avance
                const totalProg = (item.metas?.eneroAbril?.programado || 0) + (item.metas?.mayoAgosto?.programado || 0) + (item.metas?.septiembreDiciembre?.programado || 0);
                const totalReal = (item.metas?.eneroAbril?.realizado || 0) + (item.metas?.mayoAgosto?.realizado || 0) + (item.metas?.septiembreDiciembre?.realizado || 0);

                return `
                    <div class="bg-white border border-gray-200/90 rounded-xl p-4 shadow-sm hover:border-gray-300 transition">
                        <div class="flex items-center justify-between mb-2">
                            <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-50 text-[#7a0c16] border border-red-100">
                                ${item.nivelMIR}
                            </span>
                            <span class="text-[11px] text-gray-400 font-medium">
                                <i class="fa-regular fa-calendar text-[10px] mr-1"></i>${fechaFormateada}
                            </span>
                        </div>
                        <h4 class="text-sm font-bold text-gray-900 leading-snug">
                            ${item.nombreIndicador}
                        </h4>
                        <p class="text-xs text-gray-500 mt-1 line-clamp-2">
                            ${item.resumenNarrativo}
                        </p>
                        <div class="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-600">
                            <span>Metas Totales: <strong class="text-gray-900">${totalReal} / ${totalProg}</strong></span>
                            <span class="text-emerald-600 font-semibold flex items-center gap-1">
                                <i class="fa-solid fa-circle-check text-[10px]"></i> Sincronizado
                            </span>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            contenedor.innerHTML = `
                <div class="p-6 text-center border-2 border-dashed border-gray-200 rounded-2xl bg-white text-gray-400">
                    <i class="fa-regular fa-folder-open text-2xl mb-2 text-gray-300 block"></i>
                    <p class="text-xs font-semibold text-gray-600">No hay registros almacenados todavía</p>
                    <p class="text-[11px] text-gray-400 mt-0.5">Completa el formulario arriba y presiona "Guardar Registro MIR".</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error al consultar registros:', error);
        contenedor.innerHTML = `
            <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-center text-xs text-red-700">
                <i class="fa-solid fa-triangle-exclamation mr-1"></i>
                No se pudo conectar a http://localhost:4000. Revisa que tu backend esté encendido con <code>npm start</code>.
            </div>
        `;
    }
}