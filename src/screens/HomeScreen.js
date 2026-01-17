// src/screens/HomeScreen.js
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';
import { syncData } from '../services/api'; // <--- Importante
// Al inicio de HomeScreen.js
import NetInfo from '@react-native-community/netinfo';

export default function HomeScreen({ navigation }) {
  const [docente, setDocente] = useState(null);
  const [clases, setClases] = useState([]); 
  const [syncing, setSyncing] = useState(false); // Estado para el spinner del botón

  // Cargar datos al iniciar
  useEffect(() => {
    cargarDatos();
  }, []);

  // Recargar datos cada vez que volvemos a esta pantalla (por si acaso)
  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [])
  );

  const cargarDatos = async () => {
    try {
      const db = await getDBConnection();
      
      // 1. Cargar Docente
      const sessionData = await db.getFirstAsync('SELECT * FROM sesion');
      setDocente(sessionData);

      // 2. Cargar Clases
      const clasesData = await db.getAllAsync('SELECT * FROM mis_clases');
      setClases(clasesData);
      
    } catch (e) {
      console.error("Error cargando Home:", e);
    }
  };

  // --- FUNCIÓN PODEROSA: RE-SYNC ---
  const handleReSync = async () => {
    if (!docente?.identidad) return;

    setSyncing(true); // Activar spinner

    try {
      console.log("🔄 Iniciando re-sincronización manual...");

      // 1. Descargar datos FRESCOS (gracias al truco en api.js)
      const data = await syncData(docente.identidad);

      if (data.status === 'error') {
        throw new Error(data.mensaje);
      }

      // 2. Actualizar Base de Datos (Transacción segura)
      const db = await getDBConnection();

      await db.withTransactionAsync(async () => {
        console.log("🧹 Limpiando datos viejos...");
        // Borramos el contenido pero NO la sesión
        await db.runAsync('DELETE FROM mis_clases');
        await db.runAsync('DELETE FROM estudiantes');
        await db.runAsync('DELETE FROM periodos');
        await db.runAsync('DELETE FROM actividades');

        console.log("📥 Insertando datos nuevos...");

        // A. Insertar Clases Nuevas
        if (data.asignaciones) {
            for (const clase of data.asignaciones) {
                await db.runAsync(
                    'INSERT INTO mis_clases (municipio, centro, grado) VALUES (?, ?, ?)',
                    [clase.municipio, clase.centro, clase.grado]
                );
            }
        }

        // B. Insertar Estudiantes Nuevos
        if (data.estudiantes) {
            for (const est of data.estudiantes) {
              await db.runAsync(
                `INSERT INTO estudiantes (id_nnaj, nombre_completo, genero, grado_actual, centro_educativo, municipio) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [est.id_nnaj, est.nombre_completo, est.genero, est.grado_actual, est.centro_educativo, est.municipio]
              );
            }
        }

        // C. Insertar Periodos y Actividades Nuevas
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
        
        // D. Actualizar hora de sincronización
        await db.runAsync('UPDATE sesion SET ultima_sincronizacion = ?', [new Date().toISOString()]);
      });

      // 3. ACTUALIZAR UI
      setClases([]); // Truco visual: Vaciar lista un microsegundo
      await cargarDatos(); // Recargar desde SQLite
      
      Alert.alert("¡Éxito!", "Datos actualizados. Ahora deberías ver los nuevos grados.");

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo actualizar: " + (e.message || "Fallo de red"));
    } finally {
      setSyncing(false); // Apagar spinner
    }
  };

const cerrarSesion = async () => {
    try {
      // 1. VERIFICACIÓN DE INTERNET 📡
      // Si no hay red, prohibimos salir para evitar el bloqueo.
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        Alert.alert(
          "⚠️ No tienes Internet",
          "Si cierras sesión ahora, NO podrás volver a entrar hasta que tengas señal.\n\nPor seguridad, no puedes salir en este momento."
        );
        return; // <--- Bloqueamos la acción aquí
      }

      // 2. VERIFICACIÓN DE DATOS PENDIENTES 💾
      // Buscamos si hay firmas sin subir en la base de datos.
      const db = await getDBConnection();
      const resultado = await db.getFirstAsync(
        'SELECT COUNT(*) as cantidad FROM participaciones WHERE estado_subida = 0'
      );
      
      const pendientes = resultado?.cantidad || 0;

      if (pendientes > 0) {
        Alert.alert(
          "⚠️ Tienes datos sin sincronizar",
          `Hay ${pendientes} firmas/asistencias guardadas en este teléfono que NO se han subido.\n\nSi cierras sesión, SE BORRARÁN.\n\nPrimero usa el botón "Sincronizar" en cada actividad.`
        );
        return; // <--- Bloqueamos la acción aquí
      }

      // 3. CONFIRMACIÓN FINAL (Solo si pasó las pruebas anteriores)
      Alert.alert(
        "Cerrar Sesión",
        "¿Estás seguro? Se borrarán los datos locales de este dispositivo.",
        [
          { text: "Cancelar", style: "cancel" },
          { 
            text: "Salir 🚪", 
            style: "destructive",
            onPress: async () => {
              try {
                // Ahora sí es seguro borrar
                await db.runAsync('DELETE FROM sesion');
                await db.runAsync('DELETE FROM mis_clases');
                await db.runAsync('DELETE FROM estudiantes');
                await db.runAsync('DELETE FROM periodos');
                await db.runAsync('DELETE FROM actividades');
                await db.runAsync('DELETE FROM participaciones');
                
                navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
              } catch (e) {
                console.error(e);
              }
            }
          }
        ]
      );

    } catch (e) {
      console.error("Error al intentar cerrar sesión:", e);
      Alert.alert("Error", "Ocurrió un problema al verificar el estado del teléfono.");
    }
  };

  const renderCard = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      onPress={() => navigation.navigate('Periods', { 
         filtroCentro: item.centro, 
         filtroGrado: item.grado 
      })}
    >
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🎓</Text>
      </View>
      
      <View style={{flex: 1}}> 
        <Text style={styles.cardTitle}>{item.grado}</Text>
        <Text style={styles.cardSubtitle}>{item.centro}</Text>
        <Text style={styles.cardMuni}>{item.municipio}</Text>
      </View>

      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER AZUL */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
            <View>
              <Text style={styles.welcome}>Bienvenido,</Text>
              <Text style={styles.docenteName}>
                {docente ? docente.nombre : 'Cargando...'}
              </Text>
              
              {/* BOTÓN DE ACTUALIZAR DATOS */}
              <TouchableOpacity 
                style={styles.syncButton} 
                onPress={handleReSync} 
                disabled={syncing}
              >
                {syncing ? (
                    <ActivityIndicator size="small" color="#fff" />
                ) : (
                    <Text style={styles.syncText}>🔄 Actualizar Datos</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.logoutButton} onPress={cerrarSesion}>
              <Text style={styles.logoutText}>Salir 🚪</Text>
            </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Mis Grados Asignados</Text>

      <FlatList
        data={clases}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
            <Text style={{textAlign:'center', marginTop: 50, color:'#999'}}>
                No tienes grados asignados.{"\n"}
                Contacta al administrador.
            </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { 
    backgroundColor: '#0d6efd', 
    padding: 25, 
    paddingTop: 50, 
    borderBottomLeftRadius: 20, 
    borderBottomRightRadius: 20 
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start' 
  },
  welcome: { color: '#e0e0e0', fontSize: 14 },
  docenteName: { color: 'white', fontSize: 20, fontWeight: 'bold', maxWidth: 200, marginBottom: 10 }, 
  
  // Estilo del botón de Sync
  syncButton: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center'
  },
  syncText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },

  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginTop: 5
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', margin: 20, marginBottom: 10, color: '#333' },
  list: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  iconContainer: { backgroundColor: '#e7f1ff', padding: 12, borderRadius: 10, marginRight: 15 },
  icon: { fontSize: 24 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666' },
  cardMuni: { fontSize: 12, color: '#999', marginTop: 2 },
  arrow: { fontSize: 24, color: '#ccc', marginLeft: 'auto' }
});