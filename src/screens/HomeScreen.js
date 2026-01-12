import { useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';

export default function HomeScreen({ navigation }) {
  const [docente, setDocente] = useState(null);
  const [clases, setClases] = useState([]); 

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const db = await getDBConnection();
      const sessionData = await db.getFirstAsync('SELECT * FROM sesion');
      setDocente(sessionData);

      const clasesData = await db.getAllAsync('SELECT * FROM mis_clases');
      setClases(clasesData);
    } catch (e) {
      console.error(e);
    }
  };

  const cerrarSesion = async () => {
    try {
      const db = await getDBConnection();
      await db.runAsync('DELETE FROM sesion');
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (e) {
      console.error("Error al cerrar sesión", e);
      Alert.alert("Error", "No se pudo cerrar la sesión");
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
    alignItems: 'center'
  },
  welcome: { color: '#e0e0e0', fontSize: 14 },
  docenteName: { color: 'white', fontSize: 20, fontWeight: 'bold', maxWidth: 200 }, 
  logoutButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
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