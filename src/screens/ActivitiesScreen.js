import { MaterialIcons } from '@expo/vector-icons'; // Iconos bonitos
import * as Network from 'expo-network'; // Para chequear internet
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';
import { enviarParticipaciones } from '../services/api'; // Tu servicio de subida

export default function ActivitiesScreen({ route, navigation }) {
  const { periodoId, nombrePeriodo, filtroCentro, filtroGrado } = route.params;
  
  const [actividades, setActividades] = useState([]);
  const [sincronizando, setSincronizando] = useState(new Set()); // Para saber cuál tarjeta está cargando

  useEffect(() => {
    cargarActividades();
  }, []);

  const cargarActividades = async () => {
    try {
      const db = await getDBConnection();
      const resultados = await db.getAllAsync(
        'SELECT * FROM actividades WHERE periodo_id = ?', 
        [periodoId]
      );
      setActividades(resultados);
    } catch (e) {
      console.error(e);
    }
  };

  // --- FUNCIÓN DE SINCRONIZACIÓN MANUAL ---
  const handleSincronizar = async (actividadId, nombreActividad) => {
    // 1. Verificar Internet
    const netInfo = await Network.getNetworkStateAsync();
    if (!netInfo.isConnected || !netInfo.isInternetReachable) {
      Alert.alert("Sin Conexión", "Conéctate a internet para subir las firmas pendientes.");
      return;
    }

    // Marcamos esta actividad como "cargando"
    const startSync = new Set(sincronizando);
    startSync.add(actividadId);
    setSincronizando(startSync);

    try {
      const db = await getDBConnection();

      // 2. BUSCAR SOLO LAS PENDIENTES (estado_subida = 0)
      // Esto evita duplicados: solo tomamos lo que NO se ha subido.
      const pendientes = await db.getAllAsync(
        `SELECT * FROM participaciones 
         WHERE actividad_id = ? AND estado_subida = 0`,
        [actividadId]
      );

      if (pendientes.length === 0) {
        Alert.alert("Al día", `Todas las firmas de "${nombreActividad}" ya están en la nube.`);
      } else {
        // 3. ENVIAR AL SERVIDOR
        console.log(`Subiendo ${pendientes.length} firmas...`);
        await enviarParticipaciones(pendientes);

        // 4. ACTUALIZAR LOCALMENTE A "SUBIDO" (1)
        // Usamos una transacción para asegurar que todas se marquen
        await db.withTransactionAsync(async () => {
          for (const p of pendientes) {
            await db.runAsync(
              'UPDATE participaciones SET estado_subida = 1 WHERE id = ?',
              [p.id]
            );
          }
        });

        Alert.alert("¡Éxito!", `Se sincronizaron ${pendientes.length} firmas pendientes.`);
      }

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo sincronizar. Revisa tu conexión o el servidor.");
    } finally {
      // Quitamos el spinner
      const endSync = new Set(sincronizando);
      endSync.delete(actividadId);
      setSincronizando(endSync);
    }
  };

  const renderItem = ({ item }) => {
    const isSyncing = sincronizando.has(item.id);

    return (
      <View style={styles.cardContainer}>
        {/* PARTE IZQUIERDA: IR A LA LISTA */}
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
            <Text style={styles.typeBadge}>{item.tipo_actividad}</Text>
          </View>
          <Text style={styles.title}>{item.nombre_actividad}</Text>
          <Text style={styles.tapText}>Toque para pasar lista ›</Text>
        </TouchableOpacity>

        {/* PARTE DERECHA: BOTÓN DE SINCRONIZAR (LA NUBE) */}
        <TouchableOpacity 
          style={styles.syncButton} 
          onPress={() => handleSincronizar(item.id, item.nombre_actividad)}
          disabled={isSyncing}
        >
          {isSyncing ? (
            <ActivityIndicator color="#0d6efd" />
          ) : (
            <>
              <MaterialIcons name="cloud-upload" size={28} color="#0d6efd" />
              <Text style={styles.syncText}>Subir</Text>
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
            <Text style={{fontSize: 10, color: '#999'}}>{filtroGrado} - {filtroCentro}</Text>
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
  
  // Nuevo diseño de tarjeta dividida
  cardContainer: { 
    backgroundColor: 'white', 
    borderRadius: 10, 
    marginBottom: 12, 
    elevation: 2, 
    flexDirection: 'row', // Fila horizontal
    overflow: 'hidden'
  },
  cardContent: { 
    flex: 1, // Toma la mayor parte del espacio
    padding: 15 
  },
  syncButton: { 
    width: 70, 
    backgroundColor: '#f1f8ff', 
    justifyContent: 'center', 
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#eee'
  },
  syncText: {
    fontSize: 10,
    color: '#0d6efd',
    fontWeight: 'bold',
    marginTop: 4
  },

  badgeContainer: { flexDirection: 'row', marginBottom: 8 },
  badge: { backgroundColor: '#fff3cd', color: '#856404', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, marginRight: 5, fontWeight: 'bold' },
  typeBadge: { backgroundColor: '#e2e3e5', color: '#383d41', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  tapText: { color: '#0d6efd', fontSize: 12, fontWeight: '500' }
});