const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
// Nuevas librerías necesarias para la generación de PDF
const PDFDocument = require("pdfkit");
const streamToBuffer = require("stream-to-buffer");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";

// --- Utilerías de Jimp ---

// Función para generar marcas de agua
const generarMarcaDeAgua = async (imagen) => {
    const marcaAgua = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
    const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const text = "SEEKER";

    for (let i = 0; i < imagen.bitmap.width; i += 200) {
        for (let j = 0; j < imagen.bitmap.height; j += 100) {
            const angle = Math.random() * 30 - 15;
            const textImage = new Jimp(100, 50, 0x00000000);
            textImage.print(fontWatermark, 0, 0, text);
            textImage.rotate(angle);
            marcaAgua.composite(textImage, i, j, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.1, opacityDest: 1 });
        }
    }
    return marcaAgua;
};

// Función para imprimir texto con salto de línea
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

// --- Generador de Fichas (Múltiples) ---

const generarFicha = async (dni, data, title, contentCallback) => {
    const imagen = new Jimp(1080, 1920, "#003366");
    const marginHorizontal = 50;
    const columnLeftX = marginHorizontal;
    const columnRightX = imagen.bitmap.width / 2 + 50;
    const columnWidthLeft = imagen.bitmap.width / 2 - marginHorizontal - 25;
    const columnWidthRight = imagen.bitmap.width / 2 - marginHorizontal - 25;
    const lineHeight = 40;
    const headingSpacing = 50;

    let yStartContent = 300;
    let yLeft = yStartContent;
    let yRight = yStartContent;

    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    const marcaAgua = await generarMarcaDeAgua(imagen);
    imagen.composite(marcaAgua, 0, 0);

    // Título Principal de la Ficha
    imagen.print(fontTitle, marginHorizontal, 50, title);

    // Icono
    try {
        const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
        const mainIcon = await Jimp.read(iconBuffer);
        mainIcon.resize(300, Jimp.AUTO);
        const iconX = (imagen.bitmap.width - mainIcon.bitmap.width) / 2;
        imagen.composite(mainIcon, iconX, 50);
    } catch (error) {
        console.error("Error al cargar el icono:", error);
    }

    // Línea separadora central
    const separatorX = imagen.bitmap.width / 2;
    const separatorYStart = yStartContent - 50;
    const separatorYEnd = imagen.bitmap.height - 150;
    new Jimp(2, separatorYEnd - separatorYStart, 0xFFFFFFFF, (err, line) => {
        if (!err) imagen.composite(line, separatorX, separatorYStart);
    });

    // Funciones de impresión para las dos columnas
    const printFieldLeft = (label, value) => {
        const labelX = columnLeftX;
        const valueX = labelX + 250;
        const maxWidth = columnWidthLeft - (valueX - labelX);
        imagen.print(fontBold, labelX, yLeft, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valueX, yLeft, maxWidth, `${value || "-"}`, lineHeight);
        yLeft = newY - 10;
    };

    const printFieldRight = (label, value) => {
        const labelX = columnRightX;
        const valueX = labelX + 250;
        const maxWidth = columnWidthRight - (valueX - labelX);
        imagen.print(fontBold, labelX, yRight, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valueX, yRight, maxWidth, `${value || "-"}`, lineHeight);
        yRight = newY - 10;
    };

    // Callback para dibujar el contenido específico de la ficha
    await contentCallback({
        imagen,
        data,
        dni,
        yLeft,
        yRight,
        yStartContent,
        columnLeftX,
        columnRightX,
        columnWidthRight,
        headingSpacing,
        fontHeading,
        fontBold,
        fontData,
        lineHeight,
        printFieldLeft,
        printFieldRight
    });

    // Footer
    const footerY = imagen.bitmap.height - 100;
    imagen.print(
        fontData,
        marginHorizontal,
        footerY,
        "Esta imagen es solo informativa. No representa un documento oficial ni tiene validez legal."
    );

    // Devuelve el buffer de la imagen PNG en lugar del nombre del archivo
    return imagen.getBufferAsync(Jimp.MIME_PNG);
};


