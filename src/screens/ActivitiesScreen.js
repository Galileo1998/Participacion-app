import { MaterialIcons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View
} from 'react-native';

import { getDBConnection } from '../database/db';
import { enviarParticipaciones } from '../services/api';

export default function ActivitiesScreen({ route, navigation }) {
  const { periodoId, nombrePeriodo, filtroCentro, filtroGrado } = route.params;
  
  const [actividades, setActividades] = useState([]);
  const [sincronizando, setSincronizando] = useState(new Set()); 
  const [isAutoSyncing, setIsAutoSyncing] = useState(false); // Semáforo de seguridad

  // 1. CARGA INICIAL Y LIMPIEZA
  useFocusEffect(
    useCallback(() => {
      cargarActividades();
      ejecutarLimpiezaAutomatica(); 
    }, [])
  );

  // 2. ESCUCHADOR DE INTERNET (AUTO-SYNC)
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        subirTodoLoPendienteAutomaticamente();
      }
    });
    return () => unsubscribe();
  }, []);

  // --- 🧹 FUNCIÓN DE LIMPIEZA AUTOMÁTICA (50 DÍAS) ---
  const ejecutarLimpiezaAutomatica = async () => {
    try {
      const db = await getDBConnection();
      
      const fechaCorte = new Date();
      fechaCorte.setDate(fechaCorte.getDate() - 50); // 50 días atrás
      const fechaCorteStr = fechaCorte.toISOString().split('T')[0];

      // Borrar solo lo que YA SE SUBIÓ (estado_subida = 1) y es VIEJO
      const resultado = await db.runAsync(
        `DELETE FROM participaciones WHERE estado_subida = 1 AND fecha < ?`,
        [fechaCorteStr]
      );

      if (resultado && resultado.changes > 0) {
        console.log(`🧹 LIMPIEZA: Se eliminaron ${resultado.changes} registros antiguos.`);
      }
    } catch (e) {
      console.error("⚠️ Error menor en autolimpieza:", e.message);
    }
  };

  // --- 📥 CARGAR LISTA DE ACTIVIDADES ---
  const cargarActividades = async () => {
    try {
      const db = await getDBConnection();
      // Contamos cuántas hay pendientes por subir en cada actividad
      const resultados = await db.getAllAsync(
        `SELECT a.*, 
          (SELECT COUNT(*) FROM participaciones p WHERE p.actividad_id = a.id AND p.estado_subida = 0) as pendientes
          FROM actividades a 
          WHERE a.periodo_id = ?`, 
        [periodoId]
      );
      setActividades(resultados);
    } catch (e) {
      console.error("Error cargando actividades:", e);
    }
  };

  // --- ☁️ AUTO-SYNC (SILENCIOSO) ---
  const subirTodoLoPendienteAutomaticamente = async () => {
    if (isAutoSyncing) return; // Evitar doble ejecución

    try {
      const db = await getDBConnection();
      // Buscar TODO lo pendiente de cualquier actividad
      const pendientes = await db.getAllAsync('SELECT * FROM participaciones WHERE estado_subida = 0');

      if (pendientes.length > 0) {
        setIsAutoSyncing(true);
        console.log(`📡 Auto-Sync: Intentando subir ${pendientes.length} firmas...`);
        
        if (Platform.OS === 'android') {
          ToastAndroid.show(`Sincronizando ${pendientes.length} firmas...`, ToastAndroid.SHORT);
        }

        // 1. Subir a la nube
        await enviarParticipaciones(pendientes);

        // 2. Si tuvo éxito, marcar como subido localmente
        await db.withTransactionAsync(async () => {
          for (const p of pendientes) {
            await db.runAsync('UPDATE participaciones SET estado_subida = 1 WHERE id = ?', [p.id]);
          }
        });

        console.log("✅ Auto-Sync completado con éxito");
        cargarActividades(); // Refrescar contadores visuales

        if (Platform.OS === 'android') {
            ToastAndroid.show("Sincronización completada", ToastAndroid.SHORT);
        }
      }
    } catch (e) {
      // Fallo silencioso (no alertamos al usuario para no interrumpir)
      console.log("⚠️ Auto-Sync pospuesto (Sin red o error):", e.message);
    } finally {
      setIsAutoSyncing(false);
    }
  };

  // --- 👆 SYNC MANUAL (BOTÓN) ---
// En src/screens/ActivitiesScreen.js

