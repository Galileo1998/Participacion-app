// src/services/api.js
import { Alert } from 'react-native';

// --- CONFIGURACIÓN DE CONEXIÓN ---

// 1. MODO PRODUCCIÓN (Nube)
// Usa este para generar el APK final.
const DOMINIO = 'accionhonduras.org'; 
const PROTOCOLO = 'https'; // Importante: Producción suele requerir HTTPS

// 2. MODO DESARROLLO (Local)
// Descomenta estas líneas si vuelves a probar en tu PC con Expo Go.
// const DOMINIO = '192.168.1.15'; // Cambia por tu IP local
// const PROTOCOLO = 'http';

// Construimos la URL completa
// Asegúrate de que la ruta '/participacion/admin/api_sync.php' sea exacta en tu hosting
export const API_URL = `${PROTOCOLO}://${DOMINIO}/participacion/admin/api_sync.php`;

/**
 * FUNCIÓN DE DESCARGA (Sincronizar)
 * Trae los grados, estudiantes y actividades del servidor.
 */
export const syncData = async (identidad) => {
    try {
        // TRUCO ANTI-CACHÉ:
        // Agregamos la hora actual (_t) para que el celular crea que es una petición nueva
        // y descargue los datos reales del servidor en lugar de usar la memoria vieja.
        const cacheBuster = new Date().getTime();
        const url = `${API_URL}?identidad=${identidad}&_t=${cacheBuster}`;

        console.log(`📡 Descargando datos frescos de: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        const text = await response.text();

        try {
            const json = JSON.parse(text);
            return json;
        } catch (e) {
            console.error("🔥 Error: El servidor no devolvió JSON.", text);
            throw new Error("Error al leer datos del servidor.");
        }

    } catch (error) {
        console.error("❌ Error de conexión:", error);
        throw error;
    }
};

/**
 * Función 2: SUBIR DATOS (POST)
 * Sirve para enviar las firmas y asistencias al servidor
 */
export const enviarParticipaciones = async (listaParticipaciones) => {
    try {
        console.log("📤 Intentando subir datos a:", API_URL);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                participaciones: listaParticipaciones
            })
        });

        // 1. Obtenemos la respuesta cruda (Texto)
        const text = await response.text();
        console.log("📩 Respuesta cruda del servidor:", text);

        // 2. Intentamos convertirla a JSON
        try {
            const json = JSON.parse(text);
            
            // Verificamos si el JSON trae un status de error lógico
            if (json.status === 'error') {
                throw new Error(json.message || "Error desconocido en el servidor");
            }

            return json;

        } catch (parseError) {
            // Si falla el parseo, es porque recibimos HTML (Error 404, 500, Fatal Error PHP)
            // Mostramos los primeros 100 caracteres del error para no saturar la alerta
            const errorExtracto = text.substring(0, 150);
            throw new Error(`El servidor devolvió un error inesperado (HTML):\n${errorExtracto}...`);
        }

    } catch (error) {
        console.error("❌ Error subiendo datos (POST):", error);
        
        // ¡IMPORTANTE PARA EL APK! 
        // Esto mostrará una ventana emergente en el celular con el error real.
        Alert.alert(
            "Error de Sincronización", 
            error.message || "No se pudo conectar con el servidor."
        );
        
        throw error; // Relanzamos para que la pantalla maneje el estado offline
    }
};