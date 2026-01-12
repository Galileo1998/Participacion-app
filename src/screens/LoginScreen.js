// src/screens/LoginScreen.js
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';
import { syncData } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [identidad, setIdentidad] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSesion = async () => {
      try {
        const db = await getDBConnection();
        const result = await db.getFirstAsync('SELECT * FROM sesion');
        if (result) {
          navigation.replace('Home');
        }
      } catch (e) {
        console.log("Sin sesión previa o error DB:", e);
      }
    };
    checkSesion();
  }, []);

  const handleLogin = async () => {
    if (!identidad.trim()) {
      Alert.alert("Error", "Ingresa tu identidad");
      return;
    }

    setLoading(true);

    try {
      // 1. Descargar datos del servidor
      const data = await syncData(identidad);

      if (data.status === 'error') {
        Alert.alert("Error Servidor", data.mensaje);
        setLoading(false);
        return;
      }

      // 2. Guardar en SQLite
      const db = await getDBConnection();

      await db.withTransactionAsync(async () => {
        // A. Guardar Sesión
        await db.runAsync('DELETE FROM sesion');
        await db.runAsync(
          'INSERT INTO sesion (identidad, nombre, ubicacion, ultima_sincronizacion) VALUES (?, ?, ?, ?)',
          [identidad, data.docente.nombre, "Docente Activo", new Date().toISOString()]
        );

        // B. Guardar Asignaciones (Clases)
        await db.runAsync('DELETE FROM mis_clases');
        if (data.asignaciones) {
            for (const clase of data.asignaciones) {
                await db.runAsync(
                    'INSERT INTO mis_clases (municipio, centro, grado) VALUES (?, ?, ?)',
                    [clase.municipio, clase.centro, clase.grado]
                );
            }
        }

        // C. Guardar Estudiantes (¡CORREGIDO AQUÍ!)
        await db.runAsync('DELETE FROM estudiantes');
        for (const est of data.estudiantes) {
          // Antes faltaban centro_educativo y municipio, por eso se guardaban como NULL
          await db.runAsync(
            `INSERT INTO estudiantes (id_nnaj, nombre_completo, genero, grado_actual, centro_educativo, municipio) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                est.id_nnaj, 
                est.nombre_completo, 
                est.genero, 
                est.grado_actual, 
                est.centro_educativo, // <--- Dato crucial agregado
                est.municipio         // <--- Dato crucial agregado
            ]
          );
        }

        // D. Guardar Periodos y Actividades
        await db.runAsync('DELETE FROM periodos');
        await db.runAsync('DELETE FROM actividades');
        
        for (const p of data.periodos) {
          await db.runAsync(
            'INSERT INTO periodos (id, nombre, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
            [p.id, p.nombre, p.fecha_inicio, p.fecha_fin]
          );

          if (p.lista_actividades) {
            for (const act of p.lista_actividades) {
              await db.runAsync(
                'INSERT INTO actividades (id, periodo_id, nombre_actividad, tipo_actividad, marco_logico) VALUES (?, ?, ?, ?, ?)',
                [act.id, p.id, act.nombre_actividad, act.tipo_actividad, act.marco_logico]
              );
            }
          }
        }
      });

      setLoading(false);
      Alert.alert("¡Éxito!", "Datos descargados correctamente.");
      navigation.replace('Home');
    // CÓDIGO NUEVO (SINCERO) 🗣️
    } catch (error) {
        console.error(error);
        // Esto mostrará: "Network request failed", "JSON Parse Error", etc.
        Alert.alert("Atención", error.message || "Error desconocido al conectar.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Acción Honduras AF-26</Text>
      <Text style={styles.subtitle}>Asistencia Offline</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Identidad Docente</Text>
        <TextInput 
            style={styles.input} 
            placeholder="Ingrese identidad" 
            keyboardType="numeric"
            value={identidad}
            onChangeText={setIdentidad}
        />
        
        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>SINCRONIZAR</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#0d6efd', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#6c757d', marginBottom: 30 },
  card: { backgroundColor: 'white', width: '100%', padding: 20, borderRadius: 10, elevation: 5 },
  label: { fontWeight: 'bold', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 20 },
  btn: { backgroundColor: '#198754', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: 'bold' }
});