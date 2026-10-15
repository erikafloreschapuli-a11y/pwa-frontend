/**
 * SIDII PWA - Lógica de la pantalla Captura MIR (pages/captura.html)
 * Usa: API_URL y mostrarVariante() de app.js  |  ColaDB de db.js
 *
 * Este archivo NO contiene HTML ni estilos. Las tarjetas viven en
 * <template id="tpl-registro"> y los avisos en captura.html; aquí solo se
 * llena texto y se muestra u oculta lo que ya existe en la página.
 *
 * Incluye: guardar (POST), listar (GET), editar (PUT), borrar (DELETE),
 * borrador offline (IndexedDB), cola de envío y sincronización automática.
 */
(function () {
    let formMIR, btnGuardar, btnOffline, btnCancelarEdicion, contenedorLista;

    let editandoId = null;        // _id de un registro del servidor que se está editando
    let editandoLocalId = null;   // localId de un borrador de la cola que se está editando
    let registrosServidor = [];
    let registrosCola = [];
    let errorServidor = false;
    let temporizadorAviso = null;

    const porId = id => document.getElementById(id);

    document.addEventListener('DOMContentLoaded', () => {
        formMIR = porId('form-mir');
        if (!formMIR) return;

        btnGuardar = porId('btn-guardar');
        btnOffline = porId('btn-offline');
        btnCancelarEdicion = porId('btn-cancelar-edicion');
        contenedorLista = porId('lista-registros');

        configurarFormularioMIR();
        configurarBotonOffline();
        configurarBotonForzarEnvio();
        configurarLista();

        // Al volver el internet, se envía solo lo que quedó en cola
        window.addEventListener('online', () => sincronizarYRefrescar(true));
        window.addEventListener('offline', renderLista);

        iniciar();
    });

    async function iniciar() {
        actualizarModoBoton();
        await refrescarTodo();
        if (navigator.onLine && registrosCola.length) {
            await sincronizarYRefrescar(true);
        }
    }

    /* ============================================================
       DATOS DEL FORMULARIO
       ============================================================ */
    function armarPayload() {
        const num = id => Number(porId(id)?.value) || 0;
        // Payload estructurado conforme al modelo Mongoose IndicadorMIR
        return {
            nivelMIR: porId('mir-nivel')?.value || 'Componente',
            resumenNarrativo: porId('mir-resumen')?.value?.trim() || '',
            nombreIndicador: porId('mir-indicador')?.value?.trim() || '',
            programaPresupuestario: porId('mir-pp')?.value || '',
            unidadResponsable: porId('mir-ur')?.value?.trim() || '',
            metodoCalculo: porId('mir-metodo')?.value?.trim() || '',
            justificacion: porId('mir-justificacion')?.value?.trim() || '',
            metas: {
                eneroAbril:          { programado: num('c1-prog'), realizado: num('c1-real') },
                mayoAgosto:          { programado: num('c2-prog'), realizado: num('c2-real') },
                septiembreDiciembre: { programado: num('c3-prog'), realizado: num('c3-real') }
            },
            usuarioRegistro: 'Liliana'
        };
    }

    function setValor(id, valor) {
        const campo = porId(id);
        if (campo && valor !== undefined && valor !== null) campo.value = valor;
    }

    function llenarFormulario(item) {
        setValor('mir-nivel', item.nivelMIR);
        setValor('mir-indicador', item.nombreIndicador);
        setValor('mir-resumen', item.resumenNarrativo);
        setValor('mir-pp', item.programaPresupuestario);
        setValor('mir-ur', item.unidadResponsable);
        setValor('mir-metodo', item.metodoCalculo);
        setValor('mir-justificacion', item.justificacion);
        setValor('c1-prog', item.metas?.eneroAbril?.programado);
        setValor('c1-real', item.metas?.eneroAbril?.realizado);
        setValor('c2-prog', item.metas?.mayoAgosto?.programado);
        setValor('c2-real', item.metas?.mayoAgosto?.realizado);
        setValor('c3-prog', item.metas?.septiembreDiciembre?.programado);
        setValor('c3-real', item.metas?.septiembreDiciembre?.realizado);
    }

    function limpiarFormulario() {
        salirModoEdicion();
        formMIR.reset();
        setValor('mir-nivel', 'Componente');
    }

    function esErrorDeRed(error) {
        return !navigator.onLine || error instanceof TypeError;
    }

    /* ============================================================
       ESTADO DEL BOTÓN PRINCIPAL (los textos están en el HTML)
       ============================================================ */
    function actualizarModoBoton() {
        mostrarVariante('btn-guardar', editandoId ? 'actualizar' : 'guardar');
        btnCancelarEdicion.hidden = !(editandoId || editandoLocalId);
    }

    function setBotonOcupado(ocupado, actualizando) {
        btnGuardar.disabled = ocupado;
        if (ocupado) {
            mostrarVariante('btn-guardar', actualizando ? 'actualizando' : 'guardando');
        } else {
            actualizarModoBoton();
        }
    }

    /* ============================================================
       GUARDAR / ACTUALIZAR (botón principal)
       ============================================================ */
    function configurarFormularioMIR() {
        btnCancelarEdicion.addEventListener('click', limpiarFormulario);

        formMIR.addEventListener('submit', async (e) => {
            e.preventDefault();

            const payload = armarPayload();
            const actualizandoServidor = Boolean(editandoId);

            setBotonOcupado(true, actualizandoServidor);

            try {
                const respuesta = await fetch(actualizandoServidor ? `${API_URL}/${editandoId}` : API_URL, {
                    method: actualizandoServidor ? 'PUT' : 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const resultado = await respuesta.json();

                if (resultado.success) {
                    // Si venía de un borrador de la cola, ya quedó en el servidor
                    if (editandoLocalId) await ColaDB.eliminar(editandoLocalId);

                    alert(actualizandoServidor
                        ? '✅ Registro actualizado correctamente'
                        : '🎉 ¡Registro guardado exitosamente en MongoDB Atlas!');

                    limpiarFormulario();
                    await refrescarTodo();
                } else {
                    alert('❌ Error al guardar: ' + (resultado.message || 'Error desconocido del servidor'));
                }
            } catch (error) {
                console.error('Error de comunicación con el backend:', error);

                if (esErrorDeRed(error)) {
                    if (actualizandoServidor) {
                        alert('⚠️ Para actualizar un registro del servidor necesitas conexión a internet. Intenta de nuevo cuando vuelva la señal.');
                    } else {
                        await guardarBorrador(payload,
                            '📴 Sin conexión: el registro se guardó en este dispositivo y se enviará solo cuando vuelva el internet.');
                    }
                } else {
                    alert('⚠️ El servidor respondió de forma inesperada. Intenta de nuevo en un momento.');
                }
            } finally {
                setBotonOcupado(false);
            }
        });
    }

    /* ============================================================
       BORRADOR OFFLINE (IndexedDB)
       ============================================================ */
    async function guardarBorrador(payload, mensaje) {
        const registro = {
            ...payload,
            estadoLocal: 'pendiente',
            guardadoLocal: new Date().toISOString()
        };
        if (editandoLocalId) registro.localId = editandoLocalId; // actualiza el borrador existente

        try {
            await ColaDB.guardar(registro);
        } catch (error) {
            console.error('No se pudo guardar en IndexedDB:', error);
            alert('❌ No se pudo guardar en el dispositivo. Revisa que el navegador permita almacenamiento local.');
            return;
        }

        alert(mensaje);
        limpiarFormulario();
        await refrescarTodo();
    }

    function configurarBotonOffline() {
        if (!btnOffline) return;
        btnOffline.addEventListener('click', async () => {
            if (editandoId) {
                alert('Estás editando un registro del servidor. Usa el botón principal para actualizarlo o cancela la edición.');
                return;
            }
            await guardarBorrador(armarPayload(),
                '💾 Borrador guardado en este dispositivo. Lo verás como "Pendiente en Cola" y se enviará cuando haya conexión.');
        });
    }

    /* ============================================================
       SINCRONIZACIÓN DE LA COLA
       ============================================================ */
    function configurarBotonForzarEnvio() {
        const btn = porId('btn-forzar-envio');
        if (btn) btn.addEventListener('click', () => sincronizarYRefrescar(false));
    }

    async function sincronizarYRefrescar(silencioso) {
        const pendientes = await leerCola();
        if (!pendientes.length) {
            if (!silencioso) mostrarAviso('No hay registros pendientes por enviar.');
            return;
        }

        const r = await ColaDB.sincronizar({ omitir: editandoLocalId ?? undefined });
        await refrescarTodo();

        const partes = [];
        if (r.enviados) partes.push(`✅ ${r.enviados} registro(s) enviado(s) a MongoDB Atlas`);
        if (r.fallidos) partes.push(`⚠️ ${r.fallidos} no se pudieron enviar`);
        if (r.sinConexion && !r.enviados) partes.push('Sin conexión: los registros siguen en cola');
        if (partes.length && (!silencioso || r.enviados || r.fallidos)) mostrarAviso(partes.join(' • '));
    }

    async function subirBorrador(localId) {
        const r = await ColaDB.sincronizar({ soloId: localId });
        await refrescarTodo();
        if (r.enviados) mostrarAviso('✅ Registro enviado a MongoDB Atlas');
        else if (r.sinConexion) mostrarAviso('Sin conexión: el registro sigue en cola');
        else mostrarAviso('⚠️ El servidor no aceptó el registro. Revísalo con Editar.');
    }

    /* ============================================================
       EDITAR Y BORRAR
       ============================================================ */
    function entrarModoEdicion() {
        actualizarModoBoton();
        formMIR.scrollIntoView({ behavior: 'smooth' });
    }

    function salirModoEdicion() {
        editandoId = null;
        editandoLocalId = null;
        actualizarModoBoton();
    }

    function editarRegistro(id) {
        const item = registrosServidor.find(r => String(r._id) === id);
        if (!item) return;
        editandoId = id;
        editandoLocalId = null;
        llenarFormulario(item);
        entrarModoEdicion();
    }

    function editarBorrador(localId) {
        const item = registrosCola.find(r => r.localId === localId);
        if (!item) return;
        editandoLocalId = localId;
        editandoId = null;
        llenarFormulario(item);
        entrarModoEdicion();
    }

    async function borrarRegistro(id) {
        if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;

        try {
            const respuesta = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
            const resultado = await respuesta.json();

            if (resultado.success) {
                if (editandoId === id) limpiarFormulario();
                await refrescarTodo();
            } else {
                alert('❌ No se pudo eliminar: ' + (resultado.message || 'Error del servidor'));
            }
        } catch (error) {
            console.error('Error al eliminar:', error);
            alert('⚠️ No se pudo eliminar. Se necesita conexión a internet.');
        }
    }

    async function borrarBorrador(localId) {
        if (!confirm('¿Descartar este registro pendiente? Aún no se envió al servidor y se perderá.')) return;
        try {
            await ColaDB.eliminar(localId);
        } catch (error) {
            console.error('Error al descartar borrador:', error);
        }
        if (editandoLocalId === localId) limpiarFormulario();
        await refrescarTodo();
    }

    // Un solo listener para los botones de todas las tarjetas
    function configurarLista() {
        if (!contenedorLista) return;
        contenedorLista.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-accion]');
            if (!btn) return;

            const { accion, origen, id } = btn.dataset;
            const esCola = origen === 'cola';

            if (accion === 'editar') esCola ? editarBorrador(Number(id)) : editarRegistro(id);
            if (accion === 'borrar') esCola ? borrarBorrador(Number(id)) : borrarRegistro(id);
            if (accion === 'subir') subirBorrador(Number(id));
        });
    }

    /* ============================================================
       LISTADO (servidor + cola local)
       ============================================================ */
    async function leerCola() {
        try {
            return await ColaDB.obtenerTodos();
        } catch (error) {
            console.warn('IndexedDB no disponible:', error);
            return [];
        }
    }

    async function refrescarTodo() {
        registrosCola = await leerCola();
        actualizarBadgeCola();
        await cargarRegistros();
    }

    function actualizarBadgeCola() {
        const cantidad = document.querySelector('[data-cola-cantidad]');
        if (cantidad) cantidad.textContent = registrosCola.length;
    }

    /**
     * Consulta los registros guardados en MongoDB Atlas
     */
    async function cargarRegistros() {
        if (!contenedorLista) return;

        try {
            const respuesta = await fetch(API_URL);
            if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
            const resultado = await respuesta.json();
            registrosServidor = (resultado.success && Array.isArray(resultado.data)) ? resultado.data : [];
            errorServidor = false;
        } catch (error) {
            console.error('Error al consultar registros:', error);
            registrosServidor = [];
            errorServidor = true;
        }

        renderLista();
    }

    function totales(item) {
        const m = item.metas || {};
        const prog = (m.eneroAbril?.programado || 0) + (m.mayoAgosto?.programado || 0) + (m.septiembreDiciembre?.programado || 0);
        const real = (m.eneroAbril?.realizado || 0) + (m.mayoAgosto?.realizado || 0) + (m.septiembreDiciembre?.realizado || 0);
        return { prog, real };
    }

    /**
     * Crea una tarjeta a partir de <template id="tpl-registro"> (está en captura.html).
     * Solo se llena texto con textContent; el diseño no se toca desde aquí.
     */
    function crearTarjeta(item, origen) {
        const id = origen === 'cola' ? item.localId : item._id;
        const { prog, real } = totales(item);
        const tarjeta = porId('tpl-registro').content.firstElementChild.cloneNode(true);

        const texto = (campo, valor) => {
            tarjeta.querySelector(`[data-campo="${campo}"]`).textContent = valor;
        };

        texto('etiqueta', (item.programaPresupuestario ? item.programaPresupuestario + ' • ' : '') + (item.nivelMIR ?? ''));
        texto('fecha', new Date(item.createdAt || item.guardadoLocal || Date.now()).toLocaleDateString('es-MX', {
            day: '2-digit', month: 'short', year: 'numeric'
        }));
        texto('indicador', item.nombreIndicador ?? '');
        texto('resumen', item.resumenNarrativo ?? '');
        texto('metas', `${real} / ${prog}`);

        // Partes que solo aplican a registros del servidor o de la cola
        tarjeta.querySelectorAll('[data-solo]').forEach(parte => {
            parte.hidden = parte.dataset.solo !== origen;
        });
        tarjeta.querySelectorAll('button[data-accion]').forEach(boton => {
            boton.dataset.id = id;
            boton.dataset.origen = origen;
        });

        return tarjeta;
    }

    function renderLista() {
        if (!contenedorLista) return;

        const tarjetas = [
            // Primero los pendientes de la cola local
            ...registrosCola.map(item => crearTarjeta(item, 'cola')),
            ...(errorServidor ? [] : registrosServidor.map(item => crearTarjeta(item, 'servidor')))
        ];
        contenedorLista.replaceChildren(...tarjetas);

        // Avisos que ya existen en captura.html
        porId('aviso-sin-conexion').hidden = navigator.onLine || errorServidor;
        porId('lista-error').hidden = !errorServidor;
        porId('lista-vacia').hidden = errorServidor || tarjetas.length > 0;
    }

    /* ============================================================
       AVISO EMERGENTE (<div id="aviso"> en captura.html)
       ============================================================ */
    function mostrarAviso(texto) {
        const aviso = porId('aviso');
        if (!aviso) { alert(texto); return; }

        aviso.textContent = texto;
        aviso.hidden = false;
        clearTimeout(temporizadorAviso);
        temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, 4000);
    }
})();