import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';

export default function PeriodsScreen({ route, navigation }) {
  // Recibimos el filtro del grado elegido en el Home
  const { filtroCentro, filtroGrado } = route.params;
  const [periodos, setPeriodos] = useState([]);

  useEffect(() => {
    const cargar = async () => {
        const db = await getDBConnection();
        const data = await db.getAllAsync('SELECT * FROM periodos ORDER BY id DESC');
        setPeriodos(data);
    };
    cargar();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Volver</Text></TouchableOpacity>
        <View>
            <Text style={styles.title}>Seleccione Reunión</Text>
            <Text style={styles.subtitle}>{filtroGrado} - {filtroCentro}</Text>
        </View>
      </View>

      <FlatList
        data={periodos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
                onPress={() => navigation.navigate('Activities', { 
                periodoId: item.id, 
                nombrePeriodo: item.nombre,
                // --- IMPORTANTE: ESTAS DOS LÍNEAS SON VITALES ---
                filtroCentro: filtroCentro, 
                filtroGrado: filtroGrado 
            })}
          >
            <Text style={styles.cardText}>{item.nombre}</Text>
            <Text>›</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{padding: 20}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { backgroundColor: 'white', padding: 20, paddingTop: 50, flexDirection: 'row', alignItems: 'center', gap: 20 },
  back: { color: '#0d6efd', fontSize: 16 },
  title: { fontSize: 18, fontWeight: 'bold' },
  subtitle: { fontSize: 12, color: '#666' },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 10, marginBottom: 10, flexDirection: 'row', justifyContent: 'space-between', elevation: 1 },
  cardText: { fontSize: 16, fontWeight: '500' }
});