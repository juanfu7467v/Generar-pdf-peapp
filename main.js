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

const fonts = {};

const loadFonts = async () => {
    fonts.title = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    fonts.subtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    fonts.header = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    fonts.data = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    fonts.watermark = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    fonts.tableHeader = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    fonts.tableData = await Jimp.loadFont(Jimp.FONT_SANS_14_BLACK);
};

const generarMarcaDeAgua = async (imagen) => {
  const marcaAgua = new Jimp(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const text = "CONSULTA PE";
  const angle = -45;

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

const drawNode = async (image, title, content, yPos) => {
  const padding = 30;
  const cardWidth = image.bitmap.width - 200;
  let textY = yPos + padding + 40;
  let textHeight = Jimp.measureText(fonts.data, content, cardWidth - padding * 2);
  const cardHeight = textHeight + padding * 2 + 50;
  const cardX = 100;

  const cardBackground = new Jimp(cardWidth, cardHeight, 0xFFFFFFFF);
  cardBackground.opacity(0.9);
  image.composite(cardBackground, cardX, yPos);

  const iconBuffer = (await axios({ url: "https://www.socialcreator.com/srv/imgs/gen/79554_check_icon.png", responseType: 'arraybuffer' })).data;
  const icon = await Jimp.read(iconBuffer);
  icon.resize(40, Jimp.AUTO);
  image.composite(icon, cardX + padding, yPos + padding);
  image.print(fonts.subtitle, cardX + padding + 60, yPos + padding, title);
  image.print(fonts.data, cardX + padding, textY, {
    text: content,
    alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
  }, cardWidth - padding * 2, cardHeight - padding * 2 - 50);

  return yPos + cardHeight + 50;
};

const drawTable = async (image, title, headers, data, yPos, colWidths, totalTableWidth) => {
    const padding = 20;
    const cardWidth = image.bitmap.width - 200;
    const cardX = 100;
    let currentY = yPos;

    const titleHeight = Jimp.measureTextHeight(fonts.subtitle, title, cardWidth);
    image.print(fonts.subtitle, cardX + padding, currentY + padding, title);
    currentY += titleHeight + padding;

    let headerY = currentY;
    let headerX = cardX + padding;
    headers.forEach((header, i) => {
        image.print(fonts.tableHeader, headerX, headerY, header, colWidths[i]);
        headerX += colWidths[i];
    });
    currentY += Jimp.measureTextHeight(fonts.tableHeader, 'A', colWidths[0]) + 10;
    image.drawLine(new Jimp(totalTableWidth, 2, 0x000000FF), cardX + padding, currentY, cardX + padding + totalTableWidth, currentY);
    currentY += 5;

    data.forEach(row => {
        let rowX = cardX + padding;
        row.forEach((cell, i) => {
            image.print(fonts.tableData, rowX, currentY, cell, colWidths[i]);
            rowX += colWidths[i];
        });
        currentY += Jimp.measureTextHeight(fonts.tableData, 'A', colWidths[0]) + 5;
    });

    return currentY + padding;
};

const createNewPage = async (images, isFirstPage = false) => {
  const newImage = new Jimp(1080, 1920, 0xF0F4F8FF);
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

// Se agregó una función asíncrona para iniciar el servidor
const startServer = async () => {
    try {
        console.log("Cargando fuentes...");
        await loadFonts();
        console.log("Fuentes cargadas con éxito.");

        app.get("/", (req, res) => {
            res.send("¡El servidor está funcionando! Usa la ruta /generar-ficha-pdf?dni=... para generar un PDF.");
        });

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

            const reniecContent = `Nombre: ${reniecData.preNombres || "-"}\nApellidos: ${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}\nDNI: ${reniecData.nuDni || "-"}\nNacimiento: ${reniecData.feNacimiento || "-"}\nEstado Civil: ${reniecData.estadoCivil || "-"}\nDirección: ${reniecData.desDireccion || "-"}, ${reniecData.distDireccion || "-"}, ${reniecData.provDireccion || "-"}, ${reniecData.depaDireccion || "-"}\nPadre: ${reniecData.nomPadre || "-"}\nMadre: ${reniecData.nomMadre || "-"}\nFecha de emisión: ${reniecData.feEmision || "-"}\nFecha de caducidad: ${reniecData.feCaducidad || "-"}`;
            currentY = await drawNode(currentPage, "Datos Personales", reniecContent, currentY);

            if (reniecData.imagenes.foto) {
                const photoBuffer = Buffer.from(reniecData.imagenes.foto, 'base64');
                const photoImage = await Jimp.read(photoBuffer);
                photoImage.resize(120, Jimp.AUTO);
                currentPage.composite(photoImage, 850, 350);
            }
            
            const sections = [
                { title: "Información de Telefonía", data: telefoniaData?.coincidences, headers: ["Número", "Compañía", "Plan"], format: (item) => [item.telefono || '-', item.fuente || '-', item.plan || '-'] },
                { title: "Correos Electrónicos", data: correosData?.coincidences, headers: ["Correo", "Fuente"], format: (item) => [item.correo || '-', item.fuente || '-'] },
                { title: "Empresas y Cargos", data: empresasData?.coincidences, headers: ["RUC", "Empresa", "Cargo"], format: (item) => [item.ruc || '-', item.razon_social || '-', item.cargo || '-'] },
                { title: "Historial Laboral", data: sueldosData?.coincidences, headers: ["Empresa", "Sueldo (S/)", "Periodo"], format: (item) => [item.empresa || '-', item.sueldo || '-', item.periodo || '-'] },
                { title: "Movimientos Migratorios", data: movimientosData?.coincidences, headers: ["Fecha", "Tipo", "Destino"], format: (item) => [item.fecmovimiento || '-', item.tipmovimiento || '-', item.procedenciadestino || '-'] },
                { title: "Historial de Consumo", data: consumosData?.coincidences, headers: ["Empresa", "Monto (S/)", "Fecha"], format: (item) => [item.razonSocial || '-', item.monto || '-', item.fecha || '-'] },
                { title: "Familiares", data: arbolData?.coincidences, headers: ["Nombre Completo", "Parentesco"], format: (item) => [`${item.nom || ''} ${item.ap || ''} ${item.am || ''}`, item.tipo || '-'] },
                { title: "Denuncias", data: denunciasData?.coincidences, headers: ["Comisaría", "Tipo", "Fecha"], format: (item) => [item.general.comisaria || '-', item.general.tipo || '-', item.general.fecha_hora_registro || '-'] },
            ];
            
            for (const section of sections) {
                if (section.data?.length > 0) {
                    const tableData = section.data.map(section.format);
                    const totalWidth = currentPage.bitmap.width - 200;
                    const colWidths = [totalWidth * 0.4, totalWidth * 0.3, totalWidth * 0.3];
                    const requiredHeight = (tableData.length * 20) + 150;
                    
                    if (currentY + requiredHeight > currentPage.bitmap.height - 100) {
                        currentPage = await createNewPage(images);
                        currentY = 80;
                    }
                    
                    const tableRows = tableData.slice(0, 15);
                    currentY = await drawTable(currentPage, section.title, section.headers, tableRows, currentY, colWidths, totalWidth);
                }
            }

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

            res.download(pdfPath, `Ficha_Consulta_PE_${dni}.pdf`, (err) => {
                if (err) {
                    console.error("Error al enviar el archivo:", err);
                    res.status(500).send("Error al descargar el archivo.");
                }
            });

          } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Error al generar el PDF", detalle: error.message });
          }
        });

        app.use("/public", express.static(PUBLIC_DIR));

        app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`));

    } catch (error) {
        console.error("Error fatal al iniciar la aplicación:", error);
        process.exit(1);
    }
};

startServer();
