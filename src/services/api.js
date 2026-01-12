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


// --- FUNCIONES ---

/**
 * Función 1: DESCARGAR DATOS (GET)
 * Sirve para el Login y para bajar estudiantes/actividades
 */
export const syncData = async (identidad) => {
    try {
        console.log(`📡 Conectando a: ${API_URL}?identidad=${identidad}`);

        const response = await fetch(`${API_URL}?identidad=${identidad}`);
        
        // Leemos texto crudo primero para detectar errores HTML
        const text = await response.text();

        try {
            const json = JSON.parse(text);
            return json;
        } catch (e) {
            console.error("🔥 El servidor devolvió HTML en vez de JSON:", text);
            throw new Error(`Error del Servidor: No se recibieron datos válidos. Posible error PHP.`);
        }

    } catch (error) {
        console.error("❌ Error de conexión (GET):", error);
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