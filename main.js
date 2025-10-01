/**
 * main.js
 * Servidor Express completo para:
 * - Consultar la API SEEKER / RENIEC (por DNI)
 * - Generar fichas en imágenes (Jimp) organizadas por "hojas"
 * - Combinar imágenes en un PDF (pdfkit)
 * - Responder con JSON con estructura compatible: parts_received y urls.FILE
 *
 * Instalar dependencias:
 * npm i express axios jimp qrcode uuid pdfkit stream-to-buffer
 *
 * Uso:
 * node main.js
 * Endpoint de ejemplo:
 * http://localhost:3000/generar-fichas-dni?dni=10001088
 *
 * NOTA: adapta la URL externa (API RENIEC / SEEKER) si hace falta.
 *
 * MODIFICACIONES SOLICITADAS:
 * 1. Organización en 2 columnas para listas de Familiares y Teléfonos.
 * 2. Mejorar orden y evitar superposición.
 * 3. Incorporación de avatares/emojis en la Ficha 1.
 * 4. Ficha de Familiares dedicada (si existen).
 */
const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Ajusta estas constantes si lo deseas
const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";
const REMOTE_API_BASE = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec"; // URL original del ejemplo

// Emojis/iconografía para Ficha 1
const EMOJIS = {
    DNI: "💳", Apellidos: "👤", Prenombres: "🌟", Género: "♀️/♂️", FechaNac: "🎂",
    LugarNac: "📍", EstadoCivil: "💍", GradoInstruccion: "🎓", Estatura: "📏", Restriccion: "⛔",
    FechaInscripcion: "📝", FechaEmision: "🗓️", FechaCaducidad: "⏳", FechaFallecimiento: "⚰️",
    Padre: "👨", Madre: "👩", Pais: "🌎", GpVotacion: "🗳️", MultasElectorales: "⚖️",
    MultaAdmin: "⚠️", FechaActualizacion: "🔄", Cancelacion: "❌",
    Direccion: "🏠", Depa: "🗺️", Prov: "🏙️", Dist: "🏘️", Ubigeo: "🔢",
    CodPostal: "✉️", Matrimonio: "💐", Nacimiento: "👶", Defuncion: "🥀",
};

// ------------------- Utilidades Jimp / Formato -------------------
/** Genera una marca de agua ligera repetida */
const generarMarcaDeAgua = async (imagen, text = "SEEKER") => {
    const marca = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
    // Fuente más grande para la marca de agua, pero más transparente
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE); 
    const stepX = 250;
    const stepY = 150;
    for (let x = 0; x < imagen.bitmap.width; x += stepX) {
        for (let y = 0; y < imagen.bitmap.height; y += stepY) {
            const angle = (Math.random() * 24) - 12;
            const textImg = new Jimp(300, 80, 0x00000000); // Tamaño ajustado para el texto más grande
            textImg.print(font, 0, 0, text);
            textImg.rotate(angle);
            marca.composite(textImg, x, y, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.05, opacityDest: 1 }); // Opacidad reducida
        }
    }
    return marca;
};

/** Imprime texto envuelto respetando ancho máximo */
const printWrappedText = (image, font, x, y, maxWidth, text, lineHeight = 32) => {
    const words = String(text || "").split(/\s+/);
    let line = "";
    let curY = y;
    for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const w = Jimp.measureText(font, testLine);
        if (w > maxWidth && line) {
            image.print(font, x, curY, line.trim());
            curY += lineHeight;
            line = word;
        } else {
            line = testLine;
        }
    }
    if (line) {
        image.print(font, x, curY, line.trim());
        curY += lineHeight;
    }
    return curY;
};

// ------------------- Plantilla generadora de "fichas" (imágenes) -------------------
/**
 * generarFicha:
 * - dni: string
 * - data: objeto con la info devuelta por la API
 * - title: string (título en la imagen)
 * - contentCallback: async function({imagen, helpers...}) -> para dibujar contenido específico
 *
 * Devuelve el buffer PNG (Promise)
 */
