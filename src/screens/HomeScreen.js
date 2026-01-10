// src/screens/HomeScreen.js
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getDBConnection } from '../database/db';

export default function HomeScreen({ navigation }) {
  const [docente, setDocente] = useState(null);
  const [clases, setClases] = useState([]); // Ahora son CLASES, no periodos

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      const db = await getDBConnection();
      const sessionData = await db.getFirstAsync('SELECT * FROM sesion');
      setDocente(sessionData);

      // Cargamos las tarjetas de grados
      const clasesData = await db.getAllAsync('SELECT * FROM mis_clases');
      setClases(clasesData);
    } catch (e) {
      console.error(e);
    }
  };

  const cerrarSesion = async () => { /* ... código de cerrar sesión igual ... */ };

  const renderCard = ({ item }) => (
    <TouchableOpacity 
      style={styles.card} 
      // Al hacer clic, vamos a los Periodos, pero FILTRANDO por este grado
      onPress={() => navigation.navigate('Periods', { 
         filtroCentro: item.centro, 
         filtroGrado: item.grado 
      })}
    >
      <View style={styles.iconContainer}><Text style={styles.icon}>🎓</Text></View>
      <View>
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
        <View>
          <Text style={styles.welcome}>Bienvenido,</Text>
          {/* AQUÍ SALDRÁ EL NOMBRE REAL */}
          <Text style={styles.docenteName}>{docente ? docente.nombre : '...'}</Text>
        </View>
        {/* Botón Salir (puedes copiar el estilo anterior) */}
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
// ... Copia los estilos del archivo anterior, son los mismos ...
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#0d6efd', padding: 25, paddingTop: 50, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  welcome: { color: '#e0e0e0', fontSize: 14 },
  docenteName: { color: 'white', fontSize: 22, fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', margin: 20, marginBottom: 10, color: '#333' },
  list: { paddingHorizontal: 20 },
  card: { backgroundColor: 'white', padding: 20, borderRadius: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  iconContainer: { backgroundColor: '#e7f1ff', padding: 12, borderRadius: 10, marginRight: 15 },
  icon: { fontSize: 24 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  cardSubtitle: { fontSize: 14, color: '#666' },
  cardMuni: { fontSize: 12, color: '#999', marginTop: 2 },
  arrow: { fontSize: 24, color: '#ccc', marginLeft: 'auto' }
});