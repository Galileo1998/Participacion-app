// src/services/api.js

// --- CONFIGURACIÓN DE CONEXIÓN ---

// 1. MODO PRODUCCIÓN (Nube)
const DOMINIO = 'accionhonduras.org'; 
const PROTOCOLO = 'https'; 

// 2. MODO DESARROLLO (Local) - Descomenta si usas tu PC
// const DOMINIO = '192.168.1.15'; 
// const PROTOCOLO = 'http';

// Construimos la URL completa
export const API_URL = `${PROTOCOLO}://${DOMINIO}/participacion/admin/api_sync.php`;

/**
 * FUNCIÓN 1: DESCARGA (Sincronizar) - BLINDADA 🛡️
 * Trae los grados, estudiantes y actividades del servidor.
 * Incluye Timeout de 60 segundos para internet lento.
 */
export const syncData = async (identidad) => {
    // 1. CONTROLADOR DE TIEMPO (60 Segundos de paciencia)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 1 minuto máx

    try {
        // Truco anti-caché para traer siempre datos frescos
        const cacheBuster = new Date().getTime();
        const url = `${API_URL}?identidad=${identidad}&_t=${cacheBuster}`;

        console.log(`📡 Descargando datos (Timeout 60s): ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            },
            signal: controller.signal // Conectamos el cronómetro
        });

        clearTimeout(timeoutId); // Si respondió a tiempo, cancelamos la bomba

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }

        const text = await response.text();

        try {
            const json = JSON.parse(text);

            // VALIDACIÓN EXTRA: ¿Llegó vacío?
            if (!json || typeof json !== 'object') {
                throw new Error("El servidor respondió, pero los datos llegaron vacíos.");
            }

            return json;

        } catch (e) {
            console.error("🔥 Error: El servidor no devolvió JSON.", text.substring(0, 100));
            throw new Error("Datos corruptos o respuesta HTML inesperada.");
        }

    } catch (error) {
        // Detectar si fue por internet lento
        if (error.name === 'AbortError') {
            throw new Error("⏳ El internet es demasiado lento. Se agotó el tiempo de espera (60s).");
        }
        console.error("❌ Error de conexión (GET):", error);
        throw error;
    }
};

/**
 * FUNCIÓN 2: SUBIR DATOS (POST) - CON ESTRATEGIA DE LOTES 🚚📦
 * Divide grandes envíos en paquetes pequeños de 20 para evitar fallos en aldeas.
 */
export const enviarParticipaciones = async (listaCompleta) => {
    // TAMAÑO DEL LOTE: 20 firmas por viaje es seguro para internet lento
    const TAMANO_LOTE = 20; 
    
    // Si son pocas (menos de 20), se van en un solo viaje rápido
    if (listaCompleta.length <= TAMANO_LOTE) {
        return await enviarLoteUnico(listaCompleta);
    }

    // SI SON MUCHAS (Ej: 100), las partimos
    console.log(`📦 Detectadas ${listaCompleta.length} firmas. Dividiendo en lotes de ${TAMANO_LOTE}...`);
    
    let procesados = 0;
    const total = listaCompleta.length;

    // Bucle para enviar trocito a trocito
    for (let i = 0; i < total; i += TAMANO_LOTE) {
        // Cortamos el array: del índice i al i+20
        const lote = listaCompleta.slice(i, i + TAMANO_LOTE);
        const numeroLote = Math.floor(i / TAMANO_LOTE) + 1;
        const totalLotes = Math.ceil(total / TAMANO_LOTE);
        
        try {
            console.log(`🚚 Enviando Lote ${numeroLote}/${totalLotes} (${lote.length} firmas)...`);
            
            await enviarLoteUnico(lote);
            
            procesados += lote.length;
            
            // Pequeña pausa de 500ms para no saturar la red del celular
            await new Promise(resolve => setTimeout(resolve, 500)); 

        } catch (error) {
            // Si falla un lote, lanzamos error y detenemos el proceso.
            // Los lotes anteriores YA SE GUARDARON en el servidor (eso es bueno).
            console.error(`❌ Falló el lote ${numeroLote}`);
            throw new Error(`Error subiendo lote ${numeroLote}. Se subieron ${procesados} de ${total} firmas con éxito. Intente sincronizar de nuevo para subir el resto.`);
        }
    }

    return { status: 'success', message: 'Todos los lotes subidos correctamente' };
};

/**
 * FUNCIÓN PRIVADA: Realiza el envío real de un grupo de datos.
 * Incluye Timeout de 60s y manejo de errores HTML.
 */
const enviarLoteUnico = async (participaciones) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 segundos por lote

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                participaciones: participaciones
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        const text = await response.text();
        
        try {
            const json = JSON.parse(text);
            
            // Verificamos si el servidor nos dice explícitamente que hubo error
            if (json.status === 'error') {
                throw new Error(json.message || "Error desconocido en el servidor");
            }

            return json;

        } catch (parseError) {
            // Si falla el parseo, es porque recibimos HTML (Error PHP fatal, 404, etc)
            const errorExtracto = text.substring(0, 150);
            throw new Error(`El servidor devolvió un error inesperado (HTML):\n${errorExtracto}...`);
        }

    } catch (error) {
        let msg = error.message || "Error de conexión";
        
        if (error.name === 'AbortError') {
            msg = "⏳ La subida tardó demasiado (Timeout). Verifique su conexión.";
        }

        console.error("❌ Error en envío de lote:", msg);
        throw new Error(msg);
    }
};