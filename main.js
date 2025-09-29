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

// API Principal (Asumiendo que este endpoint devuelve TODOS los datos)
const SEEKER_API_URL = (dni) => `https://web-production-75681.up.railway.app/seeker?dni=${dni}`;

/**
 * Función auxiliar para extraer datos estructurados del campo 'message'
 * del JSON de la API SEEKER.
 * @param {string} message - El campo 'message' de la respuesta JSON.
 * @returns {object} Un objeto con datos estructurados para el PDF.
 */
const parseSeekerMessage = (message) => {
    const data = {};
    const sections = message.split(/---\n\[\d\/\d\]\n\n|---\nSe encontro \d+ resultados\.\n\n/);

    // --- Extracción de Datos Personales y Dirección (Primer Bloque) ---
    const reniecBlock = sections[0];
    if (reniecBlock) {
        data.reniec = {};
        const reniecLines = reniecBlock.split('\n').filter(line => line.trim() && !line.includes('[1/3]') && !line.includes('DNI :'));
        reniecLines.forEach(line => {
            const [key, value] = line.split(' : ');
            if (key && value) {
                const cleanKey = key.trim().replace(/\[\w+\]/, '').replace(/\ud83d\udcc5|\ud83d\udccd|\ud83e\ude78/, '').toLowerCase().replace(/\s/g, '');
                data.reniec[cleanKey] = value.trim();
            }
        });
        // Simplificación de campos
        data.reniec.nombres = data.reniec.nombres;
        data.reniec.apellidos = data.reniec.apellidos;
        data.reniec.fechaNacimiento = data.reniec.fechanacimiento;
        data.reniec.direccion = data.reniec.direccion;
        data.reniec.distritoDireccion = data.reniec.distrito;
        data.reniec.departamentoDireccion = data.reniec.departamento;
    }

    // --- Extracción de Sueldos/Historial Laboral (Segundo Bloque) ---
    const sueldosBlock = sections.find(s => s.trim().startsWith('DNI : 10001088\nRUC : 20535603261\nEMPRESA :'));
    data.sueldos = [];
    if (sueldosBlock) {
        const salaryEntries = sueldosBlock.split(/\n\nDNI : \d+/).filter(e => e.trim());
        data.sueldos = salaryEntries.map(entry => {
            const details = {};
            entry.trim().split('\n').forEach(line => {
                const [key, value] = line.split(' : ');
                if (key && value) {
                    details[key.trim().toLowerCase()] = value.trim().replace('S/.', '');
                }
            });
            return {
                empresa: details.empresa,
                sueldo: details.sueldo,
                periodo: details.periodo,
            };
        });
    }

    // --- Extracción de Telefonía (Tercer Bloque) ---
    const telefoniaBlock = sections.find(s => s.trim().includes('TELEFONO :'));
    data.telefonia = [];
    if (telefoniaBlock) {
        const phoneEntries = telefoniaBlock.split(/\n\nDNI : \d+/).filter(e => e.trim());
        data.telefonia = phoneEntries.map(entry => {
            const details = {};
            entry.trim().split('\n').forEach(line => {
                const [key, value] = line.split(' : ');
                if (key && value) {
                    details[key.trim().toLowerCase()] = value.trim();
                }
            });
            return {
                telefono: details.telefono,
                operador: details.fuente, // Usamos FUENTE como operador
                tipoLinea: details.plan, // Usamos PLAN como tipo de línea
            };
        });
    }

    // --- Extracción de Empresas (Cuarto Bloque) ---
    const empresasBlock = sections.find(s => s.trim().includes('RAZON SOCIAL :'));
    data.empresas = [];
    if (empresasBlock) {
        const companyEntries = empresasBlock.split(/\n\nDNI : \d+/).filter(e => e.trim());
        data.empresas = companyEntries.map(entry => {
            const details = {};
            entry.trim().split('\n').forEach(line => {
                const [key, value] = line.split(' : ');
                if (key && value) {
                    details[key.trim().toLowerCase()] = value.trim();
                }
            });
            return {
                razonSocial: details['razon social'],
                ruc: details.ruc,
            };
        });
    }

    // Nota: Otros datos como Denuncias, Consumos, Licencia, Matrimonios, Fiscalía, etc.
    // no están en el ejemplo JSON proporcionado, por lo que se asume que vendrían
    // en bloques similares si la API los retornara. Para ser coherentes,
    // se mantienen los campos vacíos si no se parsean del 'message'.

    data.consumos = [];
    data.movimientos = [];
    data.denuncias = [];
    data.licencia = [];
    data.familiares = [];
    data.correos = [];
    data.direcciones = [];
    data.arbol = [];
    data.matrimonios = [];
    data.fiscalia = [];

    return data;
};

/**
 * Crea una página de imagen con un título, líneas de texto, opcionalmente una foto y un código QR.
 * @param {string} title - El título de la página.
 * @param {string[]} lines - Un array de líneas de texto a mostrar.
 * @param {Jimp | null} withPhoto - Objeto Jimp de la foto.
 * @param {boolean} withQR - Indica si se debe incluir el código QR de la app.
 * @returns {Jimp} Objeto Jimp de la imagen de la página.
 */
