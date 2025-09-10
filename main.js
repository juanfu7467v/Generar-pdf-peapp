const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_DOWNLOAD_URL = "https://www.socialcreator.com/consultapeapk#apps";
const CHECKMARK_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_check_icon.png"; // Un ícono de check para los nodos

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

// Cargar fuentes una sola vez
const fonts = {};
const loadFonts = async () => {
  fonts.title = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  fonts.subtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  fonts.header = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  fonts.data = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
  fonts.watermark = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
};
loadFonts(); // Llama a la función al inicio

const generarMarcaDeAgua = async (imagen) => {
  const marcaAgua = new Jimp(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const text = "CONSULTA PE";
  const angle = -45; // Ángulo de la marca de agua

  const textImage = new Jimp(200, 50, 0x00000000);
  textImage.print(fonts.watermark, 0, 0, text);
  textImage.rotate(angle);

  const tileWidth = textImage.bitmap.width + 150;
  const tileHeight = textImage.bitmap.height + 150;

  for (let i = -imagen.bitmap.width; i < imagen.bitmap.width * 2; i += tileWidth) {
    for (let j = -imagen.bitmap.height; j < imagen.bitmap.height * 2; j += tileHeight) {
      marcaAgua.composite(textImage, i, j, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.1,
      });
    }
  }
  return marcaAgua;
};

// Función para dibujar una "tarjeta" tipo nodo de mapa conceptual
const drawNode = async (image, title, content, yPos) => {
  const padding = 30;
  const cardWidth = image.bitmap.width - 200;
  let textY = yPos + padding + 40; // Espacio para el título

  // Calcular la altura necesaria para el texto
  let textHeight = 0;
  const lines = content.split('\n');
  for (const line of lines) {
    textHeight += Jimp.measureText(fonts.data, line) / Jimp.measureText(fonts.data, 'a') * 20; // Aproximación
  }
  const cardHeight = textHeight + padding * 2 + 50;
  const cardX = 100;

  // Dibuja el fondo de la tarjeta con esquinas redondeadas (simulado)
  const cardBackground = new Jimp(cardWidth, cardHeight, 0xFFFFFFFF);
  cardBackground.opacity(0.9);
  image.composite(cardBackground, cardX, yPos);

  // Dibuja la línea de conexión
  image.scan(cardX + cardWidth / 2, yPos, 10, yPos - 50, (x, y, idx) => {
      image.bitmap.data[idx] = 52;
      image.bitmap.data[idx + 1] = 152;
      image.bitmap.data[idx + 2] = 219;
      image.bitmap.data[idx + 3] = 255;
  });

  // Dibuja el ícono del título
  const iconBuffer = (await axios({ url: CHECKMARK_ICON_URL, responseType: 'arraybuffer' })).data;
  const icon = await Jimp.read(iconBuffer);
  icon.resize(40, Jimp.AUTO);
  image.composite(icon, cardX + padding, yPos + padding);

  // Dibuja el título de la tarjeta
  image.print(fonts.subtitle, cardX + padding + 60, yPos + padding, title);

  // Dibuja el contenido
  image.print(fonts.data, cardX + padding, textY, {
    text: content,
    alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
  }, cardWidth - padding * 2, cardHeight - padding * 2 - 50);

  return yPos + cardHeight + 50;
};

