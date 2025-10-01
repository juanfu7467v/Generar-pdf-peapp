/** * main.js 
 * Servidor Express completo para: 
 * - Consultar la API SEEKER / RENIEC (por DNI) 
 * - Generar fichas en imágenes (Jimp) organizadas por "hojas" 
 * - Combinar imágenes en un PDF (pdfkit) 
 * - Responder con JSON con estructura compatible: parts_received y urls.FILE 
 * * Instalar dependencias: 
 * npm i express axios jimp qrcode uuid pdfkit stream-to-buffer 
 * * Uso: 
 * node main.js 
 * Endpoint de ejemplo: 
 * http://localhost:3000/generar-fichas-dni?dni=10001088 
 * * NOTA: adapta la URL externa (API RENIEC / SEEKER) si hace falta. 
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
const AVATAR_MALE_URL = "https://i.imgur.com/7D2K6uH.png"; // Avatar masculino
const AVATAR_FEMALE_URL = "https://i.imgur.com/vHqJ9Uf.png"; // Avatar femenino
const APP_QR_URL = "https://www.socialcreator.com/consultapeapk#apps";
const REMOTE_API_BASE = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec"; // URL original del ejemplo

// ------------------- Utilidades Jimp / Formato ------------------- 
/** Genera una marca de agua ligera repetida */ 
const generarMarcaDeAgua = async (imagen, text = "SEEKER") => {
    const marca = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const stepX = 200;
    const stepY = 120;
    for (let x = 0; x < imagen.bitmap.width; x += stepX) {
        for (let y = 0; y < imagen.bitmap.height; y += stepY) {
            const angle = (Math.random() * 24) - 12;
            const textImg = new Jimp(220, 60, 0x00000000);
            textImg.print(font, 0, 0, text);
            textImg.rotate(angle);
            marca.composite(textImg, x, y, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.08, opacityDest: 1 });
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

/** Carga un avatar según el género y lo devuelve re-escalado */
const loadAvatar = async (genero) => {
    const url = genero?.toUpperCase().startsWith('F') ? AVATAR_FEMALE_URL : AVATAR_MALE_URL;
    try {
        const avatarBuf = (await axios.get(url, { responseType: "arraybuffer" })).data;
        const avatar = await Jimp.read(avatarBuf);
        avatar.resize(60, 60); // Tamaño del avatar
        return avatar;
    } catch (e) {
        console.error("Error al cargar avatar:", e.message);
        return null; // Retorna null si falla
    }
}

// ------------------- Plantilla generadora de "fichas" (imágenes) ------------------- 
/** * generarFicha: 
 * - dni: string 
 * - data: objeto con la info devuelta por la API 
 * - title: string (título en la imagen) 
 * - contentCallback: async function({imagen, helpers...}) -> para dibujar contenido específico 
 * * Devuelve el buffer PNG (Promise) 
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
    const headingSpacing = 44;
    const yStartContent = 260;

    // Carga de fuentes
    const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_10_WHITE);
    

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
    imagen.print(fontTitle, margin, 120, title);

    // separator vertical
    const separatorX = Math.floor(W / 2);
    new Jimp(2, H - 320, 0xFFFFFFFF, (err, line) => {
        if (!err) imagen.composite(line, separatorX, yStartContent - 60);
    });

    // helpers de impresión
    let yLeft = yStartContent;
    let yRight = yStartContent;

    const printFieldLeft = (label, value) => {
        const labelX = columnLeftX;
        const valX = labelX + 240;
        imagen.print(fontBold, labelX, yLeft, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valX, yLeft, columnWidthLeft - 240, `${value ?? "-"}`, lineHeight);
        yLeft = newY + 6;
        return yLeft;
    };

    const printFieldRight = (label, value) => {
        const labelX = columnRightX;
        const valX = labelX + 240;
        imagen.print(fontBold, labelX, yRight, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valX, yRight, columnWidthRight - 240, `${value ?? "-"}`, lineHeight);
        yRight = newY + 6;
        return yRight;
    };

    const printSingleColumn = (label, value, currentY, columnX, columnWidth) => {
        const labelX = columnX;
        const valX = labelX + 200;
        imagen.print(fontBold, labelX, currentY, `${label}:`);
        const newY = printWrappedText(imagen, fontData, valX, currentY, columnWidth - 200, `${value ?? "-"}`, lineHeight);
        return newY + 6;
    };

    // Ejecutar callback que dibuja contenido concreto
    await contentCallback({ 
        imagen, data, dni, yLeft, yRight, yStartContent, 
        columnLeftX, columnRightX, columnWidthLeft, columnWidthRight, 
        headingSpacing, fontHeading, fontBold, fontData, fontSmall,
        printFieldLeft, printFieldRight, printSingleColumn, 
        loadAvatar // Incluye la función de avatar
    });

    // Footer
    imagen.print(fontData, margin, H - 110, "Esta imagen es informativa. No constituye documento oficial. (SEEKER)");

    // Retorna buffer PNG
    return imagen.getBufferAsync(Jimp.MIME_PNG);
};

// ------------------- Fichas específicas (Datos Generales, Laboral, Teléfonos, Cargos, Familiares) ------------------- 
/** Ficha 1 - Datos Generales */ 
const generarFichaDatosGenerales = async (data, dni) => {
    return generarFicha(dni, data, `FICHA 1 - DATOS GENERALES - ${dni}`, async (ctx) => {
        const { imagen, data: d, columnLeftX, columnRightX, columnWidthRight, fontHeading, printFieldLeft, printFieldRight, yStartContent } = ctx;

        // FOTO (Columna derecha superior)
        let fotoY = yStartContent - 20;
        if (d.imagenes?.foto) {
            try {
                const buf = Buffer.from(d.imagenes.foto, "base64");
                const foto = await Jimp.read(buf);
                foto.resize(360, Jimp.AUTO);
                const fotoX = columnRightX + Math.floor((columnWidthRight - foto.bitmap.width) / 2);
                imagen.composite(foto, fotoX, fotoY);
                fotoY += foto.bitmap.height + 40; // Ajuste para el siguiente bloque
            } catch (e) { /* ignore foto errors */ }
        }

        // Otros datos columna derecha
        imagen.print(fontHeading, columnRightX, fotoY, "Otros Datos");
        let currentYRight = fotoY + ctx.headingSpacing;

        // Sobrescribir printFieldRight temporalmente para usar la nueva 'currentYRight'
        const printFieldRightCustom = (label, value) => {
            const labelX = columnRightX;
            const valX = labelX + 240;
            imagen.print(ctx.fontBold, labelX, currentYRight, `${label}:`);
            const newY = printWrappedText(imagen, ctx.fontData, valX, currentYRight, ctx.columnWidthRight - 240, `${value ?? "-"}`, ctx.lineHeight);
            currentYRight = newY + 6;
            return currentYRight;
        };

        printFieldRightCustom("País", d.pais);
        printFieldRightCustom("Grupo Votación", d.gpVotacion);
        printFieldRightCustom("Multas Electorales", d.multasElectorales);
        printFieldRightCustom("Multa Admin", d.multaAdmin);
        printFieldRightCustom("Fecha Actualización", d.feActualizacion);
        printFieldRightCustom("Cancelación", d.cancelacion);

        // Columna izquierda: datos RENIEC
        imagen.print(fontHeading, columnLeftX, yStartContent, "Datos Personales");
        ctx.yLeft = yStartContent + ctx.headingSpacing; // Mueve el inicio de impresión

        printFieldLeft("DNI", d.nuDni);
        printFieldLeft("Apellidos", `${d.apePaterno ?? ""} ${d.apeMaterno ?? ""} ${d.apCasada ?? ""}`.trim());
        printFieldLeft("Prenombres", d.preNombres);
        printFieldLeft("Género", d.sexo);
        printFieldLeft("Fecha Nac.", d.feNacimiento);
        printFieldLeft("Lugar Nac.", `${d.depaNacimiento ?? "-"} / ${d.provNacimiento ?? "-"} / ${d.distNacimiento ?? "-"}`);
        printFieldLeft("Estado Civil", d.estadoCivil);
        printFieldLeft("Grado Instrucción", d.gradoInstruccion);
        printFieldLeft("Estatura", d.estatura ? `${d.estatura} cm` : "-");
        printFieldLeft("Restricción", d.deRestriccion ?? "NINGUNA");

        // Fechas y familia
        imagen.print(fontHeading, columnLeftX, ctx.yLeft + 12, "Fechas y Familia");
        ctx.yLeft += ctx.headingSpacing + 12;
        printFieldLeft("Fecha Inscripción", d.feInscripcion);
        printFieldLeft("Fecha Emisión", d.feEmision);
        printFieldLeft("Fecha Caducidad", d.feCaducidad);
        printFieldLeft("Fecha Fallecimiento", d.feFallecimiento || "-");
        printFieldLeft("Padre", d.nomPadre);
        printFieldLeft("Madre", d.nomMadre);

        // Dirección y ubicaciones
        imagen.print(fontHeading, columnLeftX, ctx.yLeft + 12, "Dirección / Ubicación");
        ctx.yLeft += ctx.headingSpacing + 12;
        printFieldLeft("Dirección", d.desDireccion);
        printFieldLeft("Departamento (Dir)", d.depaDireccion);
        printFieldLeft("Provincia (Dir)", d.provDireccion);
        printFieldLeft("Distrito (Dir)", d.distDireccion);
        printFieldLeft("Ubigeo RENIEC", d.ubicacion?.ubigeo_reniec);
        printFieldLeft("Ubigeo INEI", d.ubicacion?.ubigeo_inei);
        printFieldLeft("Ubigeo SUNAT", d.ubicacion?.ubigeo_sunat);
        printFieldLeft("Código Postal", d.ubicacion?.codigo_postal);

        // Actas registradas (si existen)
        imagen.print(fontHeading, columnLeftX, ctx.yLeft + 12, "Actas Registradas");
        ctx.yLeft += ctx.headingSpacing + 12;
        printFieldLeft("Matrimonio", d.actasRegistradas?.MATRIMONIO ?? 0);
        printFieldLeft("Nacimiento", d.actasRegistradas?.NACIMIENTO ?? 0);
        printFieldLeft("Defunción", d.actasRegistradas?.DEFUNCION ?? 0);
    });
};

/** Genera páginas paginadas del historial laboral como buffers PNG */ 
const generarFichaLaboralPaginada = async (data, dni) => {
    const registros = Array.isArray(data.infoLaboral) ? data.infoLaboral : [];
    if (!registros.length) return [];

    const porPagina = 9; // Registros por página para un mejor espacio
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${p + 2} - HISTORIAL LABORAL - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, printSingleColumn, yStartContent, fontHeading, fontBold, fontSmall } = ctx;
            let currentY = yStartContent - 20;

            imagen.print(fontHeading, columnLeftX, currentY, `Historial Laboral (${registros.length} Registros)`);
            currentY += 56;

            for (const [i, r] of slice.entries()) {
                const numero = p * porPagina + i + 1;
                // Separador visual
                if (i > 0) {
                     new Jimp(imagen.bitmap.width - columnLeftX * 2, 1, 0xFFFFFF80, (err, line) => {
                         if (!err) imagen.composite(line, columnLeftX, currentY);
                     });
                     currentY += 6;
                }

                imagen.print(fontBold, columnLeftX, currentY, `${numero}. PERIODO: ${r.PERIODO ?? "-"}`);
                currentY += 28;
                currentY = printSingleColumn("Empresa", r.EMPRESA ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY = printSingleColumn("RUC", r.RUC ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY = printSingleColumn("Sueldo", r.SUELDO ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY = printSingleColumn("Situación", r.SITUACION ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY += 18;
            }
        });
        buffers.push(buf);
    }
    return buffers;
};


/** Genera páginas paginadas de teléfonos */ 
const generarFichaTelefonosPaginada = async (data, dni, fichaIndexStart) => {
    const registros = Array.isArray(data.telefonos) ? data.telefonos : [];
    if (!registros.length) return [];

    const porColumna = 10; // 10 registros por columna
    const porPagina = porColumna * 2; // 20 registros por página
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];
    
    // Altura aproximada de cada registro para el espaciado
    const registroHeight = 110; 

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${fichaIndexStart + p} - TELÉFONOS - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, columnRightX, columnWidthLeft, columnWidthRight, yStartContent, fontHeading, fontBold, fontSmall } = ctx;
            let yLeft = yStartContent - 20;
            let yRight = yStartContent - 20;

            imagen.print(fontHeading, columnLeftX, yLeft, `Contactos y Teléfonos (${registros.length})`);
            yLeft += 56;
            yRight = yLeft; // Asegura que las dos columnas empiecen a la misma altura

            for (const [i, r] of slice.entries()) {
                const esColumnaIzquierda = i < porColumna;
                const columnX = esColumnaIzquierda ? columnLeftX : columnRightX;
                const columnWidth = esColumnaIzquierda ? columnWidthLeft : columnWidthRight;
                let currentY = esColumnaIzquierda ? yLeft : yRight;

                const numero = p * porPagina + i + 1;
                
                // Separador visual
                if (i % porColumna !== 0 && i < porPagina && i !== 0) {
                     new Jimp(columnWidth, 1, 0xFFFFFF80, (err, line) => {
                         if (!err) imagen.composite(line, columnX, currentY);
                     });
                     currentY += 6;
                }

                imagen.print(fontBold, columnX, currentY, `${numero}. TEL: ${r.TELEFONO ?? "-"}`);
                currentY += 28;
                
                // Uso de fuente más pequeña para los detalles
                const valX = columnX + 100;
                const fieldWidth = columnWidth - 100;
                
                imagen.print(fontSmall, columnX, currentY, `Plan:`);
                printWrappedText(imagen, ctx.fontData, valX, currentY, fieldWidth, r.PLAN ?? "-", 20);
                currentY += 28;

                imagen.print(fontSmall, columnX, currentY, `Fuente:`);
                printWrappedText(imagen, ctx.fontData, valX, currentY, fieldWidth, r.FUENTE ?? "-", 20);
                currentY += 28;
                
                imagen.print(fontSmall, columnX, currentY, `Periodo:`);
                printWrappedText(imagen, ctx.fontData, valX, currentY, fieldWidth, r.PERIODO ?? "-", 20);
                currentY += 12; // Espacio extra

                if (esColumnaIzquierda) {
                    yLeft = currentY;
                } else {
                    yRight = currentY;
                }
            }
            // Asegurar que el callback no altere ctx.yLeft/yRight después de terminar.
            ctx.yLeft = yLeft;
            ctx.yRight = yRight;
        });
        buffers.push(buf);
    }
    return buffers;
};

