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

// --- Generador de Fichas Base (Plantilla) ---

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
        return yLeft; // Devolver la nueva posición Y
    };

    const printFieldRight = (label, value) => {
        const labelX = columnRightX;
        const valueX = labelX + 250;
        const maxWidth = columnWidthRight - (valueX - labelX);
        imagen.print(fontBold, labelX, yRight, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valueX, yRight, maxWidth, `${value || "-"}`, lineHeight);
        yRight = newY - 10;
        return yRight; // Devolver la nueva posición Y
    };
    
    // Función de impresión para una sola columna
    const printFieldSingleColumn = (label, value, currentY, columnX, columnWidth) => {
        const labelX = columnX;
        const valueX = labelX + 250;
        const maxWidth = columnWidth - (valueX - labelX);
        imagen.print(fontBold, labelX, currentY, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valueX, currentY, maxWidth, `${value || "-"}`, lineHeight);
        return newY - 10; // Devolver la nueva posición Y ajustada
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
        columnWidthLeft, // Agregar ancho de columna izquierda
        columnWidthRight,
        headingSpacing,
        fontHeading,
        fontBold,
        fontData,
        lineHeight,
        printFieldLeft,
        printFieldRight,
        printFieldSingleColumn // Pasar la nueva función de impresión
    });

    // Footer
    const footerY = imagen.bitmap.height - 100;
    imagen.print(
        fontData,
        marginHorizontal,
        footerY,
        "Esta imagen es solo informativa. No representa un documento oficial ni tiene validez legal. (SEEKER)"
    );

    // Devuelve el buffer de la imagen PNG
    return imagen.getBufferAsync(Jimp.MIME_PNG);
};