// Crea una nueva página con el diseño base
const createNewPage = async (images, isFirstPage = false) => {
  const newImage = new Jimp(1080, 1920, 0xF0F4F8FF); // Fondo de color suave
  const marcaAgua = await generarMarcaDeAgua(newImage);
  newImage.composite(marcaAgua, 0, 0);

  if (isFirstPage) {
    const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
    const mainIcon = await Jimp.read(iconBuffer);
    mainIcon.resize(150, Jimp.AUTO);
    newImage.composite(mainIcon, (newImage.bitmap.width - mainIcon.bitmap.width) / 2, 50);
    newImage.print(fonts.title, 0, 220, {
      text: "Ficha de Consulta Ciudadana",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, newImage.bitmap.width, newImage.bitmap.height);
  }

  images.push({ image: newImage });
  return newImage;
};

app.get("/generar-ficha-pdf", async (req, res) => {
  const { dni } = req.query;
  if (!dni) {
    return res.status(400).json({ error: "Falta el parámetro DNI" });
  }

  try {
    const apiCalls = Object.values(API_URLS).map(async (urlFunc) => {
      try {
        const response = await axios.get(urlFunc(dni));
        return response.data?.result || response.data;
      } catch (error) {
        return null;
      }
    });

    const [
      reniecData, sueldosData, consumosData, matrimoniosData, empresasData,
      fiscaliaData, licenciaData, familia3Data, arbolData, familia1Data,
      denunciasData, trabajosData, movimientosData, familia2Data, direccionesData,
      correosData, telefoniaData,
    ] = await Promise.all(apiCalls);

    if (!reniecData) {
      return res.status(404).json({ error: "No se encontró información de RENIEC para el DNI ingresado." });
    }

    const images = [];
    let currentPage = await createNewPage(images, true);
    let currentY = 320;

    // Sección RENIEC (Nodo principal)
    const reniecContent = `Nombres: ${reniecData.preNombres || "-"}\nApellidos: ${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}\nDNI: ${reniecData.nuDni || "-"}\nFecha de Nacimiento: ${reniecData.feNacimiento || "-"}\nDirección: ${reniecData.desDireccion || "-"}, ${reniecData.distDireccion || "-"}`;
    currentY = await drawNode(currentPage, "Datos Personales", reniecContent, currentY);

    if (reniecData.imagenes.foto) {
        const photoBuffer = Buffer.from(reniecData.imagenes.foto, 'base64');
        const photoImage = await Jimp.read(photoBuffer);
        photoImage.resize(120, Jimp.AUTO);
        currentPage.composite(photoImage, 850, 350);
    }

    // Secciones secundarias
    const sections = [
        { title: "Historial Laboral", data: sueldosData, formatter: (item) => `Empresa: ${item.empresa || "-"} | Sueldo: S/.${item.sueldo || "-"} | Periodo: ${item.periodo || "-"}` },
        { title: "Movimientos de Consumo", data: consumosData, formatter: (item) => `Empresa: ${item.razonSocial || "-"} | Monto: S/.${item.monto || "-"} | Fecha: ${item.fecha || "-"}`, limit: 10 },
        { title: "Movimientos Migratorios", data: movimientosData, formatter: (item) => `Fecha: ${item.fecmovimiento || "-"} | Tipo: ${item.tipmovimiento || "-"} | Destino: ${item.procedenciadestino || "-"}`, limit: 10 },
        { title: "Denuncias Policiales", data: denunciasData, formatter: (item) => `Comisaría: ${item.general.comisaria || "-"} | Tipo: ${item.general.tipo || "-"} | Fecha: ${item.general.fecha_hora_registro || "-"}` },
    ];

    for (const section of sections) {
        if (section.data?.coincidences?.length > 0) {
            const content = (section.limit ? section.data.coincidences.slice(0, section.limit) : section.data.coincidences).map(section.formatter).join('\n');
            const requiredHeight = Jimp.measureText(fonts.data, content) + 200; // Altura aproximada del nodo
            if (currentY + requiredHeight > currentPage.bitmap.height - 100) {
                currentPage = await createNewPage(images);
                currentY = 80;
            }
            currentY = await drawNode(currentPage, section.title, content, currentY);
        }
    }

    // Agregar QR al final
    const qrText = "Escanea para descargar la app";
    const qrHeight = Jimp.measureText(fonts.data, qrText) + 300;
    if (currentY + qrHeight > currentPage.bitmap.height - 50) {
        currentPage = await createNewPage(images);
        currentY = 80;
    }
    
    const qrCodeDataUrl = await QRCode.toDataURL(APP_DOWNLOAD_URL);
    const qrImage = await Jimp.read(Buffer.from(qrCodeDataUrl.split(",")[1], 'base64'));
    qrImage.resize(250, 250);
    currentPage.composite(qrImage, (currentPage.bitmap.width - qrImage.bitmap.width) / 2, currentY);
    currentY += 270;
    currentPage.print(fonts.data, 0, currentY, {
        text: qrText,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, currentPage.bitmap.width, currentPage.bitmap.height);


    // Convertir a PDF
    const pdfDoc = await PDFDocument.create();
    for (const pageObj of images) {
        const imgBuffer = await pageObj.image.getBufferAsync(Jimp.MIME_PNG);
        const pngImage = await pdfDoc.embedPng(imgBuffer);
        const page = pdfDoc.addPage([1080, 1920]);
        page.drawImage(pngImage, { x: 0, y: 0, width: 1080, height: 1920 });
    }

    const pdfBytes = await pdfDoc.save();
    const pdfPath = path.join(PUBLIC_DIR, `${uuidv4()}.pdf`);
    fs.writeFileSync(pdfPath, pdfBytes);

    res.download(pdfPath, "Ficha_Consulta_PE.pdf", (err) => {
        if (err) {
            console.error("Error al enviar el archivo:", err);
            res.status(500).send("Error al descargar el archivo.");
        }
        // fs.unlinkSync(pdfPath);
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al generar el PDF", detalle: error.message });
  }
});

app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
