// src/utils/compressor.js
import * as ImageManipulator from 'expo-image-manipulator';

export const comprimirFirma = async (firmaBase64) => {
  try {
    // 1. Validar encabezado
    let uri = firmaBase64;
    if (firmaBase64 && !firmaBase64.startsWith('data:image')) {
      uri = `data:image/png;base64,${firmaBase64}`;
    }

    // 2. COMPRESIÓN EQUILIBRADA (Calidad vs Velocidad)
    // - Resize 300: Aumentamos el ancho de 180 a 300px. Da mucha más definición al trazo.
    // - Compress 0.8: Subimos la calidad al 80%. Las líneas serán nítidas, no borrosas.
    // - Format WEBP: Seguimos usando WEBP porque es el mejor para mantener el fondo
    //   transparente con poco peso.
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 300 } }], 
      { 
        compress: 0.8, 
        format: ImageManipulator.SaveFormat.WEBP, 
        base64: true 
      }
    );

    // Retornamos la firma. Pesará aprox 10KB - 15KB.
    // Es 10 veces más ligera que la original, pero se ve casi igual de bien.
    return `data:image/webp;base64,${result.base64}`;
    
  } catch (error) {
    console.error("Error comprimiendo firma:", error);
    // Si falla la compresión, devolvemos la original para no perder el dato,
    // aunque sea pesada.
    return firmaBase64; 
  }
};