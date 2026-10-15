/**
 * SIDII PWA - Lógica de la pantalla de Inicio (pages/index.html)
 * Widgets de gestión conectados a datos reales.
 * Usa: API_URL y mostrarVariante() de app.js  |  ColaDB de db.js
 *
 * Este archivo NO contiene HTML ni estilos: los textos y colores de cada
 * estado están escritos en index.html; aquí solo se elige cuál mostrar.
 */
(function () {
    // AJUSTA: fecha límite de entrega del cuatrimestre C3 (formato AAAA-MM-DD)
    const FECHA_CIERRE_C3 = '2026-12-31';
    // Cuántos días antes se marca como "Urgente"
    const DIAS_URGENTE = 15;

    const porId = id => document.getElementById(id);

    document.addEventListener('DOMContentLoaded', () => {
        if (!porId('widget-mir-valor')) return;

        actualizarWidgetCierre();
        actualizarWidgetCola();
        cargarWidgetMIR();
        sincronizarPendientes();

        // Al volver el internet se envía lo que quedó en cola y se refrescan los widgets
        window.addEventListener('online', sincronizarPendientes);
        window.addEventListener('offline', actualizarWidgetCola);
    });

    /* ------------------------------------------------------------
       Widget 1: Metas MIR (avance real / programado de todos los registros)
       ------------------------------------------------------------ */
    async function cargarWidgetMIR() {
        try {
            const respuesta = await fetch(API_URL);
            if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
            const resultado = await respuesta.json();
            const datos = (resultado.success && Array.isArray(resultado.data)) ? resultado.data : [];

            let programado = 0;
            let realizado = 0;
            datos.forEach(item => {
                const m = item.metas || {};
                programado += (m.eneroAbril?.programado || 0) + (m.mayoAgosto?.programado || 0) + (m.septiembreDiciembre?.programado || 0);
                realizado += (m.eneroAbril?.realizado || 0) + (m.mayoAgosto?.realizado || 0) + (m.septiembreDiciembre?.realizado || 0);
            });

            const porcentaje = programado ? Math.round((realizado / programado) * 100) : 0;
            porId('widget-mir-valor').textContent = porcentaje + '%';
            porId('widget-mir-barra').style.width = Math.min(porcentaje, 100) + '%';
        } catch (error) {
            // Sin datos disponibles: se conservan los valores que ya muestra la página
            console.warn('Widget Metas MIR sin datos:', error);
        }
    }

    /* ------------------------------------------------------------
       Widget 2: Cierre de cuatrimestre (días que faltan)
       Variantes en el HTML: urgente / entiempo / cerrado
       ------------------------------------------------------------ */
    function actualizarWidgetCierre() {
        const valor = porId('widget-dias-valor');
        if (!valor) return;

        const fin = new Date(FECHA_CIERRE_C3 + 'T23:59:59');
        const dias = Math.max(0, Math.ceil((fin - new Date()) / 86400000));

        valor.textContent = String(dias).padStart(2, '0');
        mostrarVariante('cierre', dias === 0 ? 'cerrado' : (dias <= DIAS_URGENTE ? 'urgente' : 'entiempo'));
    }

    /* ------------------------------------------------------------
       Widget 3: Cola offline (registros pendientes en el dispositivo)
       Variantes en el HTML:
         cola-unidad: uno / otros
         cola: online-vacia / online-pendientes / offline
       ------------------------------------------------------------ */
    async function actualizarWidgetCola() {
        const valor = porId('widget-cola-valor');
        if (!valor) return;

        let pendientes = 0;
        try {
            pendientes = await ColaDB.contar();
        } catch (error) {
            console.warn('No se pudo leer la cola local:', error);
        }

        valor.textContent = pendientes;
        mostrarVariante('cola-unidad', pendientes === 1 ? 'uno' : 'otros');

        if (!navigator.onLine) {
            mostrarVariante('cola', 'offline');
        } else {
            mostrarVariante('cola', pendientes > 0 ? 'online-pendientes' : 'online-vacia');
        }
    }

    async function sincronizarPendientes() {
        try {
            const resultado = await ColaDB.sincronizar();
            if (resultado.enviados) cargarWidgetMIR();
        } catch (error) {
            console.warn('No se pudo sincronizar la cola:', error);
        }
        actualizarWidgetCola();
    }

    /* Widget 4 (e.Firma & Validación): por ahora muestra un dato demostrativo
       fijo en el HTML; no hay módulo de actas conectado todavía. */
})();