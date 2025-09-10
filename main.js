const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib"); // PDF

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";

const API_URLS = {
    reniec: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec?dni=${dni}`,
    denuncias: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/denuncias-dni?dni=${dni}`,
    sueldos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/sueldos?dni=${dni}`,
    trabajos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/trabajos?dni=${dni}`,
    consumos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/consumos?dni=${dni}`,
    arbol: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/arbol?dni=${dni}`,
    familia1: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/familia1?dni=${dni}`,
    familia2: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/familia2?dni=${dni}`,
    familia3: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/familia3?dni=${dni}`,
    movimientos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/movimientos?dni=${dni}`,
    matrimonios: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/matrimonios?dni=${dni}`,
    empresas: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/empresas?dni=${dni}`,
    direcciones: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/direcciones?dni=${dni}`,
    correos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/correos?dni=${dni}`,
    telefonia: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/telefonia-doc?documento=${dni}`,
    vehiculos: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/vehiculos?dni=${dni}`,
    fiscalia: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/fiscalia-dni?dni=${dni}`,
    licencia: (dni) => `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/licencia?dni=${dni}`,
};

// Marca de agua
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
                opacityDest: 1
            });
        }
    }
    return marcaAgua;
};

// Texto envuelto
const printWrappedText = (image, font, x, y, maxWidth, text, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    let currentY = y;
    for (const word of words) {
        const testLine = line.length === 0 ? word : line + ' ' + word;
        const testWidth = Jimp.measureText(font, testLine);
        if (testWidth > maxWidth) {
            image.print(font, x, currentY, line.trim());
            line = word + ' ';
            currentY += lineHeight;
        } else {
            line = testLine + ' ';
        }
    }
    image.print(font, x, currentY, line.trim());
    return currentY + lineHeight;
};

// Endpoint principal
app.get("/generar-ficha-pdf", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try {
        const allData = await Promise.all(
            Object.values(API_URLS).map(async (urlFunc) => {
                try {
                    const response = await axios.get(urlFunc(dni));
                    return response.data?.result || response.data;
                } catch (error) {
                    return null;
                }
            })
        );

        const [
            reniecData, denunciasData, sueldosData, trabajosData, consumosData,
            arbolData, familia1Data, familia2Data, familia3Data, movimientosData,
            matrimoniosData, empresasData, direccionesData, correosData, telefoniaData,
            vehiculosData, fiscaliaData, licenciaData
        ] = allData;

        if (!reniecData) return res.status(404).json({ error: "No se encontró información de RENIEC para el DNI ingresado." });

        // Crear página
        const images = [];
        const createNewPage = async () => {
            const newImage = new Jimp(1080, 1920, "#003366");
            const marcaAgua = await generarMarcaDeAgua(newImage);
            newImage.composite(marcaAgua, 0, 0);

            const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
            const mainIcon = await Jimp.read(iconBuffer);
            mainIcon.resize(300, Jimp.AUTO);
            const iconX = (newImage.bitmap.width - mainIcon.bitmap.width) / 2;
            newImage.composite(mainIcon, iconX, 50);

            const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
            newImage.print(fontTitle, 0, 200, {
                text: "Ficha de Consulta Ciudadana",
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_TOP
            }, newImage.bitmap.width, newImage.bitmap.height);

            images.push({ image: newImage, y: 300 });
        };
        await createNewPage();

        const currentPage = images[0];
        const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        const printField = async (label, value) => {
            currentPage.image.print(fontData, 50, currentPage.y, `${label}: ${value || "-"}`);
            currentPage.y += 30;
        };

        await printField("Nombres", reniecData.preNombres || "-");
        await printField("Apellidos", `${reniecData.apePaterno || ""} ${reniecData.apeMaterno || ""}`);
        await printField("Fecha de Nacimiento", reniecData.feNacimiento || "-");

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

        res.download(pdfPath, "Ficha_Consulta_PE.pdf");

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al generar el PDF", detalle: error.message });
    }
});

// Carpeta pública
app.use("/public", express.static(PUBLIC_DIR));

// CORRECCIÓN CLAVE: escuchar en 0.0.0.0 para Fly.io
app.listen(PORT, '0.0.0.0', () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
