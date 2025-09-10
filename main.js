const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb } = require("pdf-lib");
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
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

const generarMarcaDeAgua = async (imagen) => {
  const marcaAgua = new Jimp(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const text = "CONSULTA PE";
  for (let i = -imagen.bitmap.width; i < imagen.bitmap.width * 2; i += 250) {
    for (let j = -imagen.bitmap.height; j < imagen.bitmap.height * 2; j += 150) {
      const angle = 45;
      const textImage = new Jimp(300, 50, 0x00000000);
      textImage.print(fontWatermark, 0, 0, text);
      textImage.rotate(angle);
      marcaAgua.composite(textImage, i, j, {
        mode: Jimp.BLEND_SOURCE_OVER,
        opacitySource: 0.1,
        opacityDest: 1,
      });
    }
  }
  return marcaAgua;
};

// Esta función ahora también dibuja el fondo y el título de la tarjeta
const createCard = async (image, font, title, yPos, contentY, contentWidth) => {
  const cardX = 50;
  const cardWidth = image.bitmap.width - 100;
  const cardColor = 0xFFFFFFCC; // Blanco semi-transparente
  const titleFont = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

  // Dibuja un rectángulo para el fondo de la tarjeta
  const cardBackground = new Jimp(cardWidth, 50, cardColor);
  image.composite(cardBackground, cardX, yPos);

  // Dibuja el título de la tarjeta
  image.print(titleFont, cardX + 20, yPos + 10, title);

  return { y: yPos + 60, width: contentWidth };
};

const printWrappedText = async (image, font, x, y, maxWidth, text, lineHeight) => {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  
  if (Jimp.measureText(font, text) <= maxWidth) {
      image.print(font, x, currentY, text);
      return currentY + lineHeight;
  }

  for (const word of words) {
    const testLine = line.length === 0 ? word : line + " " + word;
    const testWidth = Jimp.measureText(font, testLine);
    if (testWidth > maxWidth) {
      image.print(font, x, currentY, line.trim());
      line = word + " ";
      currentY += lineHeight;
    } else {
      line = testLine + " ";
    }
  }
  image.print(font, x, currentY, line.trim());
  return currentY + lineHeight;
};

const checkAndAddPage = async (images, currentY) => {
    const pageHeight = 1920;
    const pageMargin = 100;

    if (currentY + pageMargin > pageHeight) {
        const newImage = new Jimp(1080, pageHeight, "#F0F4F8");
        const marcaAgua = await generarMarcaDeAgua(newImage);
        newImage.composite(marcaAgua, 0, 0);

        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
        const fontSubtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

        images.push({ image: newImage, y: 80 });
        return { newImage, fontTitle, fontSubtitle, fontData, newY: 80 };
    }
    return { newImage: images[images.length - 1].image, newY: currentY };
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
    let currentPage = {};
    let currentY = 0;

    const createInitialPage = async () => {
        const newImage = new Jimp(1080, 1920, "#F0F4F8");
        const marcaAgua = await generarMarcaDeAgua(newImage);
        newImage.composite(marcaAgua, 0, 0);
        const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
        const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);

        newImage.print(fontTitle, 0, 80, {
            text: "Ficha de Consulta Ciudadana",
            alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
        }, newImage.bitmap.width, newImage.bitmap.height);

        const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
        const mainIcon = await Jimp.read(iconBuffer);
        mainIcon.resize(150, Jimp.AUTO);
        newImage.composite(mainIcon, (newImage.bitmap.width - mainIcon.bitmap.width) / 2, 20);

        images.push({ image: newImage, y: 180 });
        currentPage.image = newImage;
        currentY = 180;
        return { fontData };
    };
    
    const { fontData } = await createInitialPage();

    // Sección RENIEC
    let cardReniec = await createCard(currentPage.image, fontData, "Datos Personales", currentY, 70, 880);
    currentY = cardReniec.y;

    if (reniecData) {
        const photoBuffer = Buffer.from(reniecData.imagenes.foto, 'base64');
        const photoImage = await Jimp.read(photoBuffer);
        photoImage.resize(150, Jimp.AUTO);
        currentPage.image.composite(photoImage, 800, 200);

        currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardReniec.width, `**Nombres:** ${reniecData.preNombres || "-"}`, 30);
        currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardReniec.width, `**Apellidos:** ${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}`, 30);
        currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardReniec.width, `**DNI:** ${reniecData.nuDni || "-"}`, 30);
        currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardReniec.width, `**Fecha de Nacimiento:** ${reniecData.feNacimiento || "-"}`, 30);
        currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardReniec.width, `**Dirección:** ${reniecData.desDireccion || "-"}, ${reniecData.distDireccion || "-"}`, 30);
    }
    currentY += 50;

    // Sección de Sueldos
    if (sueldosData?.coincidences?.length > 0) {
      ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
      let cardSueldos = await createCard(currentPage.image, fontData, "Historial Laboral", currentY, 70, 880);
      currentY = cardSueldos.y;
      for (const item of sueldosData.coincidences) {
        ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
        currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardSueldos.width, `**Empresa:** ${item.empresa || "-"} | **Sueldo:** S/.${item.sueldo || "-"} | **Periodo:** ${item.periodo || "-"}`, 30);
      }
    }
    currentY += 50;

    // Sección de Consumos
    if (consumosData?.coincidences?.length > 0) {
      ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
      let cardConsumos = await createCard(currentPage.image, fontData, "Movimientos de Consumo", currentY, 70, 880);
      currentY = cardConsumos.y;
      for (const item of consumosData.coincidences.slice(0, 10)) {
          ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
          currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardConsumos.width, `**Empresa:** ${item.razonSocial || "-"} | **Monto:** S/.${item.monto || "-"} | **Fecha:** ${item.fecha || "-"}`, 30);
      }
    }
    currentY += 50;
    
    // Sección de Movimientos Migratorios
    if (movimientosData?.coincidences?.length > 0) {
        ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
        let cardMovimientos = await createCard(currentPage.image, fontData, "Movimientos Migratorios", currentY, 70, 880);
        currentY = cardMovimientos.y;
        for (const item of movimientosData.coincidences.slice(0, 10)) {
            ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
            currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardMovimientos.width, `**Fecha:** ${item.fecmovimiento || "-"} | **Tipo:** ${item.tipmovimiento || "-"} | **Destino:** ${item.procedenciadestino || "-"}`, 30);
        }
    }
    currentY += 50;

    // Sección de Denuncias
    if (denunciasData?.coincidences?.length > 0) {
        ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
        let cardDenuncias = await createCard(currentPage.image, fontData, "Denuncias Policiales", currentY, 70, 880);
        currentY = cardDenuncias.y;
        for (const item of denunciasData.coincidences) {
            ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
            currentY = await printWrappedText(currentPage.image, fontData, 70, currentY, cardDenuncias.width, `**Comisaría:** ${item.general.comisaria || "-"} | **Tipo:** ${item.general.tipo || "-"} | **Fecha:** ${item.general.fecha_hora_registro || "-"}`, 30);
        }
    }
    currentY += 50;

    // Generar código QR y agregarlo al PDF
    ({ newImage: currentPage.image, newY: currentY } = await checkAndAddPage(images, currentY));
    const qrCodeDataUrl = await QRCode.toDataURL(APP_DOWNLOAD_URL);
    const qrImage = await Jimp.read(Buffer.from(qrCodeDataUrl.split(",")[1], 'base64'));
    qrImage.resize(300, 300);
    currentPage.image.composite(qrImage, (currentPage.image.bitmap.width - qrImage.bitmap.width) / 2, currentY);
    currentY += 320;

    currentPage.image.print(await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK), 0, currentY, {
        text: "Escanea para descargar la app",
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, currentPage.image.bitmap.width, currentPage.image.bitmap.height);

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