// --- Generación de Ficha 1: Datos Generales y Laborales ---
const generarFichaDatosGenerales = async (req, data, dni) => {
    return generarFicha(dni, data, `FICHA 1/3: DATOS GENERALES Y LABORALES - DNI ${dni}`, async ({
        imagen,
        data,
        yLeft,
        yRight,
        yStartContent,
        columnRightX,
        columnWidthRight,
        headingSpacing,
        fontHeading,
        fontData,
        printFieldLeft,
        printFieldRight
    }) => {
        // --- COLUMNA DERECHA: FOTO Y DATOS DE CONTACTO/ADICIONALES ---
        // Foto del ciudadano
        if (data.imagenes?.foto) {
            const bufferFoto = Buffer.from(data.imagenes.foto, 'base64');
            const foto = await Jimp.read(bufferFoto);
            const fotoWidth = 350;
            const fotoHeight = 400;
            foto.resize(fotoWidth, fotoHeight);
            const fotoX = columnRightX + (columnWidthRight - fotoWidth) / 2;
            imagen.composite(foto, fotoX, yStartContent);
            yRight += fotoHeight + headingSpacing;
        }

        imagen.print(fontHeading, columnRightX, yRight, "Otros Datos");
        yRight += headingSpacing;
        printFieldRight("País", data.pais || "-");
        printFieldRight("Grupo Votación", data.gpVotacion || "-");
        printFieldRight("Multas Electorales", data.multasElectorales || "-");
        printFieldRight("Multa Admin", data.multaAdmin || "-");
        printFieldRight("Fecha Actualización", data.feActualizacion || "-");
        printFieldRight("Cancelación", data.cancelacion || "-");
        yRight += headingSpacing;

        // QR al final de la columna derecha
        try {
            const qrCodeBuffer = await QRCode.toBuffer(APP_QR_URL);
            const qrCodeImage = await Jimp.read(qrCodeBuffer);
            qrCodeImage.resize(250, 250);
            const qrCodeX = columnRightX + (columnWidthRight - qrCodeImage.bitmap.width) / 2;
            imagen.composite(qrCodeImage, qrCodeX, yRight + 50);
            imagen.print(fontHeading, qrCodeX, yRight + 310, "Escanea el QR");
        } catch (error) {
            console.error("Error al generar el código QR:", error);
        }

        // --- COLUMNA IZQUIERDA: DATOS RENIEC Y LABORALES ---

        // Datos Personales (como ya existía y estaba excelente)
        imagen.print(fontHeading, yLeft, "Datos Personales");
        yLeft += headingSpacing;
        printFieldLeft("DNI", data.nuDni);
        printFieldLeft("Apellidos", `${data.apePaterno} ${data.apeMaterno} ${data.apCasada || ''}`.trim());
        printFieldLeft("Prenombres", data.preNombres);
        printFieldLeft("Sexo", data.sexo);
        printFieldLeft("Estado Civil", data.estadoCivil);
        printFieldLeft("Estatura", `${data.estatura || "-"} cm`);
        printFieldLeft("Grado Inst.", data.gradoInstruccion);
        printFieldLeft("Restricción", data.deRestriccion || "NINGUNA");
        printFieldLeft("Donación", data.donaOrganos);
        yLeft += headingSpacing;

        // Fechas y Restricciones
        imagen.print(fontHeading, yLeft, "Fechas y Documentos");
        yLeft += headingSpacing;
        printFieldLeft("Nacimiento", data.feNacimiento);
        printFieldLeft("Fecha Emisión", data.feEmision);
        printFieldLeft("Fecha Inscripción", data.feInscripcion);
        printFieldLeft("Fecha Caducidad", data.feCaducidad);
        printFieldLeft("Fecha Fallecimiento", data.feFallecimiento || "-");
        yLeft += headingSpacing;

        // Familia (Árbol Genealógico - simplificado a datos disponibles)
        imagen.print(fontHeading, yLeft, "Familia / Árbol Genealógico");
        yLeft += headingSpacing;
        printFieldLeft("Padre", data.nomPadre);
        printFieldLeft("Madre", data.nomMadre);
        printFieldLeft("Actas Matrimonio", data.actasRegistradas?.MATRIMONIO || 0);
        printFieldLeft("Actas Nacimiento", data.actasRegistradas?.NACIMIENTO || 0);
        printFieldLeft("Actas Defunción", data.actasRegistradas?.DEFUNCION || 0);
        yLeft += headingSpacing;

        // Datos de Dirección y Ubicación
        imagen.print(fontHeading, yLeft, "Datos de Dirección");
        yLeft += headingSpacing;
        printFieldLeft("Dirección", data.desDireccion);
        printFieldLeft("Departamento", data.depaDireccion);
        printFieldLeft("Provincia", data.provDireccion);
        printFieldLeft("Distrito", data.distDireccion);
        printFieldLeft("Ubigeo Reniec", data.ubicacion?.ubigeo_reniec);
        printFieldLeft("Ubigeo Sunat", data.ubicacion?.ubigeo_sunat);
        printFieldLeft("Código Postal", data.ubicacion?.codigo_postal);
        yLeft += headingSpacing;

        // Información Laboral (Sección grande)
        if (data.infoLaboral && data.infoLaboral.length > 0) {
            imagen.print(fontHeading, yLeft, `Información Laboral (Últimos 5 Periodos de ${data.infoLaboral.length})`);
            yLeft += headingSpacing;

            // Mostrar solo los últimos 5 para que quepa bien en la ficha
            const ultimosRegistros = data.infoLaboral.slice(0, 5);

            for (const registro of ultimosRegistros) {
                imagen.print(fontBold, yLeft, `PERIODO ${registro.PERIODO}:`);
                yLeft += 20;
                printFieldLeft("Empresa", registro.EMPRESA);
                printFieldLeft("RUC", registro.RUC);
                printFieldLeft("Sueldo", registro.SUELDO);
                printFieldLeft("Situación", registro.SITUACION);
                yLeft += 10;
            }

            if (data.infoLaboral.length > 5) {
                imagen.print(fontData, yLeft, `... ${data.infoLaboral.length - 5} registros laborales más.`);
            }
        }
    });
};

