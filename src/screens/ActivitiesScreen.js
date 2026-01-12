import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo'; // <--- NUEVA IMPORTACIÓN
import { useFocusEffect } from '@react-navigation/native'; // Para recargar al volver
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View } from 'react-native';

import { getDBConnection } from '../database/db';
import { enviarParticipaciones } from '../services/api';

export default function ActivitiesScreen({ route, navigation }) {
  const { periodoId, nombrePeriodo, filtroCentro, filtroGrado } = route.params;
  
  const [actividades, setActividades] = useState([]);
  const [sincronizando, setSincronizando] = useState(new Set()); 
  const [isAutoSyncing, setIsAutoSyncing] = useState(false); // Para mostrar loading global si quieres

  // Recargar datos cada vez que entramos a la pantalla (por si firmaron y volvieron)
  useFocusEffect(
    useCallback(() => {
      cargarActividades();
    }, [])
  );

  // --- ESCUCHA DE INTERNET (AUTO-SYNC) ---
  useEffect(() => {
    // Nos suscribimos a los cambios de red
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        // ¡VOLVIÓ EL INTERNET! Intentamos subir todo lo pendiente.
        subirTodoLoPendienteAutomaticamente();
      }
    });

    return () => unsubscribe(); // Limpieza al salir
  }, []);

  const cargarActividades = async () => {
    try {
      const db = await getDBConnection();
      // Contamos las pendientes para mostrar visualmente si hay algo por subir
      const resultados = await db.getAllAsync(
        `SELECT a.*, 
         (SELECT COUNT(*) FROM participaciones p WHERE p.actividad_id = a.id AND p.estado_subida = 0) as pendientes
         FROM actividades a 
         WHERE a.periodo_id = ?`, 
        [periodoId]
      );
      setActividades(resultados);
    } catch (e) {
      console.error(e);
    }
  };

  // --- LÓGICA DE AUTO-SUBIDA GLOBAL ---
  const subirTodoLoPendienteAutomaticamente = async () => {
    try {
      const db = await getDBConnection();
      
      // 1. Buscamos TODO lo que tenga estado_subida = 0 (No importa la actividad)
      const pendientes = await db.getAllAsync(
        'SELECT * FROM participaciones WHERE estado_subida = 0'
      );

      if (pendientes.length > 0) {
        console.log(`📡 Auto-Sync: Encontradas ${pendientes.length} firmas pendientes.`);
        
        // Avisar al usuario discretamente
        if (Platform.OS === 'android') {
          ToastAndroid.show(`Conexión detectada: Subiendo ${pendientes.length} firmas...`, ToastAndroid.LONG);
        }

        setIsAutoSyncing(true);

        // 2. Enviar al servidor
        await enviarParticipaciones(pendientes);

        // 3. Marcar como subidas
        await db.withTransactionAsync(async () => {
          for (const p of pendientes) {
            await db.runAsync(
              'UPDATE participaciones SET estado_subida = 1 WHERE id = ?',
              [p.id]
            );
          }
        });

        // 4. Refrescar la pantalla
        console.log("✅ Auto-Sync completado con éxito");
        if (Platform.OS === 'android') {
          ToastAndroid.show("¡Sincronización automática completada!", ToastAndroid.SHORT);
        }
        cargarActividades(); // Recarga las tarjetas para quitar contadores pendientes

      } else {
        console.log("📡 Auto-Sync: Nada pendiente por subir.");
      }
    } catch (e) {
      console.error("❌ Falló Auto-Sync:", e);
      // No mostramos alerta intrusiva en auto-sync para no molestar, solo consola/toast
    } finally {
      setIsAutoSyncing(false);
    }
  };

  // --- SINCRONIZACIÓN MANUAL (BOTÓN NUBE) ---
  const handleSincronizarManual = async (actividadId, nombreActividad) => {
    // (Mantenemos tu lógica manual por si acaso)
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert("Sin Conexión", "No hay internet para sincronizar.");
      return;
    }

    const startSync = new Set(sincronizando);
    startSync.add(actividadId);
    setSincronizando(startSync);

    try {
      const db = await getDBConnection();
      const pendientes = await db.getAllAsync(
        `SELECT * FROM participaciones WHERE actividad_id = ? AND estado_subida = 0`,
        [actividadId]
      );

      if (pendientes.length === 0) {
        Alert.alert("Al día", "No hay firmas pendientes en esta actividad.");
      } else {
        await enviarParticipaciones(pendientes);
        await db.withTransactionAsync(async () => {
          for (const p of pendientes) {
            await db.runAsync('UPDATE participaciones SET estado_subida = 1 WHERE id = ?', [p.id]);
          }
        });
        Alert.alert("¡Éxito!", `Se subieron ${pendientes.length} firmas.`);
        cargarActividades(); // Refrescar UI
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      const endSync = new Set(sincronizando);
      endSync.delete(actividadId);
      setSincronizando(endSync);
    }
  };

  const renderItem = ({ item }) => {
    const isSyncing = sincronizando.has(item.id);
    // ¿Hay pendientes en esta actividad? (Viene de la consulta SQL modificada arriba)
    const hayPendientes = item.pendientes > 0;

    return (
      <View style={styles.cardContainer}>
        {/* IZQUIERDA: INFORMACIÓN */}
        <TouchableOpacity 
          style={styles.cardContent}
          onPress={() => navigation.navigate('StudentList', { 
            actividadId: item.id, 
            nombreActividad: item.nombre_actividad,
            nombrePeriodo: nombrePeriodo,
            filtroCentro: filtroCentro, 
            filtroGrado: filtroGrado    
          })}
        >
          <View style={styles.badgeContainer}>
            <Text style={styles.badge}>{item.marco_logico}</Text>
            {hayPendientes && (
              <Text style={styles.badgePendiente}>⚠️ {item.pendientes} Pendientes</Text>
            )}
          </View>
          <Text style={styles.title}>{item.nombre_actividad}</Text>
          <Text style={styles.tapText}>Toque para pasar lista ›</Text>
        </TouchableOpacity>

        {/* DERECHA: BOTÓN SYNC */}
        <TouchableOpacity 
          style={[styles.syncButton, hayPendientes ? styles.syncButtonActive : null]} 
          onPress={() => handleSincronizarManual(item.id, item.nombre_actividad)}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator color={hayPendientes ? "#fff" : "#0d6efd"} />
          ) : (
            <>
              <MaterialIcons 
                name={hayPendientes ? "cloud-upload" : "cloud-done"} 
                size={28} 
                color={hayPendientes ? "#fff" : "#ccc"} 
              />
              <Text style={[styles.syncText, hayPendientes ? {color:'#fff'} : {color:'#ccc'}]}>
                {hayPendientes ? "Subir" : "Listo"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </TouchableOpacity>
        <View>
            <Text style={styles.headerTitle}>{nombrePeriodo}</Text>
            <Text style={{fontSize: 10, color: '#999'}}>
              {isAutoSyncing ? "♻️ Sincronizando auto..." : "Modo Automático Activo"}
            </Text>
        </View>
      </View>

      <FlatList
        data={actividades}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f2f5' },
  header: { backgroundColor: '#fff', padding: 15, paddingTop: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backBtn: { padding: 5, marginRight: 10 },
  backText: { color: '#0d6efd', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  list: { paddingHorizontal: 15, paddingTop: 15 },
  
  cardContainer: { 
    backgroundColor: 'white', 
    borderRadius: 10, 
    marginBottom: 12, 
    elevation: 2, 
    flexDirection: 'row', 
    overflow: 'hidden'
  },
  cardContent: { flex: 1, padding: 15 },
  
  syncButton: { 
    width: 70, 
    backgroundColor: '#f8f9fa', // Color apagado por defecto
    justifyContent: 'center', 
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#eee'
  },
  syncButtonActive: {
    backgroundColor: '#0d6efd', // Azul brillante si hay pendientes
  },
  
  syncText: { fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  badgeContainer: { flexDirection: 'row', marginBottom: 8 },
  badge: { backgroundColor: '#fff3cd', color: '#856404', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, marginRight: 5, fontWeight: 'bold' },
  badgePendiente: { backgroundColor: '#fff', color: '#dc3545', borderWidth: 1, borderColor: '#dc3545', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: 'bold' },
  
  title: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  tapText: { color: '#0d6efd', fontSize: 12, fontWeight: '500' }
});