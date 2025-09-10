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

const printWrappedText = (image, font, x, y, maxWidth, text, lineHeight) => {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
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
    const createNewPage = async () => {
      const newImage = new Jimp(1080, 1920, "#F0F4F8");
      const marcaAgua = await generarMarcaDeAgua(newImage);
      newImage.composite(marcaAgua, 0, 0);

      const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
      const fontSubtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
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
      return { newImage, fontTitle, fontSubtitle, fontData };
    };

    let { newImage, fontTitle, fontSubtitle, fontData } = await createNewPage();
    let currentPage = images[0];

    const createCard = async (title, yPos) => {
      const cardHeight = 200; // Altura inicial de la tarjeta
      const card = new Jimp(newImage.bitmap.width - 100, cardHeight, 0xFFFFFFFF);
      card.opacity(0.85);

      await new Jimp(1, 1, { r: 52, g: 152, b: 219, a: 1 }).then(blueDot => {
        card.composite(blueDot.resize(20, 20), 20, 20);
      });
      card.print(await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK), 50, 20, title);

      newImage.composite(card, 50, yPos);
      return { y: yPos + 70, width: newImage.bitmap.width - 200 };
    };

    let currentY = 180;

    // Sección RENIEC
    let cardReniec = await createCard("Datos Personales", currentY);
    currentY = cardReniec.y;

    if (reniecData) {
        const photoBuffer = Buffer.from(reniecData.imagenes.foto, 'base64');
        const photoImage = await Jimp.read(photoBuffer);
        photoImage.resize(150, Jimp.AUTO);
        newImage.composite(photoImage, 800, 200);

        currentY = await printWrappedText(newImage, fontData, 70, currentY, cardReniec.width, `**Nombres:** ${reniecData.preNombres || "-"}`, 30);
        currentY = await printWrappedText(newImage, fontData, 70, currentY, cardReniec.width, `**Apellidos:** ${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}`, 30);
        currentY = await printWrappedText(newImage, fontData, 70, currentY, cardReniec.width, `**DNI:** ${reniecData.nuDni || "-"}`, 30);
        currentY = await printWrappedText(newImage, fontData, 70, currentY, cardReniec.width, `**Fecha de Nacimiento:** ${reniecData.feNacimiento || "-"}`, 30);
        currentY = await printWrappedText(newImage, fontData, 70, currentY, cardReniec.width, `**Dirección:** ${reniecData.desDireccion || "-"}, ${reniecData.distDireccion || "-"}`, 30);
    }
    
    currentY += 50;

    // Sección de Sueldos
    if (sueldosData?.coincidences?.length > 0) {
      let cardSueldos = await createCard("Historial Laboral", currentY);
      currentY = cardSueldos.y;
      sueldosData.coincidences.forEach(item => {
        currentY = printWrappedText(newImage, fontData, 70, currentY, cardSueldos.width, `**Empresa:** ${item.empresa || "-"} | **Sueldo:** S/.${item.sueldo || "-"} | **Periodo:** ${item.periodo || "-"}`, 30);
      });
    }

    currentY += 50;

    // Sección de Consumos
    if (consumosData?.coincidences?.length > 0) {
      if (currentY + 300 > newImage.bitmap.height) {
        ({ newImage, fontTitle, fontSubtitle, fontData } = await createNewPage());
        currentY = 180;
      }
      let cardConsumos = await createCard("Movimientos de Consumo", currentY);
      currentY = cardConsumos.y;
      consumosData.coincidences.slice(0, 10).forEach(item => { // Limitar a 10 para no saturar
        currentY = printWrappedText(newImage, fontData, 70, currentY, cardConsumos.width, `**Empresa:** ${item.razonSocial || "-"} | **Monto:** S/.${item.monto || "-"} | **Fecha:** ${item.fecha || "-"}`, 30);
      });
    }

    currentY += 50;
    
    // Sección de Movimientos Migratorios
    if (movimientosData?.coincidences?.length > 0) {
        if (currentY + 300 > newImage.bitmap.height) {
            ({ newImage, fontTitle, fontSubtitle, fontData } = await createNewPage());
            currentY = 180;
        }
        let cardMovimientos = await createCard("Movimientos Migratorios", currentY);
        currentY = cardMovimientos.y;
        movimientosData.coincidences.slice(0, 10).forEach(item => {
            currentY = printWrappedText(newImage, fontData, 70, currentY, cardMovimientos.width, `**Fecha:** ${item.fecmovimiento || "-"} | **Tipo:** ${item.tipmovimiento || "-"} | **Destino:** ${item.procedenciadestino || "-"}`, 30);
        });
    }

    currentY += 50;

    // Sección de Denuncias
    if (denunciasData?.coincidences?.length > 0) {
        if (currentY + 300 > newImage.bitmap.height) {
            ({ newImage, fontTitle, fontSubtitle, fontData } = await createNewPage());
            currentY = 180;
        }
        let cardDenuncias = await createCard("Denuncias Policiales", currentY);
        currentY = cardDenuncias.y;
        denunciasData.coincidences.forEach(item => {
            currentY = printWrappedText(newImage, fontData, 70, currentY, cardDenuncias.width, `**Comisaría:** ${item.general.comisaria || "-"} | **Tipo:** ${item.general.tipo || "-"} | **Fecha:** ${item.general.fecha_hora_registro || "-"}`, 30);
        });
    }

    currentY += 50;
    
    // Generar código QR y agregarlo al PDF
    if (currentY + 200 > newImage.bitmap.height) {
      ({ newImage, fontTitle, fontSubtitle, fontData } = await createNewPage());
      currentY = 180;
    }

    const qrCodeDataUrl = await QRCode.toDataURL(APP_DOWNLOAD_URL);
    const qrImage = await Jimp.read(Buffer.from(qrCodeDataUrl.split(",")[1], 'base64'));
    qrImage.resize(300, 300);
    newImage.composite(qrImage, (newImage.bitmap.width - qrImage.bitmap.width) / 2, currentY);
    currentY += 320;

    newImage.print(await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK), 0, currentY, {
      text: "Escanea para descargar la app",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, newImage.bitmap.width, newImage.bitmap.height);


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

