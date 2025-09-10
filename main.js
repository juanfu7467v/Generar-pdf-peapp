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

const printWrappedText = async (image, font, x, y, maxWidth, text, lineHeight) => {
  const words = text.split(" ");
  let line = "";
  let currentY = y;
  for (const word of words) {
    const testLine = line.length === 0 ? word : line + " " + word;
    const testWidth = Jimp.measureText(font, testLine);
    if (testWidth > maxWidth) {
      await image.print(font, x, currentY, line.trim());
      line = word + " ";
      currentY += lineHeight;
    } else {
      line = testLine + " ";
    }
  }
  await image.print(font, x, currentY, line.trim());
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
    const createNewPage = async (pageNumber) => {
      const newImage = new Jimp(1080, 1920, 0xFFFFFFFF); // Fondo blanco
      images.push({ image: newImage, y: 150 });
      return newImage;
    };

    let newImage = await createNewPage(1);
    let currentY = 150;
    const pageMargin = 50;

    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontSubtitle = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
    const boldFontData = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK); // Jimp no tiene estilos, se usa la misma fuente para negrita simulada

    const writeSection = async (title, data) => {
      if (data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)) {
        if (currentY + 200 > newImage.bitmap.height - pageMargin) {
          newImage = await createNewPage(images.length + 1);
          currentY = 150;
        }
        currentY = await printWrappedText(newImage, fontSubtitle, pageMargin, currentY, newImage.bitmap.width - 2 * pageMargin, title, 40);
        currentY += 10;
        return true;
      }
      return false;
    };

    const writeDataLine = async (label, value) => {
        const fullText = `${label}: ${value}`;
        const finalY = await printWrappedText(newImage, fontData, pageMargin, currentY, newImage.bitmap.width - 2 * pageMargin, fullText, 30);
        currentY = finalY;
        return finalY;
    };

    // Título de la ficha
    newImage.print(fontTitle, 0, 80, {
      text: "Ficha de Consulta Ciudadana",
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
    }, newImage.bitmap.width, newImage.bitmap.height);

    // Sección de Datos Personales (RENIEC)
    if (reniecData) {
        if (await writeSection("Datos Personales", reniecData)) {
            const photoBuffer = Buffer.from(reniecData.imagenes.foto, 'base64');
            const photoImage = await Jimp.read(photoBuffer);
            photoImage.resize(200, Jimp.AUTO);
            newImage.composite(photoImage, newImage.bitmap.width - 200 - pageMargin, 150);

            await writeDataLine("**Nombres**", reniecData.preNombres || "-");
            await writeDataLine("**Apellidos**", `${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}`);
            await writeDataLine("**DNI**", reniecData.nuDni || "-");
            await writeDataLine("**Fecha de Nacimiento**", reniecData.feNacimiento || "-");
            await writeDataLine("**Dirección**", `${reniecData.desDireccion || "-"}, ${reniecData.distDireccion || "-"}`);
            currentY += 20;
        }
    }

    // Sección de Historial Laboral (Sueldos)
    if (sueldosData?.coincidences?.length > 0) {
      if (await writeSection("Historial Laboral", sueldosData.coincidences)) {
        for (const item of sueldosData.coincidences) {
            await writeDataLine("**Empresa**", item.empresa || "-");
            await writeDataLine("**Sueldo**", `S/.${item.sueldo || "-"}`);
            await writeDataLine("**Periodo**", item.periodo || "-");
            currentY += 15;
        }
        currentY += 20;
      }
    }

    // Sección de Movimientos de Consumo
    if (consumosData?.coincidences?.length > 0) {
        if (await writeSection("Movimientos de Consumo", consumosData.coincidences)) {
            for (const item of consumosData.coincidences.slice(0, 10)) {
                await writeDataLine("**Empresa**", item.razonSocial || "-");
                await writeDataLine("**Monto**", `S/.${item.monto || "-"}`);
                await writeDataLine("**Fecha**", item.fecha || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Movimientos Migratorios
    if (movimientosData?.coincidences?.length > 0) {
        if (await writeSection("Movimientos Migratorios", movimientosData.coincidences)) {
            for (const item of movimientosData.coincidences.slice(0, 10)) {
                await writeDataLine("**Fecha**", item.fecmovimiento || "-");
                await writeDataLine("**Tipo**", item.tipmovimiento || "-");
                await writeDataLine("**Destino**", item.procedenciadestino || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Denuncias Policiales
    if (denunciasData?.coincidences?.length > 0) {
        if (await writeSection("Denuncias Policiales", denunciasData.coincidences)) {
            for (const item of denunciasData.coincidences) {
                await writeDataLine("**Comisaría**", item.general.comisaria || "-");
                await writeDataLine("**Tipo**", item.general.tipo || "-");
                await writeDataLine("**Fecha**", item.general.fecha_hora_registro || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Licencia de Conducir
    if (licenciaData?.coincidences?.length > 0) {
      if (await writeSection("Licencia de Conducir", licenciaData.coincidences)) {
        for (const item of licenciaData.coincidences) {
            await writeDataLine("**Tipo**", item.claseCategoria || "-");
            await writeDataLine("**Estado**", item.estado || "-");
            await writeDataLine("**Fecha de Expedición**", item.fecExpedicion || "-");
            await writeDataLine("**Vencimiento**", item.fecVencimiento || "-");
            currentY += 15;
        }
        currentY += 20;
      }
    }
    
    // Sección de Familiares
    const familiares = [familia1Data, familia2Data, familia3Data].filter(f => f?.coincidences?.length > 0).flatMap(f => f.coincidences);
    if (familiares.length > 0) {
      if (await writeSection("Familiares", familiares)) {
        for (const item of familiares) {
          await writeDataLine("**Nombre**", item.nombre || "-");
          await writeDataLine("**DNI**", item.dni || "-");
          await writeDataLine("**Parentesco**", item.parentesco || "-");
          currentY += 15;
        }
        currentY += 20;
      }
    }
    
    // Sección de Telefonía
    if (telefoniaData?.coincidences?.length > 0) {
        if (await writeSection("Telefonía", telefoniaData.coincidences)) {
            for (const item of telefoniaData.coincidences) {
                await writeDataLine("**Teléfono**", item.telefono || "-");
                await writeDataLine("**Operador**", item.operador || "-");
                await writeDataLine("**Tipo de Línea**", item.tipoLinea || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Correos Electrónicos
    if (correosData?.coincidences?.length > 0) {
        if (await writeSection("Correos Electrónicos", correosData.coincidences)) {
            for (const item of correosData.coincidences) {
                await writeDataLine("**Correo**", item.correo || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Direcciones
    if (direccionesData?.coincidences?.length > 0) {
        if (await writeSection("Direcciones Registradas", direccionesData.coincidences)) {
            for (const item of direccionesData.coincidences) {
                await writeDataLine("**Dirección**", item.direccion || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Empresas
    if (empresasData?.coincidences?.length > 0) {
        if (await writeSection("Empresas Vinculadas", empresasData.coincidences)) {
            for (const item of empresasData.coincidences) {
                await writeDataLine("**Razón Social**", item.razonSocial || "-");
                await writeDataLine("**RUC**", item.ruc || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }
    
    // Sección de Arbol Genealógico
    if (arbolData?.coincidences?.length > 0) {
        if (await writeSection("Árbol Genealógico", arbolData.coincidences)) {
            for (const item of arbolData.coincidences) {
                await writeDataLine("**Nombre**", item.nombres || "-");
                await writeDataLine("**Parentesco**", item.parentesco || "-");
                await writeDataLine("**DNI**", item.dni || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }

    // Sección de Matrimonios
    if (matrimoniosData?.coincidences?.length > 0) {
        if (await writeSection("Matrimonios", matrimoniosData.coincidences)) {
            for (const item of matrimoniosData.coincidences) {
                await writeDataLine("**Cónyuge**", item.nombre_conyuge || "-");
                await writeDataLine("**DNI del Cónyuge**", item.dni_conyuge || "-");
                await writeDataLine("**Fecha de Matrimonio**", item.fecha_matrimonio || "-");
                await writeDataLine("**Lugar**", item.lugar_matrimonio || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }
    
    // Sección de Fiscalia
    if (fiscaliaData?.coincidences?.length > 0) {
        if (await writeSection("Casos en Fiscalía", fiscaliaData.coincidences)) {
            for (const item of fiscaliaData.coincidences) {
                await writeDataLine("**Caso**", item.caso || "-");
                await writeDataLine("**Fiscalía**", item.fiscalia || "-");
                currentY += 15;
            }
            currentY += 20;
        }
    }
    
    // Generar código QR en una nueva página si es necesario
    if (currentY + 400 > newImage.bitmap.height - pageMargin) {
      newImage = await createNewPage(images.length + 1);
      currentY = 150;
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

    res.download(pdfPath, "Ficha_Consulta.pdf", (err) => {
        if (err) {
            console.error("Error al enviar el archivo:", err);
            res.status(500).send("Error al descargar el archivo.");
        }
        fs.unlinkSync(pdfPath);
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al generar el PDF", detalle: error.message });
  }
});

app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`));

