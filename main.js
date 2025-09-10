const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

const APP_DOWNLOAD_URL = "https://www.socialcreator.com/consultapeapk#apps";

const API_URLS = {
  reniec: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec?dni=${dni}`,
  sueldos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/sueldos?dni=${dni}`,
  consumos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/consumos?dni=${dni}`,
  matrimonios: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/matrimonios?dni=${dni}`,
  empresas: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/empresas?dni=${dni}`,
  fiscalia: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/fiscalia-dni?dni=${dni}`,
  licencia: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/licencia?dni=${dni}`,
  familia3: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/familia3?dni=${dni}`,
  arbol: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/arbol?dni=${dni}`,
  familia1: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/familia1?dni=${dni}`,
  denuncias: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/denuncias-dni?dni=${dni}`,
  trabajos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/trabajos?dni=${dni}`,
  movimientos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/movimientos?dni=${dni}`,
  familia2: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/familia2?dni=${dni}`,
  direcciones: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/direcciones?dni=${dni}`,
  correos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/correos?dni=${dni}`,
  telefonia: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/telefonia-doc?documento=${dni}`,
};

const createPage = async (title, lines, withPhoto = null, withQR = false) => {
  const img = new Jimp(1080, 1920, 0xFFFFFFFF);
  const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const fontData = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

  // Título centrado
  img.print(fontTitle, 0, 100, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, img.bitmap.width);

  let y = 250;
  const margin = 80;

  // Texto alineado a la izquierda
  for (const line of lines) {
    img.print(fontData, margin, y, line);
    y += 50;
  }

  // Foto a la derecha
  if (withPhoto) {
    withPhoto.resize(300, Jimp.AUTO);
    img.composite(withPhoto, img.bitmap.width - withPhoto.bitmap.width - margin, 250);
  }

  // QR en la misma página (solo en Datos Personales)
  if (withQR) {
    const qrCodeDataUrl = await QRCode.toDataURL(APP_DOWNLOAD_URL);
    const qrImage = await Jimp.read(Buffer.from(qrCodeDataUrl.split(",")[1], "base64"));
    qrImage.resize(250, 250);
    img.composite(qrImage, img.bitmap.width - qrImage.bitmap.width - margin, 600);
    img.print(fontData, img.bitmap.width - qrImage.bitmap.width - margin, 860, "Descargar App");
  }

  return img;
};

app.get("/generar-ficha-pdf", async (req, res) => {
  const { dni } = req.query;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    // Llamadas a todas las APIs
    const apiResults = await Promise.all(
      Object.values(API_URLS).map(async (urlFunc) => {
        try {
          const response = await axios.get(urlFunc(dni));
          return response.data?.result || response.data;
        } catch {
          return null;
        }
      })
    );

    const [
      reniecData, sueldosData, consumosData, matrimoniosData, empresasData,
      fiscaliaData, licenciaData, familia3Data, arbolData, familia1Data,
      denunciasData, trabajosData, movimientosData, familia2Data, direccionesData,
      correosData, telefoniaData,
    ] = apiResults;

    if (!reniecData) {
      return res.status(404).json({ error: "No se encontró información del DNI." });
    }

    const pages = [];

    // Página Datos Personales
    let photoImg = null;
    if (reniecData?.imagenes?.foto) {
      const photoBuffer = Buffer.from(reniecData.imagenes.foto, "base64");
      photoImg = await Jimp.read(photoBuffer);
    }
    pages.push(await createPage("Datos Personales", [
      `Nombres: ${reniecData.preNombres || "-"}`,
      `Apellidos: ${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}`,
      `DNI: ${reniecData.nuDni || "-"}`,
      `Nacimiento: ${reniecData.feNacimiento || "-"}`,
      `Dirección: ${reniecData.desDireccion || "-"}, ${reniecData.distDireccion || "-"}`,
    ], photoImg, true));

    // Función rápida para páginas
    const addSection = async (title, items, formatter) => {
      if (!items || items.length === 0) return;
      const lines = items.map(formatter).flat();
      pages.push(await createPage(title, lines));
    };

    // Historial laboral
    await addSection("Historial Laboral", sueldosData?.coincidences || [], (i) => [
      `Empresa: ${i.empresa || "-"}`,
      `Sueldo: S/.${i.sueldo || "-"}`,
      `Periodo: ${i.periodo || "-"}`,
    ]);

    // Consumos
    await addSection("Movimientos de Consumo", consumosData?.coincidences || [], (i) => [
      `Empresa: ${i.razonSocial || "-"}`,
      `Monto: S/.${i.monto || "-"}`,
      `Fecha: ${i.fecha || "-"}`,
    ]);

    // Movimientos Migratorios
    await addSection("Movimientos Migratorios", movimientosData?.coincidences || [], (i) => [
      `Fecha: ${i.fecmovimiento || "-"}`,
      `Tipo: ${i.tipmovimiento || "-"}`,
      `Destino: ${i.procedenciadestino || "-"}`,
    ]);

    // Denuncias
    await addSection("Denuncias Policiales", denunciasData?.coincidences || [], (i) => [
      `Comisaría: ${i.general?.comisaria || "-"}`,
      `Tipo: ${i.general?.tipo || "-"}`,
      `Fecha: ${i.general?.fecha_hora_registro || "-"}`,
    ]);

    // Licencia
    await addSection("Licencia de Conducir", licenciaData?.coincidences || [], (i) => [
      `Tipo: ${i.claseCategoria || "-"}`,
      `Estado: ${i.estado || "-"}`,
      `Expedición: ${i.fecExpedicion || "-"}`,
      `Vencimiento: ${i.fecVencimiento || "-"}`,
    ]);

    // Familiares
    const familiares = [familia1Data, familia2Data, familia3Data].filter(f => f?.coincidences?.length > 0).flatMap(f => f.coincidences);
    await addSection("Familiares", familiares, (i) => [
      `Nombre: ${i.nombre || "-"}`,
      `DNI: ${i.dni || "-"}`,
      `Parentesco: ${i.parentesco || "-"}`,
    ]);

    // Telefonía
    await addSection("Telefonía", telefoniaData?.coincidences || [], (i) => [
      `Teléfono: ${i.telefono || "-"}`,
      `Operador: ${i.operador || "-"}`,
      `Tipo de Línea: ${i.tipoLinea || "-"}`,
    ]);

    // Correos
    await addSection("Correos Electrónicos", correosData?.coincidences || [], (i) => [
      `Correo: ${i.correo || "-"}`,
    ]);

    // Direcciones
    await addSection("Direcciones Registradas", direccionesData?.coincidences || [], (i) => [
      `Dirección: ${i.direccion || "-"}`,
    ]);

    // Empresas
    await addSection("Empresas Vinculadas", empresasData?.coincidences || [], (i) => [
      `Razón Social: ${i.razonSocial || "-"}`,
      `RUC: ${i.ruc || "-"}`,
    ]);

    // Árbol Genealógico
    await addSection("Árbol Genealógico", arbolData?.coincidences || [], (i) => [
      `Nombre: ${i.nombres || "-"}`,
      `Parentesco: ${i.parentesco || "-"}`,
      `DNI: ${i.dni || "-"}`,
    ]);

    // Matrimonios
    await addSection("Matrimonios", matrimoniosData?.coincidences || [], (i) => [
      `Cónyuge: ${i.nombre_conyuge || "-"}`,
      `DNI Cónyuge: ${i.dni_conyuge || "-"}`,
      `Fecha: ${i.fecha_matrimonio || "-"}`,
      `Lugar: ${i.lugar_matrimonio || "-"}`,
    ]);

    // Fiscalía
    await addSection("Casos en Fiscalía", fiscaliaData?.coincidences || [], (i) => [
      `Caso: ${i.caso || "-"}`,
      `Fiscalía: ${i.fiscalia || "-"}`,
    ]);

    // Página final con disclaimer
    const disclaimerPage = new Jimp(1080, 1920, 0xFFFFFFFF);
    const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

    disclaimerPage.print(fontBig, 0, 500, { text: "© Consulta PE 2025", alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, disclaimerPage.bitmap.width);
    disclaimerPage.print(fontSmall, 0, 650, { text: "Todos los derechos reservados.", alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, disclaimerPage.bitmap.width);
    disclaimerPage.print(fontSmall, 100, 800,
      "Renuncia de responsabilidad: La información presentada\n" +
      "proviene de fuentes públicas oficiales. Consulta PE no se\n" +
      "responsabiliza por el uso indebido de los datos contenidos\n" +
      "en este documento."
    );
    pages.push(disclaimerPage);

    // Convertir todo a PDF
    const pdfDoc = await PDFDocument.create();
    for (const p of pages) {
      const buf = await p.getBufferAsync(Jimp.MIME_PNG);
      const pngImg = await pdfDoc.embedPng(buf);
      const page = pdfDoc.addPage([1080, 1920]);
      page.drawImage(pngImg, { x: 0, y: 0, width: 1080, height: 1920 });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfPath = path.join(PUBLIC_DIR, `${uuidv4()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    res.download(pdfPath, "Ficha_Consulta.pdf", (err) => {
      if (err) console.error("Error al enviar el archivo:", err);
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al generar el PDF", detalle: error.message });
  }
});

app.use("/public", express.static(PUBLIC_DIR));
app.listen(PORT, "0.0.0.0", () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
