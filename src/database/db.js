// src/database/db.js
import * as SQLite from 'expo-sqlite';

// Variable para guardar la conexión (Singleton)
let dbInstance = null;

// 1. OBTENER CONEXIÓN
export const getDBConnection = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  // IMPORTANTE: He cambiado el nombre a 'v10' para garantizar que se cree 
  // una base de datos totalmente nueva y limpia en tu celular.
  const db = await SQLite.openDatabaseAsync('participacion_v10_final.db'); 
  
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
      
      -- TABLA 1: ESTUDIANTES
      CREATE TABLE IF NOT EXISTS estudiantes (
        id_nnaj TEXT PRIMARY KEY,
        nombre_completo TEXT,
        genero TEXT,
        grado_actual TEXT,
        centro_educativo TEXT,
        municipio TEXT
      );

      -- TABLA 2: PERIODOS
      CREATE TABLE IF NOT EXISTS periodos (
        id INTEGER PRIMARY KEY,
        nombre TEXT,
        fecha_inicio TEXT,
        fecha_fin TEXT
      );

      -- TABLA 3: ACTIVIDADES
      CREATE TABLE IF NOT EXISTS actividades (
        id INTEGER PRIMARY KEY,
        periodo_id INTEGER,
        nombre_actividad TEXT,
        tipo_actividad TEXT,
        marco_logico TEXT
      );

      -- TABLA 4: SESION
      CREATE TABLE IF NOT EXISTS sesion (
        identidad TEXT PRIMARY KEY,
        nombre TEXT,
        ubicacion TEXT,
        ultima_sincronizacion TEXT
      );

      -- TABLA 5: MIS CLASES (Asignaciones del Home)
      CREATE TABLE IF NOT EXISTS mis_clases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        municipio TEXT,
        centro TEXT,
        grado TEXT
      );

      -- TABLA 6: PARTICIPACIONES (CORREGIDA)
      -- Esta es la ÚNICA definición de la tabla. Incluye firma, timestamp y coordenadas.
      CREATE TABLE IF NOT EXISTS participaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_nnaj TEXT,
        actividad_id INTEGER,
        fecha TEXT,         -- Fecha de la actividad (YYYY-MM-DD)
        mes_nombre TEXT,
        
        -- NUEVAS COLUMNAS NECESARIAS
        firma TEXT,
        timestamp TEXT,     -- Hora exacta del registro
        coordenadas TEXT,   -- Ubicación GPS "Lat, Long"
        estado_subida INTEGER DEFAULT 0 -- 0=Pendiente, 1=Subido
      );
      
    `);
    
    console.log("✅ Base de datos local inicializada (Modo WAL) - Versión v10");
  } catch (error) {
    console.error("❌ Error iniciando DB:", error);
    throw error;
  }
};