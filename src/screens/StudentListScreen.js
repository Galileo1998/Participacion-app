// src/screens/StudentListScreen.js
import * as Location from 'expo-location'; // GPS
import * as Network from 'expo-network'; // Internet
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SignatureScreen from "react-native-signature-canvas";
import { getDBConnection } from '../database/db';
import { enviarParticipaciones } from '../services/api'; // Servicio de subida
import { comprimirFirma } from '../utils/compressor'; // <--- IMPORTANTE: Importar el compresor

export default function StudentListScreen({ route, navigation }) {
  // Recibimos los filtros y datos de la actividad
  const { actividadId, nombreActividad, nombrePeriodo, filtroCentro, filtroGrado } = route.params || {};

  const [estudiantes, setEstudiantes] = useState([]);
  const [filtrados, setFiltrados] = useState([]);
  const [asistencias, setAsistencias] = useState(new Set());
  const [busqueda, setBusqueda] = useState('');
  const [cargandoFirma, setCargandoFirma] = useState(false); // Spinner al guardar

  // Estados para la Modal de Firma
  const [modalVisible, setModalVisible] = useState(false);
  const [alumnoAFirmar, setAlumnoAFirmar] = useState(null);
  
  const refFirma = useRef(); 
  const hoy = new Date().toISOString().split('T')[0];

  useEffect(() => {
    cargarDatos();
    pedirPermisosGPS();
  }, []);

  const pedirPermisosGPS = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('Permiso de GPS denegado (se usará "Sin GPS")');
    }
  };

  const cargarDatos = async () => {
    try {
      const db = await getDBConnection();

      // 1. Cargar Estudiantes (Usamos UPPER/TRIM para evitar errores de texto)
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
        'SELECT id_nnaj FROM participaciones WHERE actividad_id = ? AND fecha = ?', 
        [actividadId, hoy]
      );
      setAsistencias(new Set(asistenciasHoy.map(a => a.id_nnaj)));

    } catch (e) {
      console.error("Error cargando datos:", e);
      Alert.alert("Error", "No se pudieron cargar los estudiantes.");
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

  // --- LÓGICA DE INTERACCIÓN ---

  const handlePressEstudiante = async (estudiante) => {
    const yaAsistio = asistencias.has(estudiante.id_nnaj);

    if (yaAsistio) {
      // Si ya firmó, opción de borrar
      Alert.alert(
        "Eliminar Asistencia",
        `¿Borrar asistencia de ${estudiante.nombre_completo}?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Eliminar", style: "destructive", onPress: () => borrarAsistencia(estudiante.id_nnaj) }
        ]
      );
    } else {
      // Si no ha firmado, abrir modal
      setAlumnoAFirmar(estudiante);
      setModalVisible(true);
    }
  };

  const handleSignatureOK = async (signature) => {
    if (!alumnoAFirmar) return;
    
    setCargandoFirma(true); // <--- El spinner arranca aquí

    // Hacemos un pequeño "sleep" técnico de 10ms para permitir que 
    // la interfaz dibuje el spinner antes de congelarse procesando la imagen.
    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      const fechaHora = new Date().toISOString().replace('T', ' ').split('.')[0]; 
      let coordenadas = "Sin GPS";
      
      // --- LÓGICA DE GPS OPTIMIZADA (FAST GPS) ---
      try {
        // 1. Intento Rápido: ¿El celular ya sabe dónde está? (Instantáneo)
        let location = await Location.getLastKnownPositionAsync();
        
        // 2. Si no sabe, buscamos satélites pero con PACIENCIA LIMITADA (Máximo 4 seg)
        if (!location) {
            // Promesa que falla a los 4 segundos
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Timeout GPS")), 4000)
            );
            
            // Promesa del GPS real
            const gpsPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            
            // Competencia: ¿Quién gana? ¿El GPS o el Reloj?
            location = await Promise.race([gpsPromise, timeout]);
        }
    
        if (location && location.coords) {
            coordenadas = `${location.coords.latitude},${location.coords.longitude}`;
        }
      } catch (e) {
        console.log("GPS omitido por lentitud o error:", e.message);
        // No pasa nada, seguimos guardando con "Sin GPS" para no trabar la app
      }
      // -------------------------------------------

      // --- COMPRESIÓN DE FIRMA ---
      // Convertimos la firma gigante en una miniatura ligera antes de guardarla
      const firmaComprimida = await comprimirFirma(signature);

      // --- DIAGNÓSTICO ---
      console.log("Guardando firma:", {
        id: alumnoAFirmar.id_nnaj,
        originalSize: signature.length,
        compressedSize: firmaComprimida.length // Debería ser mucho menor
      });

      const db = await getDBConnection();
      
      // --- GUARDAR LOCALMENTE (SQLITE) ---
      await db.runAsync(
        `INSERT INTO participaciones (id_nnaj, actividad_id, fecha, mes_nombre, firma, timestamp, coordenadas, estado_subida) 
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
            alumnoAFirmar.id_nnaj || null, 
            actividadId || null, 
            hoy || null, 
            nombrePeriodo || 'Sin Periodo',
            firmaComprimida || null, // <--- LA VERSIÓN LIGERA
            fechaHora || null, 
            coordenadas || null
        ]
      );

      // Actualizar visualmente la lista (Check verde)
      const nuevas = new Set(asistencias);
      nuevas.add(alumnoAFirmar.id_nnaj);
      setAsistencias(nuevas);
      setModalVisible(false);

      // --- INTENTAR SUBIR AL SERVIDOR ---
      const netInfo = await Network.getNetworkStateAsync();
      
      if (netInfo.isConnected && netInfo.isInternetReachable) {
        const paquete = [{
            id_nnaj: alumnoAFirmar.id_nnaj,
            actividad_id: actividadId,
            fecha: hoy,
            mes_nombre: nombrePeriodo || 'Sin Periodo',
            firma: firmaComprimida, // <--- SUBIMOS LA LIGERA
            timestamp: fechaHora,
            coordenadas: coordenadas
        }];

        await enviarParticipaciones(paquete);
        
        // Si subió bien, marcamos como subido localmente
        await db.runAsync(
            'UPDATE participaciones SET estado_subida = 1 WHERE id_nnaj = ? AND actividad_id = ? AND fecha = ?',
            [alumnoAFirmar.id_nnaj, actividadId, hoy]
        );
        Alert.alert("✅ Sincronizado", "Asistencia subida.");
      } else {
        Alert.alert("💾 Guardado Offline", "Sin internet. Se guardó en el celular.");
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
      await db.runAsync(
        'DELETE FROM participaciones WHERE actividad_id = ? AND id_nnaj = ? AND fecha = ?',
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

  return (
    <View style={styles.container}>
      {/* Encabezado */}
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

      {/* Lista de Estudiantes */}
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
            {estudiantes.length === 0 ? "No se encontraron estudiantes." : "No hay coincidencias con la búsqueda."}
          </Text>
        }
      />

      {/* MODAL DE FIRMA */}
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