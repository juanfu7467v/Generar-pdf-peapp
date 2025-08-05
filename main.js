const express = require("express");
const axios = require("axios");
const { PDFDocument, rgb } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Se usa una función asíncrona para inicializar la app de forma segura
async function initializeApp() {
  try {
    // Intenta crear el directorio 'public' de forma recursiva.
    // Si ya existe, no hará nada y no lanzará un error.
    await fs.promises.mkdir(PUBLIC_DIR, { recursive: true });
    console.log("Directorio 'public' asegurado.");
  } catch (err) {
    console.error("Error al asegurar el directorio 'public':", err);
    // En caso de que el error no sea 'EEXIST', salimos del proceso
    if (err.code !== 'EEXIST') {
      process.exit(1);
    }
  }

  // URLs de las APIs
  const API_URLS = {
    reniec: (dni) => `https://poxy-production.up.railway.app/reniec?dni=${dni}&source=database`,
    matrimonios: (dni) => `https://poxy-production.up.railway.app/matrimonios?dni=${dni}`,
    telefonia: (dni) => `https://poxy-production.up.railway.app/telefonia-doc?documento=${dni}`,
    correos: (dni) => `https://poxy-production.up.railway.app/correos?dni=${dni}`,
    sueldos: (dni) => `https://poxy-production.up.railway.app/sueldos?dni=${dni}`,
    trabajos: (dni) => `https://poxy-production.up.railway.app/trabajos?dni=${dni}`,
    consumos: (dni) => `https://poxy-production.up.railway.app/consumos?dni=${dni}`,
    arbol: (dni) => `https://poxy-production.up.railway.app/arbol?dni=${dni}`,
    familia: (dni) => `https://poxy-production.up.railway.app/familia1?dni=${dni}`,
    empresas: (dni) => `https://poxy-production.up.railway.app/empresas?dni=${dni}`,
  };

  // Fuente de logo e icono
  const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";

  app.get("/generar-ficha-pdf", async (req, res) => {
    const { dni } = req.query;
    if (!dni) {
      return res.status(400).json({ error: "Falta el parámetro DNI" });
    }

    try {
      // Obtenemos los datos de todas las APIs en paralelo
      const [
        reniecData,
        matrimoniosData,
        telefoniaData,
        correosData,
        sueldosData,
        trabajosData,
        consumosData,
        arbolData,
        empresasData,
      ] = await Promise.all([
        axios.get(API_URLS.reniec(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.matrimonios(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.telefonia(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.correos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.sueldos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.trabajos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.consumos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.arbol(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.empresas(dni)).catch(() => ({ data: { result: null } })),
      ]).then(responses => responses.map(res => res.data?.result));

      // Si no hay datos básicos de RENIEC, se devuelve un error 404
      if (!reniecData) {
        return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });
      }

      // Crear un nuevo documento PDF
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const margin = 50;
      const fontSize = 10;
      const fontBoldSize = 12;
      let y = height - margin;

      const drawText = (text, x, size, isBold = false, color = rgb(0, 0, 0)) => {
        if (y < margin) {
          page = pdfDoc.addPage();
          y = height - margin;
        }
        const font = isBold ? "Helvetica-Bold" : "Helvetica";
        page.drawText(text, {
          x: x,
          y: y,
          size: size,
          font: pdfDoc.embedStandardFont(font),
          color: color,
        });
        y -= size * 1.5;
      };

      // Agregar el logo
      try {
        const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
        const mainIcon = await Jimp.read(iconBuffer);
        const pngImage = await pdfDoc.embedPng(await mainIcon.getBufferAsync(Jimp.MIME_PNG));
        page.drawImage(pngImage, {
          x: width - 150,
          y: height - 100,
          width: 100,
          height: 100,
        });
      } catch (error) {
        console.error("Error al cargar el icono:", error);
      }

      // Título principal
      drawText("Ficha de Información Personal", margin, 24, true);
      y -= 20;

      // Secciones de datos
      const drawSection = (title, data) => {
        if (data && (typeof data === 'object' ? Object.keys(data).length > 0 : data.length > 0)) {
          y -= 10;
          drawText(`--- ${title} ---`, margin, fontBoldSize, true, rgb(0.2, 0.2, 0.2));
          y -= 5;
        }
      };

      const drawKeyValuePair = (label, value) => {
        drawText(`  ${label}:`, margin, fontSize, true);
        const valueLines = `${value || "-"}`.match(/.{1,100}/g) || ["-"];
        for (const line of valueLines) {
          drawText(`    ${line}`, margin, fontSize);
        }
      };

      // Datos Personales
      drawSection("Datos Personales", reniecData);
      if (reniecData) {
        drawKeyValuePair("DNI", reniecData.nuDni);
        drawKeyValuePair("Apellidos", `${reniecData.apePaterno} ${reniecData.apeMaterno} ${reniecData.apCasada || ''}`.trim());
        drawKeyValuePair("Prenombres", reniecData.preNombres);
        drawKeyValuePair("Nacimiento", reniecData.feNacimiento);
        drawKeyValuePair("Sexo", reniecData.sexo);
        drawKeyValuePair("Estado Civil", reniecData.estadoCivil);
        drawKeyValuePair("Estatura", `${reniecData.estatura || "-"} cm`);
        drawKeyValuePair("Grado de Instrucción", reniecData.gradoInstruccion);
        drawKeyValuePair("Restricción", reniecData.deRestriccion || "NINGUNA");
        drawKeyValuePair("Donación de Órganos", reniecData.donaOrganos);
        drawKeyValuePair("Fecha de Emisión", reniecData.feEmision);
        drawKeyValuePair("Fecha de Caducidad", reniecData.feCaducidad);
        drawKeyValuePair("Fecha de Fallecimiento", reniecData.feFallecimiento || "-");
      }

      // Datos de Dirección
      drawSection("Datos de Dirección", reniecData);
      if (reniecData) {
        drawKeyValuePair("Dirección", reniecData.desDireccion);
        drawKeyValuePair("Departamento", reniecData.depaDireccion);
        drawKeyValuePair("Provincia", reniecData.provDireccion);
        drawKeyValuePair("Distrito", reniecData.distDireccion);
        drawKeyValuePair("Ubigeo RENIEC", reniecData.ubicacion?.ubigeo_reniec);
        drawKeyValuePair("Ubigeo INEI", reniecData.ubicacion?.ubigeo_inei);
      }

      // Padres
      drawSection("Información de Padres", reniecData);
      if (reniecData) {
        drawKeyValuePair("Padre", reniecData.nomPadre || "-");
        drawKeyValuePair("Madre", reniecData.nomMadre || "-");
      }

      // Matrimonios
      drawSection("Matrimonios", matrimoniosData?.coincidences);
      if (matrimoniosData?.coincidences?.length > 0) {
        matrimoniosData.coincidences.forEach((matrimonio) => {
          drawText(`  - Nombre: ${matrimonio.nombres} ${matrimonio.apellido_paterno} ${matrimonio.apellido_materno || ""}`.trim(), margin, fontSize);
          drawText(`    Documento: ${matrimonio.doc}`, margin, fontSize);
          drawText(`    Fecha: ${matrimonio.fecha}`, margin, fontSize);
          drawText(`    Lugar: ${matrimonio.lugar}`, margin, fontSize);
          y -= 5;
        });
      }

      // Telefonía
      drawSection("Telefonía", telefoniaData?.coincidences);
      if (telefoniaData?.coincidences?.length > 0) {
        telefoniaData.coincidences.forEach((tel) => {
          drawText(`  - Teléfono: ${tel.telefono}`, margin, fontSize);
          drawText(`    Fuente: ${tel.fuente}`, margin, fontSize);
          drawText(`    Plan: ${tel.plan || "-"}`, margin, fontSize);
          drawText(`    Periodo: ${tel.periodo || "-"}`, margin, fontSize);
          y -= 5;
        });
      }

      // Correos Electrónicos
      drawSection("Correos Electrónicos", correosData?.coincidences);
      if (correosData?.coincidences?.length > 0) {
        correosData.coincidences.forEach((correo) => {
          drawText(`  - Correo: ${correo.correo}`, margin, fontSize);
          drawText(`    Fuente: ${correo.fuente}`, margin, fontSize);
          drawText(`    Fecha: ${correo.fecha || "-"}`, margin, fontSize);
          y -= 5;
        });
      }

      // Sueldos
      drawSection("Sueldos", sueldosData?.coincidences);
      if (sueldosData?.coincidences?.length > 0) {
        sueldosData.coincidences.forEach((sueldo) => {
          drawText(`  - Empresa: ${sueldo.empresa} (${sueldo.ruc})`, margin, fontSize);
          drawText(`    Sueldo: S/ ${sueldo.sueldo}`, margin, fontSize);
          drawText(`    Periodo: ${sueldo.periodo}`, margin, fontSize);
          y -= 5;
        });
      }

      // Trabajos
      drawSection("Trabajos", trabajosData?.coincidences);
      if (trabajosData?.coincidences?.length > 0) {
        trabajosData.coincidences.forEach((trabajo) => {
          drawText(`  - Empresa: ${trabajo.rz} (${trabajo.ruc})`, margin, fontSize);
          drawText(`    Inicio: ${trabajo.fip}`, margin, fontSize);
          drawText(`    Fin: ${trabajo.ffp}`, margin, fontSize);
          y -= 5;
        });
      }

      // Consumos
      drawSection("Consumos", consumosData?.coincidences);
      if (consumosData?.coincidences?.length > 0) {
        consumosData.coincidences.forEach((consumo) => {
          drawText(`  - Emisor: ${consumo.razonSocial} (${consumo.numRucEmisor})`, margin, fontSize);
          drawText(`    Monto: S/ ${consumo.monto}`, margin, fontSize);
          drawText(`    Fecha: ${consumo.fecha}`, margin, fontSize);
          y -= 5;
        });
      }

      // Árbol Genealógico
      drawSection("Árbol Genealógico", arbolData?.coincidences);
      if (arbolData?.coincidences?.length > 0) {
        arbolData.coincidences.forEach((relacion) => {
          drawText(`  - Relación: ${relacion.tipo}`, margin, fontSize);
          drawText(`    Nombre: ${relacion.nom} ${relacion.ap} ${relacion.am || ""}`.trim(), margin, fontSize);
          drawText(`    DNI: ${relacion.dni}`, margin, fontSize);
          drawText(`    Verificación: ${relacion.verificacion_relacion}`, margin, fontSize);
          y -= 5;
        });
      }

      // Empresas
      drawSection("Empresas Relacionadas", empresasData?.coincidences);
      if (empresasData?.coincidences?.length > 0) {
        empresasData.coincidences.forEach((empresa) => {
          drawText(`  - Empresa: ${empresa.razon_social} (${empresa.ruc})`, margin, fontSize);
          drawText(`    Cargo: ${empresa.cargo}`, margin, fontSize);
          drawText(`    Desde: ${empresa.desde}`, margin, fontSize);
          y -= 5;
        });
      }

      // Pie de página
      if (y < margin + 60) {
        page = pdfDoc.addPage();
        y = height - margin;
      }
      y = margin + 50;
      page.drawText(
        "Fuente: www.socialcreator.com/consultapeapk",
        { x: margin, y: y, size: fontSize, color: rgb(0.5, 0.5, 0.5) }
      );
      page.drawText(
        "Este documento es solo informativo y no representa un documento oficial ni tiene validez legal.",
        { x: margin, y: y - 15, size: fontSize, color: rgb(0.5, 0.5, 0.5) }
      );

      // Guardar el PDF y enviar la URL
      const pdfBytes = await pdfDoc.save();
      const nombreArchivo = `${uuidv4()}.pdf`;
      const rutaPDF = path.join(PUBLIC_DIR, nombreArchivo);
      await fs.promises.writeFile(rutaPDF, pdfBytes);

      const url = `${req.protocol}://${req.get("host")}/public/${nombreArchivo}`;
      res.json({ message: "Ficha generada en PDF", url });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al generar la ficha en PDF", detalle: error.message });
    }
  });

  app.use("/public", express.static(PUBLIC_DIR));

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

// Llama a la función para inicializar la aplicación
initializeApp();