const generarFicha = async (dni, data, title, contentCallback) => {
    const W = 1080, H = 1920;
    const imagen = new Jimp(W, H, "#0b2b3a"); // color base profesional
    const margin = 48;
    const columnLeftX = margin;
    const columnRightX = Math.floor(W / 2) + 24;
    const columnWidthLeft = Math.floor(W / 2) - margin - 40;
    const columnWidthRight = Math.floor(W / 2) - margin - 40;
    const lineHeight = 36;
    const headingSpacing = 48; // Aumentado para más espacio
    const yStartContent = 280; // Bajado para más espacio en el encabezado
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    // Marca de agua
    const marca = await generarMarcaDeAgua(imagen, "SEEKER");
    imagen.composite(marca, 0, 0);

    // Título y posible icono
    try {
        const iconBuf = (await axios.get(APP_ICON_URL, { responseType: "arraybuffer" })).data;
        const icon = await Jimp.read(iconBuf);
        icon.resize(220, Jimp.AUTO);
        const iconX = Math.floor((W - icon.bitmap.width) / 2);
        imagen.composite(icon, iconX, 36);
    } catch (e) {
        // si falla icono, se ignora y se deja solo título
    }
    imagen.print(fontTitle, margin, 150, title);

    // separator vertical (Solo para la primera ficha donde el contenido se divide con foto)
    if (title.includes("FICHA 1 - DATOS GENERALES")) {
        const separatorX = Math.floor(W / 2);
        new Jimp(2, H - 320, 0xFFFFFFFF, (err, line) => {
            if (!err) imagen.composite(line, separatorX, yStartContent - 60);
        });
    }

    // helpers de impresión
    let yLeft = yStartContent;
    let yRight = yStartContent;

    const printFieldLeft = (label, value, emoji = "") => {
        const fullLabel = `${emoji} ${label}:`;
        const labelX = columnLeftX;
        const valX = labelX + 240;
        imagen.print(fontBold, labelX, yLeft, fullLabel);
        const newY = printWrappedText(imagen, fontData, valX, yLeft, columnWidthLeft - 240, `${value ?? "-"}`, lineHeight);
        yLeft = newY + 6;
        return yLeft;
    };

    const printFieldRight = (label, value, emoji = "") => {
        const fullLabel = `${emoji} ${label}:`;
        const labelX = columnRightX;
        const valX = labelX + 240;
        imagen.print(fontBold, labelX, yRight, fullLabel);
        const newY = printWrappedText(imagen, fontData, valX, yRight, columnWidthRight - 240, `${value ?? "-"}`, lineHeight);
        yRight = newY + 6;
        return yRight;
    };

    const printSingleColumn = (label, value, currentY, columnX, columnWidth, labelWidth = 200) => {
        const labelX = columnX;
        const valX = labelX + labelWidth;
        imagen.print(fontBold, labelX, currentY, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valX, currentY, columnWidth - labelWidth, `${value ?? "-"}`, lineHeight);
        return newY + 6;
    };

    // Ejecutar callback que dibuja contenido concreto
    await contentCallback({
        imagen, data, dni, yLeft, yRight, yStartContent, columnLeftX, columnRightX,
        columnWidthLeft, columnWidthRight, headingSpacing, fontHeading, fontBold,
        fontData, printFieldLeft, printFieldRight, printSingleColumn, lineHeight,
        W, H, margin
    });

    // Footer
    imagen.print(fontData, margin, H - 110, "Esta imagen es informativa. No constituye documento oficial. (SEEKER)");

    // Retorna buffer PNG
    return imagen.getBufferAsync(Jimp.MIME_PNG);
};

// ------------------- Fichas específicas (Datos Generales, Laboral, Teléfonos, Cargos) -------------------

