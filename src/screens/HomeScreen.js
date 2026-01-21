// src/screens/HomeScreen.js
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
// IMPORTANTE: Importamos RefreshControl
import NetInfo from '@react-native-community/netinfo';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';
import { syncData } from '../services/api';

export default function HomeScreen({ navigation }) {
  const [docente, setDocente] = useState(null);
  const [clases, setClases] = useState([]); 
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false); // Estado para el "Pull to Refresh"
  const [mensajeSync, setMensajeSync] = useState("Actualizar Datos");

  useEffect(() => {
    cargarDatos();
  }, []);

  useFocusEffect(
    useCallback(() => {
      cargarDatos();
    }, [])
  );

  const cargarDatos = async () => {
    try {
      const db = await getDBConnection();
      
      // 🛡️ BLINDAJE: Si la DB falló al iniciar, no intentamos leer para evitar pantalla blanca
      if (!db) return; 
      
      // 1. Cargar Docente
      const sessionData = await db.getFirstAsync('SELECT * FROM sesion');
      setDocente(sessionData);

      // 2. Cargar Clases
      const clasesData = await db.getAllAsync('SELECT * FROM mis_clases');
      setClases(clasesData || []); 
      
    } catch (e) {
      console.error("Error cargando Home:", e);
    }
  };

  // Función para cuando el usuario desliza hacia abajo
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await cargarDatos(); // Recarga la DB local
    setRefreshing(false); // Apaga el spinner superior
  }, []);

  const handleReSync = async () => {
    if (!docente?.identidad) return;

    setSyncing(true);
    setMensajeSync("📡 Conectando..."); 

    try {
      const data = await syncData(docente.identidad);

      if (data.status === 'error') throw new Error(data.mensaje);

      if (!data.estudiantes || !Array.isArray(data.estudiantes)) {
          throw new Error("La descarga se completó, pero no vinieron estudiantes.");
      }

      setMensajeSync("💾 Guardando...");

      const db = await getDBConnection();
      if (!db) throw new Error("Error de conexión local (DB).");

      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM mis_clases');
        await db.runAsync('DELETE FROM estudiantes');
        await db.runAsync('DELETE FROM periodos');
        await db.runAsync('DELETE FROM actividades');

        if (data.estudiantes) {
            for (const est of data.estudiantes) {
              await db.runAsync(
                `INSERT INTO estudiantes (id_nnaj, nombre_completo, genero, grado_actual, centro_educativo, municipio) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    est.id_nnaj ? String(est.id_nnaj) : "Sin ID",
                    est.nombre_completo || "Sin Nombre",
                    est.genero || "X",
                    est.grado_actual || "Sin Grado",
                    est.centro_educativo || "Centro Desconocido",
                    est.municipio || "Sin Municipio"
                ]
              );
            }
        }

        if (data.asignaciones) {
            for (const clase of data.asignaciones) {
                await db.runAsync(
                    'INSERT INTO mis_clases (municipio, centro, grado) VALUES (?, ?, ?)',
                    [clase.municipio || "", clase.centro || "", clase.grado || ""]
                );
            }
        }
        
        if (data.periodos) {
            for (const p of data.periodos) {
                await db.runAsync(
                    'INSERT INTO periodos (id, nombre, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
                    [p.id, p.nombre, p.fecha_inicio || "", p.fecha_fin || ""]
                );
                if (p.lista_actividades) {
                    for (const act of p.lista_actividades) {
                        await db.runAsync(
                            'INSERT INTO actividades (id, periodo_id, nombre_actividad, tipo_actividad, marco_logico) VALUES (?, ?, ?, ?, ?)',
                            [act.id, p.id, act.nombre_actividad || "Sin Nombre", act.tipo_actividad || "", act.marco_logico || ""]
                        );
                    }
                }
            }
        }
      });

      setMensajeSync("✅ ¡Éxito!");
      setClases([]); 
      await cargarDatos(); 
      setTimeout(() => Alert.alert("Éxito", "Datos actualizados."), 500);

    } catch (e) {
      console.error(e);
      setMensajeSync("❌ Error");
      Alert.alert("Error de Sincronización", "Detalle: " + e.message);
    } finally {
      setSyncing(false);
      setTimeout(() => setMensajeSync("🔄 Actualizar Datos"), 3000);
    }
  };

  const cerrarSesion = async () => {
    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected || !netState.isInternetReachable) {
        Alert.alert("⚠️ No tienes Internet", "Por seguridad, no puedes salir sin internet.");
        return;
      }

      const db = await getDBConnection();
      if (!db) { Alert.alert("Error", "Fallo DB Local"); return; }

      const resultado = await db.getFirstAsync(
        'SELECT COUNT(*) as cantidad FROM participaciones WHERE estado_subida = 0'
      );
      
      const pendientes = resultado?.cantidad || 0;

      if (pendientes > 0) {
        Alert.alert("⚠️ Datos sin subir", `Tienes ${pendientes} firmas pendientes. Sincroniza primero.`);
        return;
      }

      Alert.alert(
        "Cerrar Sesión",
        "Se borrarán los datos locales.",
        [
          { text: "Cancelar", style: "cancel" },
          { 
            text: "Salir 🚪", 
            style: "destructive",
            onPress: async () => {
              try {
                await db.runAsync('DELETE FROM sesion');
                await db.runAsync('DELETE FROM mis_clases');
                await db.runAsync('DELETE FROM estudiantes');
                await db.runAsync('DELETE FROM periodos');
                await db.runAsync('DELETE FROM actividades');
                await db.runAsync('DELETE FROM participaciones');
                navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
              } catch (e) { console.error(e); }
            }
          }
        ]
      );

    } catch (e) {
      console.error("Error al cerrar sesión:", e);
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
      <View style={styles.header}>
        <View style={styles.headerRow}>
            <View>
              <Text style={styles.welcome}>Bienvenido,</Text>
              <Text style={styles.docenteName}>
                {docente ? docente.nombre : 'Cargando...'}
              </Text>
              
              <TouchableOpacity 
                style={[styles.syncButton, syncing && { backgroundColor: '#ffc107' }]} 
                onPress={handleReSync} 
                disabled={syncing}
              >
                {syncing ? (
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <ActivityIndicator size="small" color="#000" style={{marginRight:5}} />
                        <Text style={[styles.syncText, {color: '#000'}]}>{mensajeSync}</Text>
                    </View>
                ) : (
                    <Text style={styles.syncText}>{mensajeSync}</Text>
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
        // 👇 ESTA ES LA CLAVE: Permite deslizar hacia abajo para "desatascar" la app
        refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#0d6efd"]} />
        }
        ListEmptyComponent={
            <Text style={{textAlign:'center', marginTop: 50, color:'#999'}}>
                {clases === null ? "Cargando..." : "No tienes grados asignados.\nDesliza hacia abajo para recargar."}
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
  syncButton: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center'
  },
  syncText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginTop: 5
  },
  logoutText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
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