// --- Generación de Ficha 2: Teléfonos y Contacto ---
const generarFichaTelefonos = async (req, data, dni) => {
    return generarFicha(dni, data, `FICHA 2/3: TELÉFONOS Y CONTACTO - DNI ${dni}`, async ({
        imagen,
        data,
        yLeft,
        columnLeftX,
        fontHeading,
        headingSpacing,
        fontBold,
        fontData,
        lineHeight,
        columnWidthLeft,
        printFieldLeft,
        columnRightX,
        yStartContent
    }) => {
        // --- COLUMNA IZQUIERDA: RESUMEN Y CONTACTO PERSONAL ---

        imagen.print(fontHeading, columnLeftX, yLeft, "Datos de Contacto Personal");
        yLeft += headingSpacing;
        printFieldLeft("Teléfono (RENIEC)", data.telefono || "-");
        printFieldLeft("Email (RENIEC)", data.email || "-");
        yLeft += headingSpacing;

        // --- COLUMNA IZQUIERDA: LISTADO DE TELÉFONOS (MITAD 1) ---
        imagen.print(fontHeading, columnLeftX, yLeft, `Teléfonos Encontrados (${data.telefonos?.length || 0})`);
        yLeft += headingSpacing;

        const mitadTelefonos = Math.ceil((data.telefonos?.length || 0) / 2);
        const telefonosCol1 = data.telefonos?.slice(0, mitadTelefonos) || [];
        const telefonosCol2 = data.telefonos?.slice(mitadTelefonos) || [];

        for (const [index, tel] of telefonosCol1.entries()) {
            imagen.print(fontBold, columnLeftX, yLeft, `${index + 1}. Teléfono: ${tel.TELEFONO}`);
            yLeft += 20;
            printFieldLeft("Plan", tel.PLAN);
            printFieldLeft("Fuente", tel.FUENTE);
            printFieldLeft("Período", tel.PERIODO);
            yLeft += 10;
        }

        // --- COLUMNA DERECHA: LISTADO DE TELÉFONOS (MITAD 2) ---
        let yRight = yLeft > yStartContent ? yStartContent : yLeft; // Asegura que la columna derecha empiece al inicio si la izquierda no es muy larga.

        if (telefonosCol2.length > 0) {
            imagen.print(fontHeading, columnRightX, yRight, "Continuación Teléfonos");
            yRight += headingSpacing;
            for (const [index, tel] of telefonosCol2.entries()) {
                const labelX = columnRightX;
                const valueX = labelX + 250;
                const maxWidth = columnWidthLeft - (valueX - labelX);

                imagen.print(fontBold, labelX, yRight, `${mitadTelefonos + index + 1}. Teléfono: ${tel.TELEFONO}`);
                yRight += 20;
                imagen.print(fontBold, labelX, yRight, `Plan:`);
                yRight = printWrappedText(imagen, fontData, valueX, yRight, maxWidth, `${tel.PLAN || "-"}`, lineHeight) - 10;
                imagen.print(fontBold, labelX, yRight, `Fuente:`);
                yRight = printWrappedText(imagen, fontData, valueX, yRight, maxWidth, `${tel.FUENTE || "-"}`, lineHeight) - 10;
                imagen.print(fontBold, labelX, yRight, `Período:`);
                yRight = printWrappedText(imagen, fontData, valueX, yRight, maxWidth, `${tel.PERIODO || "-"}`, lineHeight) - 10;
                yRight += 10;
            }
        }
    });
};