/** Ficha 1 - Datos Generales */
const generarFichaDatosGenerales = async (data, dni) => {
    return generarFicha(dni, data, `FICHA 1 - DATOS GENERALES - ${dni}`, async (ctx) => {
        const {
            imagen, data: d, columnLeftX, columnRightX, columnWidthRight,
            headingSpacing, fontHeading, printFieldLeft, printFieldRight, yStartContent
        } = ctx;

        // FOTO
        const fotoY = yStartContent - 20;
        if (d.imagenes?.foto) {
            try {
                const buf = Buffer.from(d.imagenes.foto, "base64");
                const foto = await Jimp.read(buf);
                foto.resize(360, Jimp.AUTO);
                const fotoX = columnRightX + Math.floor((columnWidthRight - foto.bitmap.width) / 2);
                imagen.composite(foto, fotoX, fotoY);
            } catch (e) { /* ignore foto errors */ }
        }

        // --- Columna derecha: Otros Datos ---
        imagen.print(fontHeading, columnRightX, fotoY + 380, "Otros Datos");
        let yRight = fotoY + 380 + headingSpacing;
        ctx.yRight = yRight; // Actualizar yRight en el contexto
        ctx.yRight = printFieldRight("País", d.pais, EMOJIS.Pais);
        ctx.yRight = printFieldRight("Grupo Votación", d.gpVotacion, EMOJIS.GpVotacion);
        ctx.yRight = printFieldRight("Multas Electorales", d.multasElectorales, EMOJIS.MultasElectorales);
        ctx.yRight = printFieldRight("Multa Admin", d.multaAdmin, EMOJIS.MultaAdmin);
        ctx.yRight = printFieldRight("Fecha Actualización", d.feActualizacion, EMOJIS.FechaActualizacion);
        ctx.yRight = printFieldRight("Cancelación", d.cancelacion, EMOJIS.Cancelacion);

        // --- Columna izquierda: Datos Personales ---
        imagen.print(fontHeading, columnLeftX, yStartContent, "Datos Personales");
        let yLeft = yStartContent + headingSpacing;
        ctx.yLeft = yLeft; // Actualizar yLeft en el contexto
        ctx.yLeft = printFieldLeft("DNI", d.nuDni, EMOJIS.DNI);
        ctx.yLeft = printFieldLeft("Apellidos", `${d.apePaterno ?? ""} ${d.apeMaterno ?? ""} ${d.apCasada ?? ""}`.trim(), EMOJIS.Apellidos);
        ctx.yLeft = printFieldLeft("Prenombres", d.preNombres, EMOJIS.Prenombres);
        ctx.yLeft = printFieldLeft("Género", d.sexo, EMOJIS.Género);
        ctx.yLeft = printFieldLeft("Fecha Nac.", d.feNacimiento, EMOJIS.FechaNac);
        ctx.yLeft = printFieldLeft("Lugar (Dpto/Prov/Dist)", `${d.depaNacimiento ?? "-"} / ${d.provNacimiento ?? "-"} / ${d.distNacimiento ?? "-"}`, EMOJIS.LugarNac);
        ctx.yLeft = printFieldLeft("Estado Civil", d.estadoCivil, EMOJIS.EstadoCivil);
        ctx.yLeft = printFieldLeft("Grado Instrucción", d.gradoInstruccion, EMOJIS.GradoInstruccion);
        ctx.yLeft = printFieldLeft("Estatura", d.estatura ? `${d.estatura} cm` : "-", EMOJIS.Estatura);
        ctx.yLeft = printFieldLeft("Restricción", d.deRestriccion ?? "NINGUNA", EMOJIS.Restriccion);

        // --- Columna izquierda: Fechas y Familia ---
        ctx.yLeft = Math.max(ctx.yLeft, ctx.yRight + headingSpacing); // Asegura que la nueva sección comience más abajo que la derecha
        imagen.print(fontHeading, columnLeftX, ctx.yLeft, "Fechas y Familia");
        ctx.yLeft += headingSpacing;
        ctx.yLeft = printFieldLeft("Fecha Inscripción", d.feInscripcion, EMOJIS.FechaInscripcion);
        ctx.yLeft = printFieldLeft("Fecha Emisión", d.feEmision, EMOJIS.FechaEmision);
        ctx.yLeft = printFieldLeft("Fecha Caducidad", d.feCaducidad, EMOJIS.FechaCaducidad);
        ctx.yLeft = printFieldLeft("Fecha Fallecimiento", d.feFallecimiento || "-", EMOJIS.FechaFallecimiento);
        ctx.yLeft = printFieldLeft("Padre", d.nomPadre, EMOJIS.Padre);
        ctx.yLeft = printFieldLeft("Madre", d.nomMadre, EMOJIS.Madre);

        // --- Columna izquierda: Dirección y ubicaciones ---
        imagen.print(fontHeading, columnLeftX, ctx.yLeft, "Dirección / Ubicación");
        ctx.yLeft += headingSpacing;
        ctx.yLeft = printFieldLeft("Dirección", d.desDireccion, EMOJIS.Direccion);
        ctx.yLeft = printFieldLeft("Departamento (Dir)", d.depaDireccion, EMOJIS.Depa);
        ctx.yLeft = printFieldLeft("Provincia (Dir)", d.provDireccion, EMOJIS.Prov);
        ctx.yLeft = printFieldLeft("Distrito (Dir)", d.distDireccion, EMOJIS.Dist);
        ctx.yLeft = printFieldLeft("Ubigeo RENIEC", d.ubicacion?.ubigeo_reniec, EMOJIS.Ubigeo);
        ctx.yLeft = printFieldLeft("Ubigeo INEI", d.ubicacion?.ubigeo_inei, EMOJIS.Ubigeo);
        ctx.yLeft = printFieldLeft("Ubigeo SUNAT", d.ubicacion?.ubigeo_sunat, EMOJIS.Ubigeo);
        ctx.yLeft = printFieldLeft("Código Postal", d.ubicacion?.codigo_postal, EMOJIS.CodPostal);

        // --- Columna izquierda: Actas registradas ---
        imagen.print(fontHeading, columnLeftX, ctx.yLeft, "Actas Registradas");
        ctx.yLeft += headingSpacing;
        ctx.yLeft = printFieldLeft("Matrimonio", d.actasRegistradas?.MATRIMONIO ?? 0, EMOJIS.Matrimonio);
        ctx.yLeft = printFieldLeft("Nacimiento", d.actasRegistradas?.NACIMIENTO ?? 0, EMOJIS.Nacimiento);
        ctx.yLeft = printFieldLeft("Defunción", d.actasRegistradas?.DEFUNCION ?? 0, EMOJIS.Defuncion);
    });
};

