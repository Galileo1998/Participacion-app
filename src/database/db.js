// src/database/db.js
import * as SQLite from 'expo-sqlite';

// Variable Singleton
let dbInstance = null;

export const getDBConnection = async () => {
  try {
    if (dbInstance) {
      return dbInstance;
    }
    
    // 🔥 CAMBIO CLAVE: Usamos 'v2' para ignorar la base de datos vieja y rota
    dbInstance = await SQLite.openDatabaseAsync('participacion_ah_v2.db');
    
    await initDB(dbInstance);
    return dbInstance;
  } catch (error) {
    console.error("🔥 ERROR CRÍTICO OBTENIENDO CONEXIÓN:", error);
    return null;
  }
};

export const initDB = async (db = null) => {
  try {
    const database = db || await getDBConnection();
    if (!database) return;

    // 1. Tabla SESION
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS sesion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identidad TEXT,  
        usuario_id TEXT,
        nombre TEXT,
        token TEXT,
        ubicacion TEXT, 
        fecha_ingreso TEXT,
        ultimo_acceso TEXT,
        ultima_sincronizacion TEXT
      );
    `);

    // 2. Tabla USUARIOS
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identidad TEXT UNIQUE,
        nombre TEXT,
        centro TEXT,
        municipio TEXT
      );
    `);

    // 3. Tabla MIS CLASES
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS mis_clases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        municipio TEXT,
        centro TEXT,
        grado TEXT
      );
    `);

    // 4. Tabla ESTUDIANTES
    // Aquí está la columna 'id_nnaj' que antes no te reconocía
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS estudiantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_nnaj TEXT UNIQUE,
        nombre_completo TEXT,
        genero TEXT,
        grado_actual TEXT,
        centro_educativo TEXT,
        municipio TEXT
      );
    `);

    // 5. Tabla PERIODOS
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS periodos (
        id INTEGER PRIMARY KEY, 
        nombre TEXT,
        fecha_inicio TEXT,
        fecha_fin TEXT
      );
    `);

    // 6. Tabla ACTIVIDADES
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS actividades (
        id INTEGER PRIMARY KEY,
        periodo_id INTEGER,
        nombre_actividad TEXT,
        tipo_actividad TEXT,
        marco_logico TEXT,
        FOREIGN KEY (periodo_id) REFERENCES periodos (id)
      );
    `);

    // 7. Tabla PARTICIPACIONES
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS participaciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        estudiante_id TEXT,
        actividad_id INTEGER,
        fecha TEXT, 
        anio INTEGER,
        mes TEXT,
        timestamp_registro TEXT,
        firma TEXT, 
        coordenadas TEXT,
        ip_origen TEXT,
        estado_subida INTEGER DEFAULT 0, 
        FOREIGN KEY (estudiante_id) REFERENCES estudiantes (id_nnaj),
        FOREIGN KEY (actividad_id) REFERENCES actividades (id)
      );
    `);
    
    // console.log("✅ Base de datos v2 inicializada");

  } catch (error) {
    console.error("❌ Error en initDB:", error);
  }
};

export const limpiarBaseDeDatos = async () => {
  try {
    const db = await getDBConnection();
    if (!db) return;

    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM sesion');
      await db.runAsync('DELETE FROM usuarios');
      await db.runAsync('DELETE FROM estudiantes');
      await db.runAsync('DELETE FROM periodos');
      await db.runAsync('DELETE FROM actividades');
      await db.runAsync('DELETE FROM mis_clases');
    });
    console.log("♻️ Base de datos limpiada.");
  } catch (error) {
    console.error("⚠️ Error al limpiar BD:", error);
  }
};