const createPage = async (title, lines, withPhoto = null, withQR = false) => {
    const img = new Jimp(1080, 1920, 0xFFFFFFFF);
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

    // Título centrado
    img.print(fontTitle, 0, 100, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, img.bitmap.width);

    const margin = 80;
    const columnWidth = (img.bitmap.width - margin * 3) / 2;
    const halfLines = Math.ceil(lines.length / 2);
    const linesLeft = lines.slice(0, halfLines);
    const linesRight = lines.slice(halfLines);

    let y = 250;
    let xLeft = margin;
    let xRight = margin + columnWidth + margin;

    // Foto y QR a la derecha si aplica
    if (withPhoto) {
        withPhoto.resize(250, Jimp.AUTO);
        xRight = img.bitmap.width - withPhoto.bitmap.width - margin;
        img.composite(withPhoto, xRight, 250);
    }

    if (withQR) {
        const qrCodeDataUrl = await QRCode.toDataURL(APP_DOWNLOAD_URL);
        const qrImage = await Jimp.read(Buffer.from(qrCodeDataUrl.split(",")[1], "base64"));
        qrImage.resize(250, 250);
        xRight = img.bitmap.width - qrImage.bitmap.width - margin;
        img.composite(qrImage, xRight, 550);
        img.print(fontData, xRight - 20, 810, "Descargar App");
    }

    // Imprimir columna izquierda
    let currentYLeft = y;
    for (const line of linesLeft) {
        img.print(fontData, xLeft, currentYLeft, line);
        currentYLeft += 50;
    }

    // Imprimir columna derecha (ajuste si hay foto/QR para que no se superpongan)
    let currentYRight = y;
    // Si hay foto o QR, imprimimos la columna derecha a la izquierda de la foto/QR.
    // Si no hay, la imprimimos en la posición normal de la segunda columna.
    let rightColumnX = (withPhoto || withQR) ? (xLeft + columnWidth) : xLeft;
    for (const line of linesRight) {
        img.print(fontData, rightColumnX, currentYRight, line);
        currentYRight += 50;
    }

    return img;
};