/** Genera páginas paginadas de Familiares */
const generarFichaFamiliaresPaginada = async (data, dni, pageOffset = 0) => {
    const registros = Array.isArray(data.familiares) ? data.familiares : [];
    if (!registros.length) return [];
    
    // Se calcula el número de registros por página y por columna
    const porPagina = 16; // Número total de registros por hoja (8 izquierda, 8 derecha)
    const porColumna = porPagina / 2;
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];

    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${pageOffset + p + 1} - FAMILIARES - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, columnRightX, yStartContent, fontHeading, headingSpacing, W, margin, lineHeight } = ctx;
            let currentYLeft = yStartContent - 20;
            let currentYRight = yStartContent - 20;

            imagen.print(fontHeading, columnLeftX, currentYLeft, `Familiares y Vínculos (${registros.length} registros)`);
            currentYLeft += headingSpacing + 10;

            // Separador vertical
            const separatorX = Math.floor(W / 2);
            new Jimp(2, 1600, 0xFFFFFFFF, (err, line) => { // Dibujar un separador más grande
                if (!err) imagen.composite(line, separatorX, yStartContent - 60);
            });

            const drawFamiliar = (r, index, startY, columnX, columnWidth) => {
                let currentY = startY;
                const indexNum = p * porPagina + index + 1;
                const labelX = columnX;
                const labelWidth = 120; // Ancho para la etiqueta más corta como 'DNI'

                imagen.print(fontHeading, labelX, currentY, `${indexNum}. ${r.NOMBRE ?? "N/D"}`);
                currentY += headingSpacing - 10;

                currentY = ctx.printSingleColumn("DNI", r.DNI ?? "-", currentY, columnX, columnWidth, labelWidth);
                currentY = ctx.printSingleColumn("Vínculo", r.VINCULO ?? "-", currentY, columnX, columnWidth, labelWidth);
                currentY = ctx.printSingleColumn("Tipo", r.TIPO ?? "-", currentY, columnX, columnWidth, labelWidth);
                currentY += 16; // Espacio entre registros

                return currentY;
            };

            const leftSlice = slice.slice(0, porColumna);
            const rightSlice = slice.slice(porColumna);

            // Columna Izquierda
            for (const [i, r] of leftSlice.entries()) {
                currentYLeft = drawFamiliar(r, i, currentYLeft, columnLeftX, ctx.columnWidthLeft);
            }

            // Columna Derecha
            currentYRight = currentYLeft; // Empieza en la misma altura que la izquierda

            for (const [i, r] of rightSlice.entries()) {
                currentYRight = drawFamiliar(r, i + porColumna, currentYRight, columnRightX, ctx.columnWidthRight);
            }

        });
        buffers.push(buf);
    }
    return buffers;
};