/** Genera páginas paginadas de Cargos / Empresas */ 
const generarFichaCargosPaginada = async (data, dni, fichaIndexStart) => {
    const registros = Array.isArray(data.cargos) ? data.cargos : [];
    if (!registros.length) return [];

    const porPagina = 8; // Menos registros por página ya que la data es más larga
    const total = Math.ceil(registros.length / porPagina);
    const buffers = [];

    for (let p = 0; p < total; p++) {
        const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${fichaIndexStart + p} - CARGOS / EMPRESAS - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, printSingleColumn, yStartContent, fontHeading, fontBold, fontSmall } = ctx;
            let currentY = yStartContent - 20;

            imagen.print(fontHeading, columnLeftX, currentY, `Cargos y Vínculos Empresariales (${registros.length})`);
            currentY += 56;

            for (const [i, r] of slice.entries()) {
                const numero = p * porPagina + i + 1;
                // Separador visual
                if (i > 0) {
                     new Jimp(imagen.bitmap.width - columnLeftX * 2, 1, 0xFFFFFF80, (err, line) => {
                         if (!err) imagen.composite(line, columnLeftX, currentY);
                     });
                     currentY += 6;
                }

                imagen.print(fontBold, columnLeftX, currentY, `${numero}. RUC: ${r.RUC ?? "-"}`);
                currentY += 28;
                currentY = printSingleColumn("Razón Social", r.RAZON_SOCIAL ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY = printSingleColumn("Cargo", r.CARGO ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY = printSingleColumn("Desde", r.DESDE ?? "-", currentY, columnLeftX + 30, imagen.bitmap.width - columnLeftX * 2 - 30);
                currentY += 18;
            }
        });
        buffers.push(buf);
    }
    return buffers;
};

