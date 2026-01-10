// src/services/api.js

// CAMBIA ESTO POR TU IP LOCAL (Ejecuta 'ipconfig' en Windows para verla)
// No uses 'localhost' si pruebas en celular físico.
const IP = '192.168.1.43:8081'; // <--- ¡ACTUALIZA ESTO!

const BASE_URL = `http://${IP}/participacion/admin/api_sync.php`;

export const API_URL = BASE_URL;

export const syncData = async (identidad) => {
    try {
        const response = await fetch(`${API_URL}?identidad=${identidad}`);
        const json = await response.json();
        return json;
    } catch (error) {
        console.error("Error de conexión:", error);
        throw error;
    }
};

// src/services/api.js

// ... (Tu código anterior de BASE_URL y syncData sigue aquí) ...

// NUEVA FUNCIÓN PARA SUBIR DATOS
export const enviarParticipaciones = async (listaParticipaciones) => {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                participaciones: listaParticipaciones
            })
        });

        const json = await response.json();
        return json;
    } catch (error) {
        console.error("Error subiendo datos:", error);
        throw error; // Lanzamos el error para que la pantalla sepa que falló (y lo guarde offline)
    }
};