/** Genera páginas paginadas del historial laboral como buffers PNG (una columna) */
const generarFichaLaboralPaginada = async (data, dni, pageOffset = 0) => {
    const registros = Array.isArray(data.infoLaboral) ? data.infoLaboral : [];
    if (!registros.length) return [];
    const porPagina = 9; // Registros por página en una sola columna
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${pageOffset + p + 1} - HISTORIAL LABORAL - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, printSingleColumn, yStartContent, fontHeading, W, headingSpacing } = ctx;
            let currentY = yStartContent - 20;
            const columnWidth = W - columnLeftX * 2; // Ancho completo menos los márgenes

            imagen.print(fontHeading, columnLeftX, currentY, `Historial Laboral (${registros.length} registros)`);
            currentY += headingSpacing + 10;

            for (const [i, r] of slice.entries()) {
                currentY += 10; // Espacio antes del registro
                imagen.print(await Jimp.loadFont(Jimp.FONT_SANS_24_WHITE), columnLeftX, currentY, `${p * porPagina + i + 1}. PERIODO: ${r.PERIODO ?? "-"}`);
                currentY += 36; // Altura de fuente 24
                currentY = printSingleColumn("Empresa", r.EMPRESA ?? "-", currentY, columnLeftX, columnWidth);
                currentY = printSingleColumn("RUC", r.RUC ?? "-", currentY, columnLeftX, columnWidth);
                currentY = printSingleColumn("Sueldo", r.SUELDO ?? "-", currentY, columnLeftX, columnWidth);
                currentY = printSingleColumn("Situación", r.SITUACION ?? "-", currentY, columnLeftX, columnWidth);
                currentY += 18; // Espacio después del registro
                new Jimp(columnWidth, 1, 0xFFFFFF88, (err, line) => { // Separador sutil
                    if (!err) imagen.composite(line, columnLeftX, currentY);
                });
            }
        });
        buffers.push(buf);
    }
    return buffers;
};

/** Genera páginas paginadas de teléfonos (dos columnas) */
const generarFichaTelefonosPaginada = async (data, dni, pageOffset = 0) => {
    const registros = Array.isArray(data.telefonos) ? data.telefonos : [];
    if (!registros.length) return [];
    
    const porPagina = 12; // 6 registros en cada columna
    const porColumna = porPagina / 2;
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${pageOffset + p + 1} - TELÉFONOS - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, columnRightX, yStartContent, fontHeading, headingSpacing, W, lineHeight } = ctx;
            let currentYLeft = yStartContent - 20;
            let currentYRight = yStartContent - 20;
            const labelWidth = 120; // Ancho para la etiqueta

            imagen.print(fontHeading, columnLeftX, currentYLeft, `Contactos y Teléfonos (${registros.length} registros)`);
            currentYLeft += headingSpacing + 10;
            
            // Separador vertical
            const separatorX = Math.floor(W / 2);
            new Jimp(2, 1600, 0xFFFFFFFF, (err, line) => { // Dibujar un separador más grande
                if (!err) imagen.composite(line, separatorX, yStartContent - 60);
            });
            
            const drawTelefono = (r, index, startY, columnX, columnWidth) => {
                let currentY = startY;
                const indexNum = p * porPagina + index + 1;
                
                imagen.print(ctx.fontBold, columnX, currentY, `📞 ${indexNum}. TEL: ${r.TELEFONO ?? "-"}`);
                currentY += 28;
                currentY = ctx.printSingleColumn("Plan", r.PLAN ?? "-", currentY, columnX, columnWidth, labelWidth);
                currentY = ctx.printSingleColumn("Fuente", r.FUENTE ?? "-", currentY, columnX, columnWidth, labelWidth);
                currentY = ctx.printSingleColumn("Periodo", r.PERIODO ?? "-", currentY, columnX, columnWidth, labelWidth);
                currentY += 16; // Espacio entre registros

                return currentY;
            };

            const leftSlice = slice.slice(0, porColumna);
            const rightSlice = slice.slice(porColumna);

            // Columna Izquierda
            for (const [i, r] of leftSlice.entries()) {
                currentYLeft = drawTelefono(r, i, currentYLeft, columnLeftX, ctx.columnWidthLeft);
            }

            // Columna Derecha
            currentYRight = currentYLeft; // Empezar más abajo si la izquierda tiene más contenido
            for (const [i, r] of rightSlice.entries()) {
                currentYRight = drawTelefono(r, i + porColumna, currentYRight, columnRightX, ctx.columnWidthRight);
            }
        });
        buffers.push(buf);
    }
    return buffers;
};