// --- Generación de Ficha 3: Cargos y Empresas ---
const generarFichaCargos = async (req, data, dni) => {
    return generarFicha(dni, data, `FICHA 3/3: CARGOS Y EMPRESAS - DNI ${dni}`, async ({
        imagen,
        data,
        yLeft,
        columnLeftX,
        columnRightX,
        fontHeading,
        headingSpacing,
        fontBold,
        fontData,
        lineHeight,
        columnWidthLeft,
        yStartContent
    }) => {
        const cargos = data.cargos || [];
        const mitadCargos = Math.ceil(cargos.length / 2);
        const cargosCol1 = cargos.slice(0, mitadCargos);
        const cargosCol2 = cargos.slice(mitadCargos);

        // --- COLUMNA IZQUIERDA: CARGOS (MITAD 1) ---
        imagen.print(fontHeading, columnLeftX, yLeft, `Cargos y Vínculos Empresariales (${cargos.length})`);
        yLeft += headingSpacing;

        const printCargo = (cargo, x, yStart) => {
            const labelX = x;
            const valueX = labelX + 250;
            const maxWidth = columnWidthLeft - (valueX - labelX);
            let currentY = yStart;

            imagen.print(fontBold, labelX, currentY, `RUC:`);
            currentY = printWrappedText(imagen, fontData, valueX, currentY, maxWidth, `${cargo.RUC || "-"}`, lineHeight) - 10;
            imagen.print(fontBold, labelX, currentY, `Razón Social:`);
            currentY = printWrappedText(imagen, fontData, valueX, currentY, maxWidth, `${cargo.RAZON_SOCIAL || "-"}`, lineHeight) - 10;
            imagen.print(fontBold, labelX, currentY, `Cargo:`);
            currentY = printWrappedText(imagen, fontData, valueX, currentY, maxWidth, `${cargo.CARGO || "-"}`, lineHeight) - 10;
            imagen.print(fontBold, labelX, currentY, `Desde:`);
            currentY = printWrappedText(imagen, fontData, valueX, currentY, maxWidth, `${cargo.DESDE || "-"}`, lineHeight) - 10;

            return currentY + 30; // Espacio entre cargos
        };

        for (const [index, cargo] of cargosCol1.entries()) {
            imagen.print(fontBold, columnLeftX, yLeft, `Registro ${index + 1}:`);
            yLeft = printCargo(cargo, columnLeftX, yLeft + 20);
        }

        // --- COLUMNA DERECHA: CARGOS (MITAD 2) ---
        let yRight = yLeft > yStartContent ? yStartContent : yLeft;

        if (cargosCol2.length > 0) {
            imagen.print(fontHeading, columnRightX, yRight, "Continuación Cargos");
            yRight += headingSpacing;

            for (const [index, cargo] of cargosCol2.entries()) {
                imagen.print(fontBold, columnRightX, yRight, `Registro ${mitadCargos + index + 1}:`);
                yRight = printCargo(cargo, columnRightX, yRight + 20);
            }
        }
    });
};

