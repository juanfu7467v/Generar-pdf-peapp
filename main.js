const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 8080;
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

// Función para escribir texto centrado en una imagen
const printCenteredText = async (image, font, text, y) => {
  image.print(font, 0, y, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, image.bitmap.width);
};

app.get("/generar-ficha-pdf", async (req, res) => {
  const { dni } = req.query;
  if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

  try {
    // --- Consultar todas las APIs ---
    const apiCalls = Object.entries(API_URLS).map(async ([key, fn]) => {
      try {
        const response = await axios.get(fn(dni));
        return [key, response.data?.result || response.data];
      } catch {
        return [key, null];
      }
    });
    const results = Object.fromEntries(await Promise.all(apiCalls));
    const { reniec, sueldos, consumos, matrimonios, empresas, fiscalia, licencia,
      familia1, familia2, familia3, arbol, denuncias, trabajos, movimientos,
      direcciones, correos, telefonia } = results;

    if (!reniec) return res.status(404).json({ error: "No se encontró información de RENIEC" });

    const images = [];
    const pageWidth = 1080, pageHeight = 1920;
    const margin = 80;

    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontSubtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_24_BLACK);

    const createPage = (title) => {
      const page = new Jimp(pageWidth, pageHeight, 0xffffffff);
      page.print(fontTitle, 0, 60, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, pageWidth);
      return { image: page, y: 150 };
    };

    const addLines = async (pageObj, lines) => {
      for (const line of lines) {
        await printCenteredText(pageObj.image, fontData, line, pageObj.y);
        pageObj.y += 40;
      }
    };

    // --- Página Datos Personales ---
    let page = createPage("Datos Personales");
    await addLines(page, [
      `Nombres: ${reniec.preNombres || "-"}`,
      `Apellidos: ${reniec.apePaterno || ""} ${reniec.apeMaterno || ""}`,
      `DNI: ${reniec.nuDni || "-"}`,
      `Fecha de Nacimiento: ${reniec.feNacimiento || "-"}`,
      `Dirección: ${reniec.desDireccion || "-"}, ${reniec.distDireccion || "-"}`
    ]);
    if (reniec.imagenes?.foto) {
      const photoBuffer = Buffer.from(reniec.imagenes.foto, "base64");
      const photo = await Jimp.read(photoBuffer);
      photo.resize(300, Jimp.AUTO);
      page.image.composite(photo, pageWidth - 350, 300);
    }
    const qrCodeDataUrl = await QRCode.toDataURL(APP_DOWNLOAD_URL);
    const qrImage = await Jimp.read(Buffer.from(qrCodeDataUrl.split(",")[1], "base64"));
    qrImage.resize(250, 250);
    page.image.composite(qrImage, pageWidth - 350, 650);
    images.push(page.image);

    // --- Otras secciones (una hoja por categoría) ---
    const sections = [
      ["Historial Laboral", sueldos?.coincidences?.map(i => `${i.empresa} - S/.${i.sueldo} (${i.periodo})`)],
      ["Movimientos de Consumo", consumos?.coincidences?.map(i => `${i.razonSocial} - S/.${i.monto} (${i.fecha})`)],
      ["Movimientos Migratorios", movimientos?.coincidences?.map(i => `${i.fecmovimiento} - ${i.tipmovimiento} (${i.procedenciadestino})`)],
      ["Denuncias Policiales", denuncias?.coincidences?.map(i => `${i.general.comisaria} - ${i.general.tipo} (${i.general.fecha_hora_registro})`)],
      ["Licencia de Conducir", licencia?.coincidences?.map(i => `${i.claseCategoria} - ${i.estado} (${i.fecExpedicion} - ${i.fecVencimiento})`)],
      ["Familiares", [...(familia1?.coincidences||[]),...(familia2?.coincidences||[]),...(familia3?.coincidences||[])].map(i=>`${i.nombre} (${i.parentesco}) DNI: ${i.dni}`)],
      ["Telefonía", telefonia?.coincidences?.map(i => `${i.telefono} - ${i.operador} (${i.tipoLinea})`)],
      ["Correos Electrónicos", correos?.coincidences?.map(i => i.correo)],
      ["Direcciones Registradas", direcciones?.coincidences?.map(i => i.direccion)],
      ["Empresas Vinculadas", empresas?.coincidences?.map(i => `${i.razonSocial} - RUC: ${i.ruc}`)],
      ["Árbol Genealógico", arbol?.coincidences?.map(i => `${i.nombres} (${i.parentesco}) DNI: ${i.dni}`)],
      ["Matrimonios", matrimonios?.coincidences?.map(i => `${i.nombre_conyuge} (${i.dni_conyuge}) - ${i.fecha_matrimonio} en ${i.lugar_matrimonio}`)],
      ["Casos en Fiscalía", fiscalia?.coincidences?.map(i => `${i.caso} - Fiscalía: ${i.fiscalia}`)]
    ];

    for (const [title, lines] of sections) {
      if (lines && lines.length > 0) {
        let page = createPage(title);
        await addLines(page, lines);
        images.push(page.image);
      }
    }

    // --- Página final ---
    let finalPage = new Jimp(pageWidth, pageHeight, 0xffffffff);
    await printCenteredText(finalPage, fontSubtitle, "© Consulta PE 2025 - todos los derechos reservados.", pageHeight/2 - 40);
    await printCenteredText(finalPage, fontData, "La información mostrada proviene de fuentes públicas y externas.", pageHeight/2 + 20);
    await printCenteredText(finalPage, fontData, "Consulta PE no se responsabiliza por el mal uso de estos datos.", pageHeight/2 + 60);
    images.push(finalPage);

    // --- Convertir a PDF ---
    const pdfDoc = await PDFDocument.create();
    for (const img of images) {
      const imgBuffer = await img.getBufferAsync(Jimp.MIME_PNG);
      const png = await pdfDoc.embedPng(imgBuffer);
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfPath = path.join(PUBLIC_DIR, `${uuidv4()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    res.download(pdfPath, "Ficha_Consulta.pdf", () => fs.unlinkSync(pdfPath));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar el PDF", detalle: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