/** Genera páginas paginadas de cargos / empresas (una columna) */
const generarFichaCargosPaginada = async (data, dni, pageOffset = 0) => {
    const registros = Array.isArray(data.cargos) ? data.cargos : [];
    if (!registros.length) return [];
    const porPagina = 8; // Registros por página en una sola columna
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${pageOffset + p + 1} - CARGOS / EMPRESAS - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, printSingleColumn, yStartContent, fontHeading, W, headingSpacing } = ctx;
            let currentY = yStartContent - 20;
            const columnWidth = W - columnLeftX * 2; // Ancho completo menos los márgenes

            imagen.print(fontHeading, columnLeftX, currentY, `Cargos y Vínculos Empresariales (${registros.length} registros)`);
            currentY += headingSpacing + 10;

            for (const [i, r] of slice.entries()) {
                currentY += 10;
                imagen.print(await Jimp.loadFont(Jimp.FONT_SANS_24_WHITE), columnLeftX, currentY, `${p * porPagina + i + 1}. RUC: ${r.RUC ?? "-"}`);
                currentY += 36;
                currentY = printSingleColumn("Razón Social", r.RAZON_SOCIAL ?? "-", currentY, columnLeftX, columnWidth);
                currentY = printSingleColumn("Cargo", r.CARGO ?? "-", currentY, columnLeftX, columnWidth);
                currentY = printSingleColumn("Desde", r.DESDE ?? "-", currentY, columnLeftX, columnWidth);
                currentY += 18;
                new Jimp(columnWidth, 1, 0xFFFFFF88, (err, line) => {
                    if (!err) imagen.composite(line, columnLeftX, currentY);
                });
            }
        });
        buffers.push(buf);
    }
    return buffers;
};

// ------------------- Convertir conjunto de PNG buffers a PDF -------------------
const combinarPNGsEnPDF = async (pngBuffers, dni) => {
    return new Promise((resolve, reject) => {
        const nombreArchivo = `ficha_completa_DNI_${dni}_${uuidv4()}.pdf`;
        const rutaArchivo = path.join(PUBLIC_DIR, nombreArchivo);
        // Usar tamaño A4 (595x842 puntos)
        const doc = new PDFDocument({ autoFirstPage: false, size: 'A4' }); 
        const writeStream = fs.createWriteStream(rutaArchivo);
        doc.pipe(writeStream);
        
        // Dimensiones de A4 en puntos para redimensionar la imagen (1080x1920px -> 595x842pt)
        const A4_WIDTH = 595;
        const A4_HEIGHT = 842;

        pngBuffers.forEach((buf) => {
            doc.addPage({ margin: 0 });
            try {
                // Redimensionar la imagen (1080x1920) para que encaje en la página A4 (595x842)
                doc.image(buf, 0, 0, { width: A4_WIDTH, height: A4_HEIGHT }); 
            } catch (e) {
                // Si falla dibujar la imagen, se añade una página en blanco
                console.error("Error al añadir imagen al PDF:", e);
            }
        });
        doc.end();
        writeStream.on("finish", () => resolve(nombreArchivo));
        writeStream.on("error", (e) => reject(e));
    });
};


// ------------------- Endpoint principal -------------------
/**
 * /generar-fichas-dni?dni=...
 * Responde JSON con:
 * - message
 * - url_pdf_final
 * - total_paginas
 * - detalle_contenido (array)
 * - parts_received y urls.FILE para compatibilidad con tu frontend
 */
