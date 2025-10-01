/**
 * main.js (versión rediseñada)
 * Servidor Express para generar fichas visuales y PDF a partir de datos RENIEC / SEEKER
 * 
 * Mejoras:
 * - Código modular y reutilizable
 * - Renderizador genérico para listas (una o dos columnas)
 * - Encabezados/footers uniformes
 * - Estilo visual profesional con emojis
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

// ------------------- CONFIGURACIÓN -------------------
const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";
const REMOTE_API_BASE = "https://banckend-poxyv1-cosultape-masitaprex.fly.dev/reniec";

const EMOJIS = {
  DNI: "💳", Nombre: "👤", Sexo: "⚧️", Nacimiento: "🎂", Direccion: "🏠",
  Padre: "👨", Madre: "👩", Tel: "📞", Trabajo: "💼", Cargo: "🏢"
};

// ------------------- HELPERS -------------------
async function generarMarcaDeAgua(imagen, text = "SEEKER") {
  const marca = await Jimp.read(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
  const stepX = 250, stepY = 150;
  for (let x = 0; x < imagen.bitmap.width; x += stepX) {
    for (let y = 0; y < imagen.bitmap.height; y += stepY) {
      const txt = new Jimp(300, 80, 0x00000000);
      txt.print(font, 0, 0, text);
      txt.rotate((Math.random() * 24) - 12);
      marca.composite(txt, x, y, { opacitySource: 0.05 });
    }
  }
  return marca;
}

function printWrappedText(img, font, x, y, maxWidth, text, lineHeight = 28) {
  const words = String(text || "").split(/\s+/);
  let line = "", curY = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (Jimp.measureText(font, test) > maxWidth && line) {
      img.print(font, x, curY, line.trim());
      curY += lineHeight;
      line = w;
    } else line = test;
  }
  if (line) img.print(font, x, curY, line.trim());
  return curY + lineHeight;
}

// ------------------- GENERADOR BASE -------------------
async function generarFichaBase(dni, title, drawContent) {
  const W = 1080, H = 1920, margin = 48;
  const img = new Jimp(W, H, "#0b2b3a");

  // Cargar fuentes
  const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const fontText = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  // Marca de agua
  const marca = await generarMarcaDeAgua(img);
  img.composite(marca, 0, 0);

  // Encabezado con icono
  try {
    const iconBuf = (await axios.get(APP_ICON_URL, { responseType: "arraybuffer" })).data;
    const icon = await Jimp.read(iconBuf);
    icon.resize(160, Jimp.AUTO);
    img.composite(icon, W / 2 - 80, 20);
  } catch {}

  img.print(fontTitle, margin, 200, title);

  // Contenido personalizado
  await drawContent(img, { W, H, margin, fontText });

  // Footer
  img.print(fontText, margin, H - 60, "Generado por SEEKER · Uso informativo");

  return img.getBufferAsync(Jimp.MIME_PNG);
}

// ------------------- RENDER DE LISTAS -------------------
async function renderListaPaginada(dni, titulo, registros, options = {}) {
  const { columnas = 1, porPagina = 10, labels = {} } = options;
  if (!Array.isArray(registros) || !registros.length) return [];

  const total = Math.ceil(registros.length / porPagina);
  const buffers = [];

  for (let p = 0; p < total; p++) {
    const slice = registros.slice(p * porPagina, (p + 1) * porPagina);
    const buf = await generarFichaBase(dni, `${titulo} (${p + 1}/${total})`, async (img, ctx) => {
      let y = 350;
      for (const [i, reg] of slice.entries()) {
        img.print(ctx.fontText, ctx.margin, y, `${i + 1}. ${labels.nombre ? reg[labels.nombre] : JSON.stringify(reg)}`);
        y += 40;
      }
    });
    buffers.push(buf);
  }
  return buffers;
}

// ------------------- ENDPOINT -------------------
app.get("/generar-fichas-dni", async (req, res) => {
  try {
    const dni = req.query.dni;
    if (!dni) return res.status(400).json({ error: "Falta DNI" });

    // 1. Obtener datos
    const { data } = await axios.get(`${REMOTE_API_BASE}?dni=${dni}`);

    // 2. Generar fichas
    const fichas = [];
    fichas.push(await generarFichaBase(dni, `FICHA DATOS GENERALES - ${dni}`, async (img, ctx) => {
      let y = 350;
      img.print(ctx.fontText, ctx.margin, y, `${EMOJIS.DNI} DNI: ${data.nuDni}`);
      y += 40;
      img.print(ctx.fontText, ctx.margin, y, `${EMOJIS.Nombre} Nombre: ${data.preNombres} ${data.apePaterno}`);
    }));

    const familiares = await renderListaPaginada(dni, "Familiares", data.familiares, { porPagina: 8, labels: { nombre: "NOMBRE" } });
    const telefonos = await renderListaPaginada(dni, "Teléfonos", data.telefonos, { porPagina: 10, labels: { nombre: "TELEFONO" } });
    fichas.push(...familiares, ...telefonos);

    // 3. Guardar en PDF
    const fileId = uuidv4();
    const pdfPath = path.join(PUBLIC_DIR, `${fileId}.pdf`);
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    for (const buf of fichas) {
      const img = await Jimp.read(buf);
      doc.addPage({ size: [img.bitmap.width, img.bitmap.height] });
      doc.image(buf, 0, 0, { width: img.bitmap.width, height: img.bitmap.height });
    }

    doc.end();
    stream.on("finish", () => {
      res.json({ url: `/public/${fileId}.pdf`, parts_received: fichas.length });
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error generando fichas" });
  }
});

app.listen(PORT, HOST, () => console.log(`Servidor activo en http://${HOST}:${PORT}`));
