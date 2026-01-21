// src/screens/StudentListScreen.js
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import SignatureScreen from "react-native-signature-canvas";

import { getDBConnection } from '../database/db';
import { enviarParticipaciones } from '../services/api';
import { comprimirFirma } from '../utils/compressor';

export default function StudentListScreen({ route, navigation }) {
  // Protección: Si route.params es undefined, usamos un objeto vacío para no crashear
  const { actividadId, nombreActividad, nombrePeriodo, filtroCentro, filtroGrado } = route.params || {};

  const [estudiantes, setEstudiantes] = useState([]);
  const [filtrados, setFiltrados] = useState([]);
  const [asistencias, setAsistencias] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');
  
  // ESTADOS DE CARGA (Para evitar pantalla blanca)
  const [cargandoDatos, setCargandoDatos] = useState(true); 
  const [cargandoFirma, setCargandoFirma] = useState(false);

  // Estados Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [alumnoAFirmar, setAlumnoAFirmar] = useState(null);
  
  const refFirma = useRef(); 
  const hoy = new Date().toISOString().split('T')[0];

  useEffect(() => {
    // Validar que tenemos los datos mínimos necesarios antes de intentar cargar
    if (!actividadId || !filtroCentro) {
        Alert.alert("Error de Navegación", "Faltan datos del centro o actividad.");
        navigation.goBack();
        return;
    }
    cargarDatos();
    pedirPermisosGPS();
  }, []);

  const pedirPermisosGPS = async () => {
    try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') console.log('GPS denegado');
    } catch (e) {
        console.log("Error solicitando GPS (ignorable)");
    }
  };

  const cargarDatos = async () => {
    setCargandoDatos(true); // Empieza a girar el spinner
    try {
      const db = await getDBConnection();

      // 🛡️ BLINDAJE CONTRA PANTALLA BLANCA 🛡️
      if (!db) {
        Alert.alert("Error de Base de Datos", "No se pudo abrir la conexión local.");
        navigation.goBack();
        return;
      }

      // 1. Cargar Estudiantes
      const todos = await db.getAllAsync(
        `SELECT * FROM estudiantes 
         WHERE TRIM(UPPER(centro_educativo)) = TRIM(UPPER(?)) 
         AND TRIM(UPPER(grado_actual)) = TRIM(UPPER(?)) 
         ORDER BY nombre_completo ASC`,
        [filtroCentro, filtroGrado]
      );
      
      setEstudiantes(todos);
      setFiltrados(todos);

      // 2. Cargar Asistencias de HOY
      const asistenciasHoy = await db.getAllAsync(
        'SELECT estudiante_id FROM participaciones WHERE actividad_id = ? AND fecha = ?', 
        [actividadId, hoy]
      );
      
      setAsistencias(new Set(asistenciasHoy.map(a => a.estudiante_id)));

    } catch (e) {
      console.error("Error cargando datos:", e);
      Alert.alert("Error", "Ocurrió un problema al leer la lista de estudiantes.");
    } finally {
      setCargandoDatos(false); // Termina de cargar (quita el spinner)
    }
  };

  const handleSearch = (texto) => {
    setBusqueda(texto);
    if (texto) {
      setFiltrados(estudiantes.filter(i => (i.nombre_completo || '').toUpperCase().includes(texto.toUpperCase())));
    } else {
      setFiltrados(estudiantes);
    }
  };

  const handlePressEstudiante = async (estudiante) => {
    const yaAsistio = asistencias.has(estudiante.id_nnaj);

    if (yaAsistio) {
      Alert.alert(
        "Eliminar Asistencia",
        `¿Borrar asistencia de ${estudiante.nombre_completo}?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => borrarAsistencia(estudiante.id_nnaj) }
        ]
      );
    } else {
      setAlumnoAFirmar(estudiante);
      setModalVisible(true);
    }
  };

  const handleSignatureOK = async (signature) => {
    if (!alumnoAFirmar) return;
    
    setCargandoFirma(true); 
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const fechaHora = new Date().toISOString().replace('T', ' ').split('.')[0]; 
      let coordenadas = "Sin GPS";
      
      try {
        let location = await Location.getLastKnownPositionAsync();
        if (!location) {
            const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout GPS")), 4000));
            const gpsPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            location = await Promise.race([gpsPromise, timeout]);
        }
        if (location && location.coords) {
            coordenadas = `${location.coords.latitude},${location.coords.longitude}`;
        }
      } catch (e) {
        console.log("GPS omitido:", e.message);
      }

      const firmaComprimida = await comprimirFirma(signature);
      const db = await getDBConnection();

      if (!db) throw new Error("Base de datos no disponible");
      
      await db.runAsync(
        `INSERT INTO participaciones (estudiante_id, actividad_id, fecha, mes, firma, timestamp_registro, coordenadas, estado_subida) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
            alumnoAFirmar.id_nnaj, 
            actividadId, 
            hoy, 
            nombrePeriodo || 'Sin Periodo', 
            firmaComprimida, 
            fechaHora, 
            coordenadas
        ]
      );

      const nuevas = new Set(asistencias);
      nuevas.add(alumnoAFirmar.id_nnaj);
      setAsistencias(nuevas);
      setModalVisible(false);

// En src/screens/StudentListScreen.js

      // ... código anterior de guardar local ...

      // --- INTENTAR SUBIR AL SERVIDOR ---
      const netInfo = await Network.getNetworkStateAsync();
      if (netInfo.isConnected && netInfo.isInternetReachable) {
        
        // CORRECCIÓN AQUÍ:
        // Para el servidor usamos 'id_nnaj' (nombre viejo), aunque localmente sea 'estudiante_id'
        const paquete = [{
            id_nnaj: alumnoAFirmar.id_nnaj, // <--- ANTES DECÍA estudiante_id, CÁMBIALO A id_nnaj
            actividad_id: actividadId,
            fecha: hoy,
            mes: nombrePeriodo || 'Sin Periodo', // Asegúrate que tu servidor espera 'mes' o 'mes_nombre'
            firma: firmaComprimida,
            timestamp_registro: fechaHora,
            coordenadas: coordenadas
        }];

        await enviarParticipaciones(paquete);
        
        // Actualizamos localmente (Aquí sí usamos estudiante_id porque es la base local)
        await db.runAsync(
            'UPDATE participaciones SET estado_subida = 1 WHERE estudiante_id = ? AND actividad_id = ? AND fecha = ?',
            [alumnoAFirmar.id_nnaj, actividadId, hoy]
        );
        Alert.alert("✅ Sincronizado", "Asistencia subida.");
      }

    } catch (e) {
      console.error("ERROR AL GUARDAR:", e); 
      Alert.alert("Error Grave", "Fallo al guardar: " + e.message);
      setModalVisible(false);
    } finally {
      setCargandoFirma(false);
      setAlumnoAFirmar(null);
    }
  };

  const borrarAsistencia = async (id_estudiante) => {
    try {
      const db = await getDBConnection();
      if (!db) return;

      await db.runAsync(
        'DELETE FROM participaciones WHERE actividad_id = ? AND estudiante_id = ? AND fecha = ?',
        [actividadId, id_estudiante, hoy]
      );
      const nuevas = new Set(asistencias);
      nuevas.delete(id_estudiante);
      setAsistencias(nuevas);
    } catch (e) {
      console.error(e);
      Alert.alert("Error", "No se pudo eliminar.");
    }
  };

  const styleFirma = `.m-signature-pad--footer {display: none; margin: 0px;}`;

  // --- VISTA DE CARGA (Para evitar pantalla blanca) ---
  if (cargandoDatos) {
    return (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <ActivityIndicator size="large" color="#0d6efd" />
            <Text style={{marginTop: 10, color: '#666'}}>Cargando estudiantes...</Text>
        </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>‹ Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{nombreActividad}</Text>
        <TextInput 
            style={styles.searchInput} 
            placeholder="🔍 Buscar estudiante..." 
            value={busqueda} 
            onChangeText={handleSearch} 
        />
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(item) => item.id_nnaj}
        renderItem={({ item }) => {
          const isPresente = asistencias.has(item.id_nnaj);
          return (
            <TouchableOpacity 
              style={[styles.card, isPresente ? styles.cardPresente : styles.cardAusente]} 
              onPress={() => handlePressEstudiante(item)}
            >
              <View style={{flex: 1}}>
                <Text style={[styles.name, isPresente && styles.textPresente]}>{item.nombre_completo}</Text>
                <Text style={styles.subtext}>{item.grado_actual} | {item.genero}</Text>
              </View>
              <View style={[styles.checkbox, isPresente ? styles.checkActive : styles.checkInactive]}>
                <Text style={styles.checkIcon}>{isPresente ? '✓' : '✎'}</Text> 
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={{textAlign: 'center', marginTop: 40, color: '#999'}}>
            {estudiantes.length === 0 ? "No se encontraron estudiantes para este Centro/Grado." : "No hay coincidencias."}
          </Text>
        }
      />

      <Modal visible={modalVisible} animationType="slide" transparent={false} onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Firmar Asistencia</Text>
            <Text style={styles.modalSubtitle}>{alumnoAFirmar?.nombre_completo}</Text>
          </View>
          
          <View style={styles.signatureBox}>
            <SignatureScreen
                ref={refFirma}
                onOK={handleSignatureOK}
                onEmpty={() => Alert.alert("Atención", "Por favor firme antes de confirmar.")}
                descriptionText="Firme aquí con el dedo"
                clearText="Borrar"
                confirmText="Guardar"
                webStyle={styleFirma} 
            />
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.btnCancel} onPress={() => setModalVisible(false)} disabled={cargandoFirma}>
              <Text style={styles.btnTextCancel}>Cancelar</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.btnConfirm} onPress={() => refFirma.current.readSignature()} disabled={cargandoFirma}>
              {cargandoFirma ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnTextConfirm}>Confirmar y Guardar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { backgroundColor: 'white', padding: 15, paddingTop: 50, borderBottomWidth: 1, borderColor: '#eee' },
  backBtn: { marginBottom: 10 },
  backText: { color: '#0d6efd', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  searchInput: { backgroundColor: '#f1f3f4', borderRadius: 8, padding: 10 },
  list: { padding: 15 },
  card: { padding: 15, borderRadius: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 1 },
  cardAusente: { backgroundColor: 'white' },
  cardPresente: { backgroundColor: '#d1e7dd', borderColor: '#badbcc', borderWidth: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#333' },
  subtext: { fontSize: 12, color: '#666' },
  textPresente: { color: '#0f5132' },
  checkbox: { width: 35, height: 35, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2 },
  checkInactive: { borderColor: '#ddd' },
  checkActive: { borderColor: '#198754', backgroundColor: '#198754' },
  checkIcon: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  
  // Estilos Modal
  modalContainer: { flex: 1, backgroundColor: '#f8f9fa' },
  modalHeader: { padding: 20, paddingTop: 50, backgroundColor: '#0d6efd', alignItems: 'center' },
  modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  modalSubtitle: { color: '#e0e0e0', fontSize: 16, marginTop: 5 },
  signatureBox: { flex: 1, margin: 20, borderWidth: 1, borderColor: '#ccc', backgroundColor: 'white', borderRadius: 10, overflow: 'hidden' },
  modalButtons: { flexDirection: 'row', padding: 20, justifyContent: 'space-between', backgroundColor: 'white', paddingBottom: 40 },
  btnCancel: { flex: 1, padding: 15, backgroundColor: '#dc3545', borderRadius: 8, marginRight: 10, alignItems: 'center' },
  btnConfirm: { flex: 1, padding: 15, backgroundColor: '#198754', borderRadius: 8, marginLeft: 10, alignItems: 'center' },
  btnTextCancel: { color: 'white', fontWeight: 'bold' },
  btnTextConfirm: { color: 'white', fontWeight: 'bold' }
});