app.get("/generar-fichas-dni", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try {
        // 1) Llamada a API externa (SEEKER / RENIEC)
        const apiUrl = `${REMOTE_API_BASE}?dni=${encodeURIComponent(dni)}`;
        const response = await axios.get(apiUrl, { timeout: 20000 }).catch(err => {
            // si la API falla, respondemos error entendible
            throw new Error(`Error consultando API remota: ${err.message}`);
        });
        const data = response.data?.result;
        if (!data) return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });

        // 2) Generar fichas en el orden y formato solicitado
        const todos = [];
        const detalleContenido = [];
        let pageCount = 0;

        // Ficha 1 - Datos Generales
        const bufferFichaPrincipal = await generarFichaDatosGenerales(data, dni);
        todos.push(bufferFichaPrincipal);
        pageCount++;
        detalleContenido.push(`Página ${pageCount}: Datos Generales, Familia y Ubicación`);

        // Fichas de Familiares (si existen)
        const buffersFamiliares = await generarFichaFamiliaresPaginada(data, dni, pageCount);
        buffersFamiliares.forEach((buf, i) => {
            todos.push(buf);
            pageCount++;
            detalleContenido.push(`Página ${pageCount}: Familiares - Parte ${i + 1}`);
        });

        // Fichas Laborales (si existen)
        const buffersLaborales = await generarFichaLaboralPaginada(data, dni, pageCount);
        buffersLaborales.forEach((buf, i) => {
            todos.push(buf);
            pageCount++;
            detalleContenido.push(`Página ${pageCount}: Historial Laboral - Parte ${i + 1}`);
        });

        // Fichas de Teléfonos (si existen)
        const buffersTelefonos = await generarFichaTelefonosPaginada(data, dni, pageCount);
        buffersTelefonos.forEach((buf, i) => {
            todos.push(buf);
            pageCount++;
            detalleContenido.push(`Página ${pageCount}: Teléfonos - Parte ${i + 1}`);
        });

        // Fichas de Cargos (si existen)
        const buffersCargos = await generarFichaCargosPaginada(data, dni, pageCount);
        buffersCargos.forEach((buf, i) => {
            todos.push(buf);
            pageCount++;
            detalleContenido.push(`Página ${pageCount}: Cargos / Empresas - Parte ${i + 1}`);
        });


        if (!todos.length) return res.status(500).json({ error: "No se pudo generar contenido con los datos disponibles." });

        // 5) Combinar en PDF
        const nombrePDF = await combinarPNGsEnPDF(todos, dni);
        const urlPdf = `${req.protocol}://${req.get("host")}/public/${nombrePDF}`;

        // 6) Guardar también la primera imagen PNG por compatibilidad (opcional)
        const primeraPNGName = `ficha_${dni}_${uuidv4()}.png`;
        const primeraPNGPath = path.join(PUBLIC_DIR, primeraPNGName);
        await fs.promises.writeFile(primeraPNGPath, bufferFichaPrincipal);

        // Estructura JSON final (manteniendo keys solicitadas)
        const resultJson = {
            message: `Ficha de información completa generada y consolidada en un único PDF (${todos.length} páginas).`,
            url_pdf_final: urlPdf,
            total_paginas: todos.length,
            detalle_contenido: detalleContenido,
            // Formato legacy solicitado por tu app
            bot: "@LEDERDATA_OFC_BOT",
            chat_id: Date.now(), // simulación, reemplaza si tienes chat_id real
            date: new Date().toISOString(),
            fields: { dni: String(dni) },
            from_id: Date.now(),
            message: buildLegacyTextFromData(data),
            parts_received: todos.length,
            urls: {
                FILE: urlPdf,
                FIRST_IMAGE: `${req.protocol}://${req.get("host")}/public/${primeraPNGName}`
            }
        };

        return res.json(resultJson);

    } catch (error) {
        console.error("Error generar-fichas-dni:", error);
        return res.status(500).json({ error: "Error al generar las fichas", detalle: String(error.message) });
    }
});