// --- FUNCIÓN PARA COMBINAR LOS BUFFERS EN UN SOLO PDF ---
const combinarPNGsEnPDF = async (pngBuffers, dni) => {
    return new Promise((resolve, reject) => {
        // Las dimensiones de la ficha son 1080x1920 (en píxeles). 
        // Para que se vean correctamente en el PDF A4, usaremos la relación de aspecto 
        // de la imagen como tamaño de página (o un tamaño personalizado).
        // Vamos a usar el tamaño de la imagen como base para el PDF: [1080, 1920]
        const doc = new PDFDocument({ 
            size: [794, 1123], // Tamaño A4 en puntos (equivalente a una imagen de 1080x1920 con factor de escala)
            margin: 0 // Sin márgenes para que la imagen ocupe todo
        });

        const nombreArchivo = `ficha_completa_DNI_${dni}_${uuidv4()}.pdf`;
        const rutaArchivo = path.join(PUBLIC_DIR, nombreArchivo);
        const writeStream = fs.createWriteStream(rutaArchivo);
        doc.pipe(writeStream);

        // Iterar sobre cada buffer PNG y agregarlo como una nueva página en el PDF
        pngBuffers.forEach((buffer, index) => {
            // Se añade una nueva página si no es la primera
            if (index > 0) {
                doc.addPage();
            }
            
            // Colocar la imagen PNG en el PDF
            doc.image(buffer, 0, 0, {
                width: 794, // Escalar la imagen para que quepa en el ancho A4
                height: 1123, // Escalar la imagen para que quepa en el alto A4
                fit: [794, 1123], // Asegura que la imagen se ajuste a las dimensiones A4
                align: 'center',
                valign: 'center'
            });
        });

        doc.end();

        writeStream.on('finish', () => {
            resolve(nombreArchivo);
        });

        writeStream.on('error', (err) => {
            reject(err);
        });
    });
};

// --- ENDPOINT PRINCIPAL MODIFICADO ---

app.get("/generar-fichas-dni", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try {
        const apiUrl = `https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec?dni=${dni}`;
        const response = await axios.get(apiUrl);
        const data = response.data?.result;

        if (!data) {
            return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });
        }

        // Generar las 3 fichas como BUFFERS de imagen PNG
        const buffers = await Promise.all([
            generarFichaDatosGenerales(req, data, dni),
            generarFichaTelefonos(req, data, dni),
            generarFichaCargos(req, data, dni)
        ]);
        
        // Combinar los buffers PNG en un único PDF
        const nombrePDF = await combinarPNGsEnPDF(buffers, dni);

        const host = req.get("host");
        const protocol = req.protocol;

        res.json({
            message: "Ficha de información completa generada y consolidada en un único PDF de múltiples páginas.",
            url_pdf_final: `${protocol}://${host}/public/${nombrePDF}`,
            detalle_contenido: [
                "Página 1: Datos Generales, Familia y Últimos 5 Registros Laborales",
                "Página 2: Teléfonos y Contacto (Todos los registros)",
                "Página 3: Cargos y Vínculos Empresariales (Todos los registros)"
            ]
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al generar el PDF de la ficha", detalle: error.message });
    }
});

// Middleware para servir archivos estáticos (el PDF y cualquier imagen temporal)
app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    console.log(`Endpoint de prueba: http://${HOST}:${PORT}/generar-fichas-dni?dni=10001088`);
});