const handleSincronizarManual = async (actividadId, nombreActividad) => {
    // 1. Verificar Red
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert("Sin Conexión", "Verifique su internet e intente de nuevo.");
      return;
    }

    // 2. Activar spinner
    const startSync = new Set(sincronizando);
    startSync.add(actividadId);
    setSincronizando(startSync);

    try {
      const db = await getDBConnection();
      
      // Obtener pendientes
      const pendientes = await db.getAllAsync(
        `SELECT * FROM participaciones WHERE actividad_id = ? AND estado_subida = 0`,
        [actividadId]
      );

      if (pendientes.length === 0) {
        Alert.alert("Al día", "No hay firmas pendientes para subir.");
        
        // CORRECCIÓN EXTRA: Si dice que hay 0, forzamos visualmente a 0 por si acaso
        setActividades(prev => prev.map(item => 
            item.id === actividadId ? { ...item, pendientes: 0 } : item
        ));

      } else {
        // Enviar a la nube
        await enviarParticipaciones(pendientes);

        // Actualizar base de datos local
        await db.withTransactionAsync(async () => {
          for (const p of pendientes) {
            await db.runAsync('UPDATE participaciones SET estado_subida = 1 WHERE id = ?', [p.id]);
          }
        });

        // 🔥 EL TRUCO VISUAL: 
        // Actualizamos la lista en memoria INSTANTÁNEAMENTE para borrar el aviso
        setActividades(prev => prev.map(item => 
            item.id === actividadId ? { ...item, pendientes: 0 } : item
        ));

        Alert.alert("¡Éxito!", "Sincronización completada.");
        
        // (Opcional) Recarga real de fondo para asegurar
        cargarActividades(); 
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      // Apagar spinner
      const endSync = new Set(sincronizando);
      endSync.delete(actividadId);
      setSincronizando(endSync);
    }
  };

  const renderItem = ({ item }) => {
    const isSyncing = sincronizando.has(item.id);
    const hayPendientes = item.pendientes > 0;

    return (
      <View style={styles.cardContainer}>
        {/* PARTE IZQUIERDA: IR A LISTA */}
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
            <Text style={styles.badge}>{item.marco_logico || 'General'}</Text>
            {hayPendientes && (
              <Text style={styles.badgePendiente}>⚠️ {item.pendientes} por subir</Text>
            )}
          </View>
          <Text style={styles.title}>{item.nombre_actividad}</Text>
          <Text style={styles.tapText}>Toque para ver lista ›</Text>
        </TouchableOpacity>

        {/* PARTE DERECHA: BOTÓN SYNC */}
        <TouchableOpacity 
          style={[
            styles.syncButton, 
            hayPendientes ? styles.syncButtonActive : styles.syncButtonInactive
          ]} 
          onPress={() => handleSincronizarManual(item.id, item.nombre_actividad)}
          disabled={isSyncing || !hayPendientes}
        >
          {isSyncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons 
                name={hayPendientes ? "cloud-upload" : "check-circle"} 
                size={24} 
                color={hayPendientes ? "#fff" : "#adb5bd"} 
              />
              <Text style={[styles.syncText, hayPendientes ? {color:'#fff'} : {color:'#adb5bd'}]}>
                {hayPendientes ? "Subir" : "Al día"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER PERSONALIZADO */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#34859B" />
        </TouchableOpacity>
        <View style={{flex: 1}}>
            <Text style={styles.headerTitle}>{nombrePeriodo}</Text>
            <View style={{flexDirection:'row', alignItems:'center'}}>
                <View style={[styles.statusDot, isAutoSyncing ? {backgroundColor:'#ffc107'} : {backgroundColor:'#28a745'}]} />
                <Text style={styles.headerSubtitle}>
                  {isAutoSyncing ? "Sincronizando en segundo plano..." : "Sistema listo"}
                </Text>
            </View>
        </View>
      </View>

      <FlatList
        data={actividades}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
            <Text style={{textAlign:'center', marginTop: 50, color:'#999'}}>No hay actividades en este periodo.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fa' },
  header: { 
    backgroundColor: '#fff', 
    paddingHorizontal: 15, 
    paddingTop: 45, 
    paddingBottom: 15, 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderBottomWidth: 1, 
    borderBottomColor: '#e0e0e0',
    elevation: 2 
  },
  backBtn: { padding: 5, marginRight: 15 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerSubtitle: { fontSize: 12, color: '#666', marginLeft: 5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  
  list: { padding: 15 },
  
  cardContainer: { 
    backgroundColor: 'white', 
    borderRadius: 12, 
    marginBottom: 12, 
    elevation: 3, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: 'row', 
    overflow: 'hidden' 
  },
  cardContent: { flex: 1, padding: 15 },
  
  syncButton: { width: 75, justifyContent: 'center', alignItems: 'center', borderLeftWidth: 1, borderLeftColor: '#f0f0f0' },
  syncButtonActive: { backgroundColor: '#34859B' }, // Azul Petróleo (Activo)
  syncButtonInactive: { backgroundColor: '#f8f9fa' }, // Gris (Inactivo)
  
  syncText: { fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  
  badgeContainer: { flexDirection: 'row', marginBottom: 8, flexWrap: 'wrap' },
  badge: { backgroundColor: '#e3f2fd', color: '#34859B', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 11, marginRight: 5, fontWeight: 'bold' },
  badgePendiente: { backgroundColor: '#fff0f0', color: '#d32f2f', borderWidth: 1, borderColor: '#ffcdd2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 10, fontWeight: 'bold' },
  
  title: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50', marginBottom: 8 },
  tapText: { color: '#46B094', fontSize: 12, fontWeight: '600' } // Verde Turquesa
});