/** Helper: Construye el texto legible tipo "legacy message" */
function buildLegacyTextFromData(d) {
    try {
        const lines = [];
        if (d.nuDni) lines.push(`DNI : ${d.nuDni}`);
        const apes = `${d.apePaterno ?? ""} ${d.apeMaterno ?? ""}`.trim();
        if (apes) lines.push(`APELLIDOS : ${apes}`);
        if (d.preNombres) lines.push(`NOMBRES : ${d.preNombres}`);
        if (d.sexo) lines.push(`GENERO : ${d.sexo}`);
        lines.push(`FECHA NACIMIENTO : ${d.feNacimiento ?? ""}`);
        if (d.depaNacimiento || d.provNacimiento || d.distNacimiento) {
            lines.push(`DEPARTAMENTO : ${d.depaNacimiento ?? ""}`);
            lines.push(`PROVINCIA : ${d.provNacimiento ?? ""}`);
            lines.push(`DISTRITO : ${d.distNacimiento ?? ""}`);
        }
        lines.push(`GRADO INSTRUCCION : ${d.gradoInstruccion ?? ""}`);
        lines.push(`ESTADO CIVIL : ${d.estadoCivil ?? ""}`);
        lines.push(`ESTATURA : ${d.estatura ?? ""}`);
        lines.push(`FECHA INSCRIPCION : ${d.feInscripcion ?? ""}`);
        lines.push(`FECHA EMISION : ${d.feEmision ?? ""}`);
        lines.push(`FECHA CADUCIDAD : ${d.feCaducidad ?? ""}`);
        lines.push(`FECHA FALLECIMIENTO : ${d.feFallecimiento ?? ""}`);
        lines.push(`PADRE : ${d.nomPadre ?? ""}`);
        lines.push(`MADRE : ${d.nomMadre ?? ""}`);
        // Dirección
        lines.push("DIRECCIÓN:");
        lines.push(`DEPARTAMENTO : ${d.depaDireccion ?? ""}`);
        lines.push(`PROVINCIA : ${d.provDireccion ?? ""}`);
        lines.push(`DISTRITO : ${d.distDireccion ?? ""}`);
        lines.push(`DIRECCION : ${d.desDireccion ?? ""}`);
        // Ubicación
        lines.push("UBICACION:");
        lines.push(`UBIGEO RENIEC : ${d.ubicacion?.ubigeo_reniec ?? ""}`);
        lines.push(`UBIGEO INEI : ${d.ubicacion?.ubigeo_inei ?? ""}`);
        lines.push(`UBIGEO SUNAT : ${d.ubicacion?.ubigeo_sunat ?? ""}`);
        lines.push(`CODIGO POSTAL : ${d.ubicacion?.codigo_postal ?? ""}`);
        // Actas
        lines.push("ACTAS REGISTRADAS:");
        lines.push(`MATRIMONIO : ${d.actasRegistradas?.MATRIMONIO ?? 0}`);
        lines.push(`NACIMIENTO : ${d.actasRegistradas?.NACIMIENTO ?? 0}`);
        lines.push(`DEFUNCION : ${d.actasRegistradas?.DEFUNCION ?? 0}`);
        
        // Familiares (resumen)
        if (Array.isArray(d.familiares) && d.familiares.length) {
            lines.push(`--- FAMILIARES (${d.familiares.length}) ---`);
            d.familiares.slice(0, 50).forEach(f => {
                lines.push(`NOMBRE : ${f.NOMBRE ?? ""}`);
                lines.push(`DNI : ${f.DNI ?? ""}`);
                lines.push(`VINCULO : ${f.VINCULO ?? ""}`);
                lines.push(`TIPO : ${f.TIPO ?? ""}`);
                lines.push("---");
            });
        }

        // Agregar info laboral resumida (hasta 20 registros)
        if (Array.isArray(d.infoLaboral) && d.infoLaboral.length) {
            lines.push("--- HISTORIAL LABORAL (resumen) ---");
            d.infoLaboral.slice(0, 50).forEach((r) => {
                lines.push(`DNI : ${d.nuDni ?? ""}`);
                lines.push(`RUC : ${r.RUC ?? ""}`);
                lines.push(`EMPRESA : ${r.EMPRESA ?? ""}`);
                lines.push(`SITUACION : ${r.SITUACION ?? ""}`);
                lines.push(`SUELDO : ${r.SUELDO ?? ""}`);
                lines.push(`PERIODO : ${r.PERIODO ?? ""}`);
                lines.push("---");
            });
        }
        
        // Teléfonos (resumen)
        if (Array.isArray(d.telefonos) && d.telefonos.length) {
            lines.push(`--- TELEFONOS (${d.telefonos.length}) ---`);
            d.telefonos.slice(0, 50).forEach(t => {
                lines.push(`TELEFONO : ${t.TELEFONO ?? ""}`);
                lines.push(`PLAN : ${t.PLAN ?? ""}`);
                lines.push(`FUENTE : ${t.FUENTE ?? ""}`);
                lines.push(`PERIODO : ${t.PERIODO ?? ""}`);
            });
        }
        
        // Cargos / empresas
        if (Array.isArray(d.cargos) && d.cargos.length) {
            lines.push("--- CARGOS Y EMPRESAS ---");
            d.cargos.slice(0, 50).forEach(c => {
                lines.push(`NOMBRE : ${d.apePaterno ?? ""} ${d.apeMaterno ?? ""} ${d.preNombres ?? ""}`.trim());
                lines.push(`RUC : ${c.RUC ?? ""}`);
                lines.push(`RAZON SOCIAL : ${c.RAZON_SOCIAL ?? ""}`);
                lines.push(`CARGO : ${c.CARGO ?? ""}`);
                lines.push(`DESDE : ${c.DESDE ?? ""}`);
                lines.push("---");
            });
        }
        return lines.join("\n");
    } catch (e) {
        return `DNI : ${d.nuDni ?? ""}\nInformación generada automáticamente.`;
    }
}

// ------------------- Static files -------------------
app.use("/public", express.static(PUBLIC_DIR));

// ------------------- Health / test endpoints -------------------
app.get("/status", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ------------------- Start server -------------------
app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en http://${HOST}:${PORT}`);
    console.log(`Prueba: http://localhost:${PORT}/generar-fichas-dni?dni=10001088`);
});
