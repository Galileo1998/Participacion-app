// src/screens/ActivitiesScreen.js
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';

export default function ActivitiesScreen({ route, navigation }) {
  // 1. RECIBIMOS LA INFORMACIÓN (La papa caliente)
  const { periodoId, nombrePeriodo, filtroCentro, filtroGrado } = route.params;
  
  const [actividades, setActividades] = useState([]);

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

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('StudentList', { 
        // 2. PASAMOS LA INFORMACIÓN A LA SIGUIENTE PANTALLA
        actividadId: item.id, 
        nombreActividad: item.nombre_actividad,
        nombrePeriodo: nombrePeriodo,
        filtroCentro: filtroCentro, // <--- ¡AQUÍ ESTÁ LA CLAVE!
        filtroGrado: filtroGrado    // <--- SI FALTAN ESTOS, LA LISTA SALE VACÍA
      })}
    >
      <View style={styles.badgeContainer}>
        <Text style={styles.badge}>{item.marco_logico}</Text>
        <Text style={styles.typeBadge}>{item.tipo_actividad}</Text>
      </View>
      <Text style={styles.title}>{item.nombre_actividad}</Text>
      <View style={styles.footer}>
         <Text style={styles.tapText}>Toque para pasar lista ›</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Volver</Text>
        </TouchableOpacity>
        <View>
            <Text style={styles.headerTitle}>{nombrePeriodo}</Text>
            {/* Debug visual para ver si llegaron los datos */}
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
  card: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 12, elevation: 2 },
  badgeContainer: { flexDirection: 'row', marginBottom: 8 },
  badge: { backgroundColor: '#fff3cd', color: '#856404', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12, marginRight: 5, fontWeight: 'bold' },
  typeBadge: { backgroundColor: '#e2e3e5', color: '#383d41', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, fontSize: 12 },
  title: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  footer: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 10, marginTop: 5 },
  tapText: { color: '#0d6efd', fontSize: 14, textAlign: 'right', fontWeight: '500' }
});