/** Genera páginas paginadas de Familiares / Vinculos con diseño en dos columnas */
const generarFichaFamiliaresPaginada = async (data, dni, fichaIndexStart) => {
    // Si la API no tiene un campo 'familiares' o 'vinculos', usamos un dummy o lo obtenemos de otra fuente si existe.
    // Asumo que la data de la API *podría* tener un campo 'vinculos' o similar. Si no existe, se usa un array vacío.
    const registros = Array.isArray(data.vinculos) ? data.vinculos : []; 
    
    // Si la data del usuario tiene `infoLaboral`, podría ser un familiar/socio en una empresa, pero no es el mejor fit.
    // Vamos a simular un array de "familiares" si no existe `data.vinculos` para el ejemplo, basado en un objeto que sé que existe en la data de ejemplo.
    if (!registros.length) {
        // Simulamos un array de familiares/vinculos para propósitos de demostración.
        // En una implementación real, esto vendría de la API.
        const d = data;
        if (d.nomPadre || d.nomMadre || d.conyuge || d.hijos) {
             // Esta data es la que aparece en la primera ficha, pero la duplicamos aquí para la ficha familiar.
             // Para un caso real con más data de la API, se usaría `data.familiares` o similar.
             registros.push({
                 NOMBRE: d.nomPadre,
                 DNI_O_RUC: 'N/A', // Asumimos que la API nos daría DNI
                 PARENTESCO: 'PADRE',
                 GENERO: 'M',
                 INFORMACION: 'Información de acta de nacimiento.'
             });
             registros.push({
                 NOMBRE: d.nomMadre,
                 DNI_O_RUC: 'N/A',
                 PARENTESCO: 'MADRE',
                 GENERO: 'F',
                 INFORMACION: 'Información de acta de nacimiento.'
             });
        }
    }
    
    // Filtramos los registros vacíos creados para simulación
    const familiares = registros.filter(r => r.NOMBRE); 

    if (!familiares.length) return [];

    const porColumna = 5; // 5 registros por columna
    const porPagina = porColumna * 2; // 10 registros por página
    const total = Math.ceil(familiares.length / porPagina);
    const buffers = [];
    
    const registroHeight = 160; 

    for (let p = 0; p < total; p++) {
        const slice = familiares.slice(p * porPagina, (p + 1) * porPagina);
        const buf = await generarFicha(dni, data, `FICHA ${fichaIndexStart + p} - VÍNCULOS / FAMILIARES - Pág ${p + 1}/${total} - ${dni}`, async (ctx) => {
            const { imagen, columnLeftX, columnRightX, columnWidthLeft, columnWidthRight, yStartContent, fontHeading, fontBold, fontSmall, fontData, loadAvatar } = ctx;
            let yLeft = yStartContent - 20;
            let yRight = yStartContent - 20;

            imagen.print(fontHeading, columnLeftX, yLeft, `Familiares y Vínculos (${familiares.length})`);
            yLeft += 56;
            yRight = yLeft; // Asegura que las dos columnas empiecen a la misma altura

            for (const [i, r] of slice.entries()) {
                const esColumnaIzquierda = i < porColumna;
                const columnX = esColumnaIzquierda ? columnLeftX : columnRightX;
                const columnWidth = esColumnaIzquierda ? columnWidthLeft : columnWidthRight;
                let currentY = esColumnaIzquierda ? yLeft : yRight;

                const numero = p * porPagina + i + 1;
                const avatarSize = 60;
                const textStartX = columnX + avatarSize + 10;
                const textWidth = columnWidth - avatarSize - 10;
                
                // Separador visual
                if (i % porColumna !== 0 && i < porPagina && i !== 0) {
                     new Jimp(columnWidth, 1, 0xFFFFFF80, (err, line) => {
                         if (!err) imagen.composite(line, columnX, currentY);
                     });
                     currentY += 6;
                }
                
                // Cargar y dibujar avatar
                const avatar = await loadAvatar(r.GENERO);
                if (avatar) {
                    imagen.composite(avatar, columnX, currentY);
                }

                // Título del registro
                imagen.print(fontBold, textStartX, currentY, `${numero}. ${r.NOMBRE ?? "-"}`);
                currentY += 20;
                
                // Detalles
                let valX = textStartX + 100;
                let fieldWidth = textWidth - 100;

                imagen.print(fontSmall, textStartX, currentY, `Parentesco:`);
                printWrappedText(imagen, fontData, valX, currentY, fieldWidth, r.PARENTESCO ?? "-", 20);
                currentY += 28;

                imagen.print(fontSmall, textStartX, currentY, `DNI/RUC:`);
                printWrappedText(imagen, fontData, valX, currentY, fieldWidth, r.DNI_O_RUC ?? "-", 20);
                currentY += 28;

                imagen.print(fontSmall, textStartX, currentY, `Información:`);
                printWrappedText(imagen, fontData, valX, currentY, fieldWidth, r.INFORMACION ?? "-", 20);
                currentY += 12;

                if (esColumnaIzquierda) {
                    yLeft = currentY;
                } else {
                    yRight = currentY;
                }
            }
            // Asegurar que el callback no altere ctx.yLeft/yRight después de terminar.
            ctx.yLeft = yLeft;
            ctx.yRight = yRight;
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
        const doc = new PDFDocument({ autoFirstPage: false });
        const writeStream = fs.createWriteStream(rutaArchivo);
        doc.pipe(writeStream);
        
        // El tamaño de la imagen PNG es 1080x1920. El tamaño A4 es aprox 794x1123 pt.
        // Hacemos un fit a A4 y ajustamos la imagen para que quede centrada o al top-left si es necesario.
        // Usaremos el tamaño de página 1080x1920 y escalamos la imagen 1:1 para evitar el auto-resize a A4 de pdfkit
        const pageW = 1080;
        const pageH = 1920; 

        pngBuffers.forEach((buf) => {
            // Agregar nueva página con el tamaño de la imagen para evitar escalado
            doc.addPage({ size: [pageW, pageH], margin: 0 }); 
            try {
                // Dibujar la imagen sin escalado, cubriendo toda la página
                doc.image(buf, 0, 0, { width: pageW, height: pageH }); 
            } catch (e) {
                // si falla dibujar, añadimos una página en blanco
                console.error("Error dibujando imagen en PDF:", e.message);
            }
        });

        doc.end();
        writeStream.on("finish", () => resolve(nombreArchivo));
        writeStream.on("error", (e) => reject(e));
    });
};

// ------------------- Endpoint principal ------------------- 
/** * /generar-fichas-dni?dni=... 
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

        // 2) Generar ficha principal (datos generales)
        const bufferFichaPrincipal = await generarFichaDatosGenerales(data, dni);

        // 3) Generar fichas paginadas (laboral, familiares, teléfonos, cargos)
        
        // El índice de la ficha debe ser correlativo
        let fichaIndex = 2; 
        
        const buffersLaborales = await generarFichaLaboralPaginada(data, dni); // array de buffers
        const buffersFamiliares = await generarFichaFamiliaresPaginada(data, dni, fichaIndex + buffersLaborales.length);
        const buffersTelefonos = await generarFichaTelefonosPaginada(data, dni, fichaIndex + buffersLaborales.length + buffersFamiliares.length);
        const buffersCargos = await generarFichaCargosPaginada(data, dni, fichaIndex + buffersLaborales.length + buffersFamiliares.length + buffersTelefonos.length);

        // 4) Consolidar orden
        const todos = [bufferFichaPrincipal, ...buffersLaborales, ...buffersFamiliares, ...buffersTelefonos, ...buffersCargos];

        if (!todos.length) return res.status(500).json({ error: "No se pudo generar contenido con los datos disponibles." });

        // 5) Combinar en PDF
        const nombrePDF = await combinarPNGsEnPDF(todos, dni);
        const urlPdf = `${req.protocol}://${req.get("host")}/public/${nombrePDF}`;

        // 6) Guardar también la primera imagen PNG por compatibilidad (opcional)
        const primeraPNGName = `ficha_${dni}_${uuidv4()}.png`;
        const primeraPNGPath = path.join(PUBLIC_DIR, primeraPNGName);
        await fs.promises.writeFile(primeraPNGPath, bufferFichaPrincipal);

        // detalle contenido human-friendly
        let currentPage = 1;
        const detalleContenido = [];

        detalleContenido.push(`Página ${currentPage++}: Datos Generales, Foto, Familia y Ubicación`);
        
        buffersLaborales.forEach((_, i) => {
            detalleContenido.push(`Página ${currentPage++}: Historial Laboral - Parte ${i + 1}`);
        });
        
        buffersFamiliares.forEach((_, i) => {
            detalleContenido.push(`Página ${currentPage++}: Vínculos / Familiares - Parte ${i + 1}`);
        });
        
        buffersTelefonos.forEach((_, i) => {
            detalleContenido.push(`Página ${currentPage++}: Teléfonos - Parte ${i + 1}`);
        });
        
        buffersCargos.forEach((_, i) => {
            detalleContenido.push(`Página ${currentPage++}: Cargos / Empresas - Parte ${i + 1}`);
        });


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
        
        // Familiares / Vínculos (resumen)
        const registrosFamiliares = Array.isArray(d.vinculos) ? d.vinculos : [];
        if (registrosFamiliares.length) {
            lines.push(`--- FAMILIARES / VINCULOS (${registrosFamiliares.length}) ---`);
            registrosFamiliares.slice(0, 50).forEach(r => {
                lines.push(`NOMBRE : ${r.NOMBRE ?? ""}`);
                lines.push(`PARENTESCO : ${r.PARENTESCO ?? ""}`);
                lines.push(`DNI/RUC : ${r.DNI_O_RUC ?? ""}`);
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
