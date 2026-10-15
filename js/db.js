/**
 * SIDII PWA - Base de datos local (IndexedDB) para trabajar sin conexión
 *
 * Guarda los registros MIR que no se pudieron enviar al servidor (la "cola")
 * y los sube a MongoDB Atlas cuando vuelve el internet.
 * Requiere app.js cargado antes (usa API_URL).
 */
const ColaDB = (() => {
    const NOMBRE_BD = 'sidii-db';
    const VERSION_BD = 1;
    const STORE = 'cola';

    let sincronizando = false;

    function abrir() {
        return new Promise((resolve, reject) => {
            const peticion = indexedDB.open(NOMBRE_BD, VERSION_BD);
            peticion.onupgradeneeded = () => {
                const db = peticion.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'localId', autoIncrement: true });
                }
            };
            peticion.onsuccess = () => resolve(peticion.result);
            peticion.onerror = () => reject(peticion.error);
        });
    }

    async function operar(modo, accion) {
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const transaccion = db.transaction(STORE, modo);
            const peticion = accion(transaccion.objectStore(STORE));
            transaccion.oncomplete = () => { db.close(); resolve(peticion.result); };
            transaccion.onerror = () => { db.close(); reject(transaccion.error); };
            transaccion.onabort = () => { db.close(); reject(transaccion.error); };
        });
    }

    // Si el registro trae localId lo actualiza; si no, crea uno nuevo
    const guardar = (registro) => operar('readwrite', s => s.put(registro));
    const obtenerTodos = () => operar('readonly', s => s.getAll());
    const eliminar = (localId) => operar('readwrite', s => s.delete(localId));
    const contar = () => operar('readonly', s => s.count());

    // Quita los campos internos antes de enviar al servidor
    function datosParaServidor(item) {
        const { localId, estadoLocal, guardadoLocal, ...datos } = item;
        return datos;
    }

    /**
     * Envía los pendientes al servidor.
     * opciones.soloId  -> envía únicamente ese registro
     * opciones.omitir  -> no envía ese registro (por ejemplo, el que se está editando)
     * Regresa { enviados, fallidos, sinConexion }
     */
    async function sincronizar(opciones = {}) {
        const resultado = { enviados: 0, fallidos: 0, sinConexion: false };
        if (sincronizando) return resultado;
        if (!navigator.onLine) {
            resultado.sinConexion = true;
            return resultado;
        }

        sincronizando = true;
        try {
            const pendientes = await obtenerTodos();
            for (const item of pendientes) {
                if (opciones.soloId !== undefined && item.localId !== opciones.soloId) continue;
                if (opciones.omitir !== undefined && item.localId === opciones.omitir) continue;

                try {
                    const respuesta = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(datosParaServidor(item))
                    });
                    const datos = await respuesta.json();

                    if (datos.success) {
                        await eliminar(item.localId);
                        resultado.enviados++;
                    } else {
                        resultado.fallidos++;
                    }
                } catch (error) {
                    resultado.sinConexion = true;
                    break;
                }
            }
        } finally {
            sincronizando = false;
        }
        return resultado;
    }

    return { guardar, obtenerTodos, eliminar, contar, sincronizar };
})();