// src/screens/LoginScreen.js
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';
import { syncData } from '../services/api';

export default function LoginScreen({ navigation }) {
  const [identidad, setIdentidad] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const checkSesion = async () => {
      try {
        const db = await getDBConnection();
        // Verificar sesión existente
        if (db) {
             const result = await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='sesion'");
             if (result) {
                 const sesion = await db.getFirstAsync('SELECT * FROM sesion');
                 if (sesion) navigation.replace('Home');
             }
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
      // 1. Descarga (con Timeout de 60s incluido en api.js)
      const data = await syncData(identidad);

      if (data.status === 'error') {
        throw new Error(data.mensaje || "El servidor rechazó la conexión.");
      }

      // 2. Guardado Local
      const db = await getDBConnection();
      if (!db) throw new Error("No se pudo abrir la base de datos local.");

      await db.withTransactionAsync(async () => {
        // A. Guardar Sesión
        await db.runAsync('DELETE FROM sesion');
        await db.runAsync(
          'INSERT INTO sesion (identidad, nombre, ubicacion, ultima_sincronizacion) VALUES (?, ?, ?, ?)',
          [identidad, data.docente.nombre, "Docente Activo", new Date().toISOString()]
        );

        // B. Guardar Asignaciones
        await db.runAsync('DELETE FROM mis_clases');
        if (data.asignaciones) {
            for (const clase of data.asignaciones) {
                await db.runAsync(
                    'INSERT INTO mis_clases (municipio, centro, grado) VALUES (?, ?, ?)',
                    [clase.municipio, clase.centro, clase.grado]
                );
            }
        }

        // C. Guardar Estudiantes
        await db.runAsync('DELETE FROM estudiantes');
        if (data.estudiantes) {
            for (const est of data.estudiantes) {
            await db.runAsync(
                `INSERT INTO estudiantes (id_nnaj, nombre_completo, genero, grado_actual, centro_educativo, municipio) 
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    est.id_nnaj, 
                    est.nombre_completo, 
                    est.genero, 
                    est.grado_actual, 
                    est.centro_educativo, 
                    est.municipio
                ]
            );
            }
        }

        // D. Guardar Periodos y Actividades
        await db.runAsync('DELETE FROM periodos');
        await db.runAsync('DELETE FROM actividades');
        
        if (data.periodos) {
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
        }
      });

      Alert.alert("¡Éxito!", "Datos descargados correctamente.");
      navigation.replace('Home');

    } catch (error) {
        console.error("Error en Login:", error);
        
        let mensaje = error.message || "Error desconocido.";
        if (mensaje.includes("Network request failed")) mensaje = "No hay conexión a internet.";
        
        Alert.alert("Atención", mensaje);
    
    } finally {
        // 🔥 ESTA ES LA CLAVE: Siempre apaga el spinner, pase lo que pase.
        setLoading(false); 
    }
  };

  return (
    <View style={styles.container}>
      {/* LOGO AGREGADO */}
      <Image 
        source={require('../../assets/icon.png')} 
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.subtitle}>Asistencia</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Identidad Docente</Text>
        <TextInput 
            style={styles.input} 
            placeholder="Ingrese identidad (sin guiones)" 
            keyboardType="numeric"
            value={identidad}
            onChangeText={setIdentidad}
        />
        
        <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <ActivityIndicator color="#fff" style={{marginRight: 10}}/>
                    <Text style={styles.btnText}>CONECTANDO...</Text>
                </View>
            ) : (
                <Text style={styles.btnText}>SINCRONIZAR</Text>
            )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f2f5', padding: 20 },
  logo: { width: 150, height: 150, marginBottom: 20 }, // Estilo del Logo
  title: { fontSize: 24, fontWeight: 'bold', color: '#0d6efd', marginBottom: 5 },
  subtitle: { fontSize: 16, color: '#6c757d', marginBottom: 30 },
  card: { backgroundColor: 'white', width: '100%', padding: 20, borderRadius: 10, elevation: 5 },
  label: { fontWeight: 'bold', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 20 },
  btn: { backgroundColor: '#198754', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnDisabled: { backgroundColor: '#a5d6a7' },
  btnText: { color: 'white', fontWeight: 'bold' }
});