// --- Generación de Ficha 1: Datos Generales (Manteniendo la estructura principal) ---
const generarFichaDatosGenerales = async (req, data, dni) => {
    return generarFicha(dni, data, `FICHA 1: DATOS GENERALES - DNI ${dni}`, async ({
        imagen,
        data,
        yLeft,
        yRight,
        yStartContent,
        columnLeftX, 
        columnRightX,
        columnWidthRight,
        headingSpacing,
        fontHeading,
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
        yRight = printFieldRight("País", data.pais || "-");
        yRight = printFieldRight("Grupo Votación", data.gpVotacion || "-");
        yRight = printFieldRight("Multas Electorales", data.multasElectorales || "-");
        yRight = printFieldRight("Multa Admin", data.multaAdmin || "-");
        yRight = printFieldRight("Fecha Actualización", data.feActualizacion || "-");
        yRight = printFieldRight("Cancelación", data.cancelacion || "-");
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

        // --- COLUMNA IZQUIERDA: DATOS RENIEC Y FAMILIA ---

        // Datos Personales
        imagen.print(fontHeading, columnLeftX, yLeft, "Datos Personales");
        yLeft += headingSpacing;
        yLeft = printFieldLeft("DNI", data.nuDni);
        yLeft = printFieldLeft("Apellidos", `${data.apePaterno} ${data.apeMaterno} ${data.apCasada || ''}`.trim());
        yLeft = printFieldLeft("Prenombres", data.preNombres);
        yLeft = printFieldLeft("Sexo", data.sexo);
        yLeft = printFieldLeft("Estado Civil", data.estadoCivil);
        yLeft = printFieldLeft("Estatura", `${data.estatura || "-"} cm`);
        yLeft = printFieldLeft("Grado Inst.", data.gradoInstruccion);
        yLeft = printFieldLeft("Restricción", data.deRestriccion || "NINGUNA");
        yLeft = printFieldLeft("Donación", data.donaOrganos);
        yLeft += headingSpacing;

        // Fechas y Documentos
        imagen.print(fontHeading, columnLeftX, yLeft, "Fechas y Documentos");
        yLeft += headingSpacing;
        yLeft = printFieldLeft("Nacimiento", data.feNacimiento);
        yLeft = printFieldLeft("Fecha Emisión", data.feEmision);
        yLeft = printFieldLeft("Fecha Inscripción", data.feInscripcion);
        yLeft = printFieldLeft("Fecha Caducidad", data.feCaducidad);
        yLeft = printFieldLeft("Fecha Fallecimiento", data.feFallecimiento || "-");
        yLeft += headingSpacing;

        // Familia / Árbol Genealógico
        imagen.print(fontHeading, columnLeftX, yLeft, "Familia / Árbol Genealógico");
        yLeft += headingSpacing;
        yLeft = printFieldLeft("Padre", data.nomPadre);
        yLeft = printFieldLeft("Madre", data.nomMadre);
        yLeft = printFieldLeft("Actas Matrimonio", data.actasRegistradas?.MATRIMONIO || 0);
        yLeft = printFieldLeft("Actas Nacimiento", data.actasRegistradas?.NACIMIENTO || 0);
        yLeft = printFieldLeft("Actas Defunción", data.actasRegistradas?.DEFUNCION || 0);
        yLeft += headingSpacing;

        // Datos de Dirección y Ubicación
        imagen.print(fontHeading, columnLeftX, yLeft, "Datos de Dirección");
        yLeft += headingSpacing;
        yLeft = printFieldLeft("Dirección", data.desDireccion);
        yLeft = printFieldLeft("Departamento", data.depaDireccion);
        yLeft = printFieldLeft("Provincia", data.provDireccion);
        yLeft = printFieldLeft("Distrito", data.distDireccion);
        yLeft = printFieldLeft("Ubigeo Reniec", data.ubicacion?.ubigeo_reniec);
        yLeft = printFieldLeft("Ubigeo Sunat", data.ubicacion?.ubigeo_sunat);
        yLeft = printFieldLeft("Código Postal", data.ubicacion?.codigo_postal);
        
        // Dejamos la columna izquierda aquí, y la laboral pasará a su propia página.
    });
};

// --- Nueva Función para Paginación de Registros Laborales ---
const generarFichaLaboralPaginada = async (data, dni) => {
    const registrosLaborales = data.infoLaboral || [];
    const registrosPorPagina = 12; // Ajustado para una sola columna
    const totalPaginas = Math.ceil(registrosLaborales.length / registrosPorPagina);
    const buffers = [];
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    if (registrosLaborales.length === 0) return []; // No generar página si no hay datos

    for (let i = 0; i < totalPaginas; i++) {
        const registrosPagina = registrosLaborales.slice(i * registrosPorPagina, (i + 1) * registrosPorPagina);

        const buffer = await generarFicha(dni, data, 
            `FICHA ${2 + i}: INFORMACIÓN LABORAL - Pág. ${i + 1} de ${totalPaginas} (DNI ${dni})`, 
            async ({
                imagen, 
                columnLeftX, 
                columnWidthLeft, 
                fontHeading, 
                fontBold, 
                headingSpacing, 
                yStartContent,
                printFieldSingleColumn
            }) => {
                let currentY = yStartContent - 50;

                imagen.print(fontHeading, columnLeftX, currentY, `Historial Laboral Completo (${registrosLaborales.length} Registros)`);
                currentY += headingSpacing;
                
                for (const [index, registro] of registrosPagina.entries()) {
                    const numRegistro = i * registrosPorPagina + index + 1;
                    
                    imagen.print(fontBold, columnLeftX, currentY, `${numRegistro}. PERIODO ${registro.PERIODO}:`);
                    currentY += 20;

                    // Usamos una sola columna para maximizar el espacio vertical
                    currentY = printFieldSingleColumn("Empresa", registro.EMPRESA, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("RUC", registro.RUC, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("Sueldo", registro.SUELDO, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("Situación", registro.SITUACION, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    
                    currentY += 30; // Espacio entre registros
                }
                
                // Mensaje al final de la última página laboral
                if (i === totalPaginas - 1) {
                    imagen.print(fontSmall, columnLeftX, currentY + 10, "--- FIN DEL HISTORIAL LABORAL ---");
                }
        });
        buffers.push(buffer);
    }
    return buffers;
};

// --- Nueva Función para Paginación de Teléfonos ---
const generarFichaTelefonosPaginada = async (data, dni, indexInicio) => {
    const telefonos = data.telefonos || [];
    const registrosPorPagina = 18; // Ajustado para una sola columna
    const totalPaginas = Math.ceil(telefonos.length / registrosPorPagina);
    const buffers = [];
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    if (telefonos.length === 0) return [];

    for (let i = 0; i < totalPaginas; i++) {
        const registrosPagina = telefonos.slice(i * registrosPorPagina, (i + 1) * registrosPorPagina);

        const buffer = await generarFicha(dni, data, 
            `FICHA ${indexInicio + i}: TELÉFONOS Y CONTACTO - Pág. ${i + 1} de ${totalPaginas} (DNI ${dni})`, 
            async ({
                imagen, 
                columnLeftX, 
                columnWidthLeft, 
                fontHeading, 
                fontBold, 
                headingSpacing, 
                yStartContent,
                printFieldSingleColumn
            }) => {
                let currentY = yStartContent - 50;

                imagen.print(fontHeading, columnLeftX, currentY, `Contactos y Teléfonos Encontrados (${telefonos.length} Registros)`);
                currentY += headingSpacing;
                
                for (const [index, tel] of registrosPagina.entries()) {
                    const numRegistro = i * registrosPorPagina + index + 1;
                    
                    imagen.print(fontBold, columnLeftX, currentY, `${numRegistro}. TELÉFONO: ${tel.TELEFONO}`);
                    currentY += 20;

                    // Usamos una sola columna
                    currentY = printFieldSingleColumn("Plan", tel.PLAN, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("Fuente", tel.FUENTE, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("Período", tel.PERIODO, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    
                    currentY += 30; // Espacio entre registros
                }

                // Mensaje al final de la última página de teléfonos
                if (i === totalPaginas - 1) {
                    imagen.print(fontSmall, columnLeftX, currentY + 10, "--- FIN DEL REGISTRO DE TELÉFONOS ---");
                }
        });
        buffers.push(buffer);
    }
    return buffers;
};


// --- Nueva Función para Paginación de Cargos ---
const generarFichaCargosPaginada = async (data, dni, indexInicio) => {
    const cargos = data.cargos || [];
    const registrosPorPagina = 10; // Ajustado para una sola columna
    const totalPaginas = Math.ceil(cargos.length / registrosPorPagina);
    const buffers = [];
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    if (cargos.length === 0) return [];

    for (let i = 0; i < totalPaginas; i++) {
        const registrosPagina = cargos.slice(i * registrosPorPagina, (i + 1) * registrosPorPagina);

        const buffer = await generarFicha(dni, data, 
            `FICHA ${indexInicio + i}: CARGOS Y EMPRESAS - Pág. ${i + 1} de ${totalPaginas} (DNI ${dni})`, 
            async ({
                imagen, 
                columnLeftX, 
                columnWidthLeft, 
                fontHeading, 
                fontBold, 
                headingSpacing, 
                yStartContent,
                printFieldSingleColumn
            }) => {
                let currentY = yStartContent - 50;

                imagen.print(fontHeading, columnLeftX, currentY, `Cargos y Vínculos Empresariales (${cargos.length} Registros)`);
                currentY += headingSpacing;
                
                for (const [index, cargo] of registrosPagina.entries()) {
                    const numRegistro = i * registrosPorPagina + index + 1;
                    
                    imagen.print(fontBold, columnLeftX, currentY, `${numRegistro}. RUC: ${cargo.RUC}`);
                    currentY += 20;

                    // Usamos una sola columna
                    currentY = printFieldSingleColumn("Razón Social", cargo.RAZON_SOCIAL, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("Cargo", cargo.CARGO, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    currentY = printFieldSingleColumn("Desde", cargo.DESDE, currentY, columnLeftX, imagen.bitmap.width - columnLeftX * 2);
                    
                    currentY += 30; // Espacio entre registros
                }
                
                // Mensaje al final de la última página de cargos
                if (i === totalPaginas - 1) {
                    imagen.print(fontSmall, columnLeftX, currentY + 10, "--- FIN DEL REGISTRO DE CARGOS ---");
                }
        });
        buffers.push(buffer);
    }
    return buffers;
};


// --- FUNCIÓN PARA COMBINAR LOS BUFFERS EN UN SOLO PDF ---
const combinarPNGsEnPDF = async (pngBuffers, dni) => {
    return new Promise((resolve, reject) => {
        // Usamos tamaño A4 para que la ficha de 1080x1920 se ajuste bien
        const doc = new PDFDocument({ 
            size: [794, 1123], 
            margin: 0
        });

        const nombreArchivo = `ficha_completa_DNI_${dni}_${uuidv4()}.pdf`;
        const rutaArchivo = path.join(PUBLIC_DIR, nombreArchivo);
        const writeStream = fs.createWriteStream(rutaArchivo);
        doc.pipe(writeStream);

        pngBuffers.forEach((buffer, index) => {
            if (index > 0) {
                doc.addPage();
            }
            
            // Ajuste de la imagen al tamaño A4
            doc.image(buffer, 0, 0, {
                width: 794, 
                height: 1123, 
                fit: [794, 1123], 
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

        // 1. Generar Ficha de Datos Generales (Ficha 1)
        const bufferDatosGenerales = await generarFichaDatosGenerales(req, data, dni);
        
        // 2. Generar Fichas Paginadas para Laboral (Empieza en Ficha 2)
        const buffersLaborales = await generarFichaLaboralPaginada(data, dni);

        // 3. Generar Fichas Paginadas para Teléfonos (Comienza después de Laboral)
        const indiceTelefonos = 2 + buffersLaborales.length;
        const buffersTelefonos = await generarFichaTelefonosPaginada(data, dni, indiceTelefonos);

        // 4. Generar Fichas Paginadas para Cargos (Comienza después de Teléfonos)
        const indiceCargos = indiceTelefonos + buffersTelefonos.length;
        const buffersCargos = await generarFichaCargosPaginada(data, dni, indiceCargos);


        // Consolidar todos los buffers en orden
        const todosLosBuffers = [
            bufferDatosGenerales,
            ...buffersLaborales,
            ...buffersTelefonos,
            ...buffersCargos
        ];

        if (todosLosBuffers.length === 0) {
             return res.status(404).json({ error: "No se pudo generar ninguna ficha con los datos disponibles." });
        }
        
        // Combinar todos los buffers PNG en un único PDF
        const nombrePDF = await combinarPNGsEnPDF(todosLosBuffers, dni);

        const host = req.get("host");
        const protocol = req.protocol;

        const detalleContenido = [
            `Página 1: Datos Generales, Familia y Ubicación.`,
            ...buffersLaborales.map((_, i) => `Página ${2 + i}: Historial Laboral - Parte ${i + 1}.`),
            ...buffersTelefonos.map((_, i) => `Página ${indiceTelefonos + i}: Teléfonos y Contacto - Parte ${i + 1}.`),
            ...buffersCargos.map((_, i) => `Página ${indiceCargos + i}: Cargos y Vínculos Empresariales - Parte ${i + 1}.`)
        ];


        res.json({
            message: `Ficha de información completa generada y consolidada en un único PDF de ${todosLosBuffers.length} páginas.`,
            url_pdf_final: `${protocol}://${host}/public/${nombrePDF}`,
            total_paginas: todosLosBuffers.length,
            detalle_contenido: detalleContenido
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