app.get("/generar-ficha-pdf", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try {
        // Llamada a la API SEEKER
        const response = await axios.get(SEEKER_API_URL(dni));
        const apiData = response.data;

        if (!apiData || !apiData.message) {
            return res.status(404).json({ error: "No se encontró información del DNI." });
        }

        const structuredData = parseSeekerMessage(apiData.message);
        const reniecData = structuredData.reniec;
        const pages = [];

        if (!reniecData || !reniecData.apellidos) {
            return res.status(404).json({ error: "No se encontró información personal en la respuesta." });
        }

        // --- Página Datos Personales ---
        let photoImg = null;
        if (apiData?.urls?.FILE) {
            try {
                // Descargar la imagen de la URL proporcionada
                const photoResponse = await axios.get(apiData.urls.FILE, { responseType: 'arraybuffer' });
                photoImg = await Jimp.read(photoResponse.data);
            } catch (e) {
                console.warn("No se pudo cargar la foto desde la URL:", e.message);
            }
        }

        pages.push(await createPage("Datos Personales", [
            `Nombres: ${reniecData.nombres || "-"}`,
            `Apellidos: ${reniecData.apellidos || "-"}`,
            `DNI: ${dni || "-"}`,
            `Género: ${reniecData.genero || "-"}`,
            `Fecha de Nacimiento: ${reniecData.fechaNacimiento || "-"}`,
            `Departamento: ${reniecData.departamento || "-"}`,
            `Provincia: ${reniecData.provincia || "-"}`,
            `Distrito: ${reniecData.distrito || "-"}`,
            `Grado Instrucción: ${reniecData.gradoinstruccion || "-"}`,
            `Estado Civil: ${reniecData.estadocivil || "-"}`,
            `Estatura: ${reniecData.estatura || "-"}`,
            `Padre: ${reniecData.padre || "-"}`,
            `Madre: ${reniecData.madre || "-"}`,
            `Restricción: ${reniecData.restriccion || "-"}`,
            `Dirección: ${reniecData.direccion || "-"}`,
            `Distrito Dir.: ${reniecData.distritodireccion || "-"}`,
            `Provincia Dir.: ${reniecData.provinciadireccion || "-"}`,
            `Departamento Dir.: ${reniecData.departamentodireccion || "-"}`,
        ], photoImg, true));

        // Función rápida para agregar secciones
        const addSection = async (title, items, formatter) => {
            if (!items || items.length === 0) return;
            const lines = items.map(formatter).flat();
            if (lines.length > 0) {
                pages.push(await createPage(title, lines));
            }
        };

        // --- Historial Laboral / Sueldos ---
        await addSection("Historial Laboral", structuredData.sueldos, (i) => [
            `Empresa: ${i.empresa || "-"}`,
            `Sueldo: S/.${i.sueldo || "-"}`,
            `Periodo: ${i.periodo || "-"}`,
            '---',
        ]);

        // --- Telefonía ---
        await addSection("Telefonía", structuredData.telefonia, (i) => [
            `Teléfono: ${i.telefono || "-"}`,
            `Operador: ${i.operador || "-"}`,
            `Tipo de Línea: ${i.tipoLinea || "-"}`,
            '---',
        ]);

        // --- Empresas Vinculadas ---
        await addSection("Empresas Vinculadas", structuredData.empresas, (i) => [
            `Razón Social: ${i.razonSocial || "-"}`,
            `RUC: ${i.ruc || "-"}`,
            '---',
        ]);

        // --- Secciones que no se pudieron parsear del ejemplo, se agregan si hay datos ---
        // (Dejarán de funcionar correctamente si la API no retorna el mismo formato)

        // Movimientos de Consumo
        await addSection("Movimientos de Consumo", structuredData.consumos, (i) => [
            `Empresa: ${i.razonSocial || "-"}`,
            `Monto: S/.${i.monto || "-"}`,
            `Fecha: ${i.fecha || "-"}`,
            '---',
        ]);

        // Movimientos Migratorios
        await addSection("Movimientos Migratorios", structuredData.movimientos, (i) => [
            `Fecha: ${i.fecmovimiento || "-"}`,
            `Tipo: ${i.tipmovimiento || "-"}`,
            `Destino: ${i.procedenciadestino || "-"}`,
            '---',
        ]);

        // Denuncias Policiales
        await addSection("Denuncias Policiales", structuredData.denuncias, (i) => [
            `Comisaría: ${i.general?.comisaria || "-"}`,
            `Tipo: ${i.general?.tipo || "-"}`,
            `Fecha: ${i.general?.fecha_hora_registro || "-"}`,
            '---',
        ]);

        // Licencia de Conducir
        await addSection("Licencia de Conducir", structuredData.licencia, (i) => [
            `Tipo: ${i.claseCategoria || "-"}`,
            `Estado: ${i.estado || "-"}`,
            `Vencimiento: ${i.fecVencimiento || "-"}`,
            '---',
        ]);

        // Familiares (unificando familia1, familia2, familia3, etc. si estuvieran disponibles)
        await addSection("Familiares", structuredData.familiares, (i) => [
            `Nombre: ${i.nombre || "-"}`,
            `DNI: ${i.dni || "-"}`,
            `Parentesco: ${i.parentesco || "-"}`,
            '---',
        ]);

        // Correos Electrónicos
        await addSection("Correos Electrónicos", structuredData.correos, (i) => [
            `Correo: ${i.correo || "-"}`,
            '---',
        ]);

        // Direcciones Registradas
        await addSection("Direcciones Registradas", structuredData.direcciones, (i) => [
            `Dirección: ${i.direccion || "-"}`,
            '---',
        ]);

        // Árbol Genealógico
        await addSection("Árbol Genealógico", structuredData.arbol, (i) => [
            `Nombre: ${i.nombres || "-"}`,
            `Parentesco: ${i.parentesco || "-"}`,
            `DNI: ${i.dni || "-"}`,
            '---',
        ]);

        // Matrimonios
        await addSection("Matrimonios", structuredData.matrimonios, (i) => [
            `Cónyuge: ${i.nombre_conyuge || "-"}`,
            `DNI Cónyuge: ${i.dni_conyuge || "-"}`,
            `Fecha: ${i.fecha_matrimonio || "-"}`,
            '---',
        ]);

        // Casos en Fiscalía
        await addSection("Casos en Fiscalía", structuredData.fiscalia, (i) => [
            `Caso: ${i.caso || "-"}`,
            `Fiscalía: ${i.fiscalia || "-"}`,
            '---',
        ]);


        // --- Página final con disclaimer ---
        const disclaimerPage = new Jimp(1080, 1920, 0xFFFFFFFF);
        const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
        const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);

        disclaimerPage.print(fontBig, 0, 500, { text: "© Consulta PE 2025", alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, disclaimerPage.bitmap.width);
        disclaimerPage.print(fontSmall, 0, 650, { text: "Todos los derechos reservados.", alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, disclaimerPage.bitmap.width);
        disclaimerPage.print(fontSmall, 100, 800,
            "Renuncia de responsabilidad: La información presentada\n" +
            "proviene de fuentes públicas oficiales. El servicio no se\n" +
            "responsabiliza por el uso indebido de los datos contenidos\n" +
            "en este documento."
        );
        pages.push(disclaimerPage);

        // --- Convertir todo a PDF ---
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

        res.download(pdfPath, `Ficha_Consulta_${dni}.pdf`, (err) => {
            if (err) console.error("Error al enviar el archivo:", err);
            fs.unlinkSync(pdfPath); // Eliminar el archivo después de enviarlo
        });
    } catch (error) {
        console.error("Error al generar el PDF:", error);
        res.status(500).json({ error: "Error al generar el PDF", detalle: error.message });
    }
});

app.use("/public", express.static(PUBLIC_DIR));
app.listen(PORT, "0.0.0.0", () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
