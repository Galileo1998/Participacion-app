// src/database/db.js
import * as SQLite from 'expo-sqlite';

// Variable para guardar la conexión
let dbInstance = null;


// src/database/db.js

// ... imports ...

export const getDBConnection = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  // CAMBIO AQUÍ: Cambiamos el nombre para forzar una base nueva y limpia
  const db = await SQLite.openDatabaseAsync('participacion_v8_con_firma.db'); 
  
  // ... resto del código con los CREATE TABLE ...
  
  dbInstance = db;
  return dbInstance;
};

// 2. INICIALIZAR TABLAS
export const initDB = async () => {
  try {
    const db = await getDBConnection();
    
    // execAsync permite ejecutar múltiples SQL seguidos
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      
      CREATE TABLE IF NOT EXISTS estudiantes (
        id_nnaj TEXT PRIMARY KEY,
        nombre_completo TEXT,
        genero TEXT,
        grado_actual TEXT,
        centro_educativo TEXT,
        municipio TEXT
      );

      CREATE TABLE IF NOT EXISTS periodos (
        id INTEGER PRIMARY KEY,
        nombre TEXT,
        fecha_inicio TEXT,
        fecha_fin TEXT
      );

      CREATE TABLE IF NOT EXISTS actividades (
        id INTEGER PRIMARY KEY,
        periodo_id INTEGER,
        nombre_actividad TEXT,
        tipo_actividad TEXT,
        marco_logico TEXT
      );

      CREATE TABLE IF NOT EXISTS participaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_nnaj TEXT,
        actividad_id INTEGER,
        fecha TEXT,
        mes_nombre TEXT,
        estado_subida INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sesion (
        identidad TEXT PRIMARY KEY,
        nombre TEXT,
        ubicacion TEXT,
        ultima_sincronizacion TEXT
      );
      
        CREATE TABLE IF NOT EXISTS participaciones (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          id_nnaj TEXT,
          actividad_id INTEGER,
          fecha TEXT,         -- Fecha de la actividad (YYYY-MM-DD)
          mes_nombre TEXT,
          firma TEXT,
          timestamp TEXT,     -- NUEVO: Hora exacta del registro
          coordenadas TEXT,   -- NUEVO: "Lat, Long"
          estado_subida INTEGER DEFAULT 0 -- 0=Pendiente, 1=Subido
        );

        CREATE TABLE IF NOT EXISTS mis_clases (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          municipio TEXT,
          centro TEXT,
          grado TEXT
        );
      
    `);
    
    console.log("✅ Base de datos local inicializada (Modo WAL)");
  } catch (error) {
    console.error("❌ Error iniciando DB:", error);
    throw error;
  }
};