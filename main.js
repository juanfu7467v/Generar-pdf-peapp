const express = require("express");
const axios = require("axios");
const { PDFDocument, rgb } = require("pdf-lib");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");
const Jimp = require("jimp");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Se usa una función asíncrona para inicializar la app de forma segura
async function initializeApp() {
  try {
    // Intenta crear el directorio 'public' de forma recursiva.
    // Si ya existe, no hará nada y no lanzará un error.
    await fs.promises.mkdir(PUBLIC_DIR, { recursive: true });
    console.log("Directorio 'public' asegurado.");
  } catch (err) {
    console.error("Error al asegurar el directorio 'public':", err);
    // En caso de que el error no sea 'EEXIST', salimos del proceso
    if (err.code !== 'EEXIST') {
      process.exit(1);
    }
  }

  // URLs de las APIs
  const API_URLS = {
    reniec: (dni) => `https://poxy-production.up.railway.app/reniec?dni=${dni}&source=database`,
    matrimonios: (dni) => `https://poxy-production.up.railway.app/matrimonios?dni=${dni}`,
    telefonia: (dni) => `https://poxy-production.up.railway.app/telefonia-doc?documento=${dni}`,
    correos: (dni) => `https://poxy-production.up.railway.app/correos?dni=${dni}`,
    sueldos: (dni) => `https://poxy-production.up.railway.app/sueldos?dni=${dni}`,
    trabajos: (dni) => `https://poxy-production.up.railway.app/trabajos?dni=${dni}`,
    consumos: (dni) => `https://poxy-production.up.railway.app/consumos?dni=${dni}`,
    arbol: (dni) => `https://poxy-production.up.railway.app/arbol?dni=${dni}`,
    familia: (dni) => `https://poxy-production.up.railway.app/familia1?dni=${dni}`,
    empresas: (dni) => `https://poxy-production.up.railway.app/empresas?dni=${dni}`,
  };

  // Fuente de logo e icono
  const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";

  // Colores del tema detective/RENIEC
  const COLORS = {
    background: rgb(0.05, 0.15, 0.35),      // Azul oscuro RENIEC
    sectionBg: rgb(0.1, 0.2, 0.4),         // Azul medio para secciones
    textPrimary: rgb(1, 1, 1),             // Blanco
    textSecondary: rgb(0.8, 0.9, 1),       // Azul claro
    accent: rgb(0.2, 0.6, 1),              // Azul brillante
    border: rgb(0.3, 0.5, 0.8),            // Azul medio para bordes
    success: rgb(0.2, 0.8, 0.4),           // Verde
    warning: rgb(1, 0.8, 0.2),             // Amarillo
    info: rgb(0.1, 0.7, 0.9)               // Azul información
  };

  app.get("/generar-ficha-pdf", async (req, res) => {
    const { dni } = req.query;
    if (!dni) {
      return res.status(400).json({ error: "Falta el parámetro DNI" });
    }

    try {
      // Obtenemos los datos de todas las APIs en paralelo
      const [
        reniecData,
        matrimoniosData,
        telefoniaData,
        correosData,
        sueldosData,
        trabajosData,
        consumosData,
        arbolData,
        empresasData,
      ] = await Promise.all([
        axios.get(API_URLS.reniec(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.matrimonios(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.telefonia(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.correos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.sueldos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.trabajos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.consumos(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.arbol(dni)).catch(() => ({ data: { result: null } })),
        axios.get(API_URLS.empresas(dni)).catch(() => ({ data: { result: null } })),
      ]).then(responses => responses.map(res => res.data?.result));

      // Si no hay datos básicos de RENIEC, se devuelve un error 404
      if (!reniecData) {
        return res.status(404).json({ error: "No se encontró información para el DNI ingresado." });
      }

      // Crear un nuevo documento PDF
      const pdfDoc = await PDFDocument.create();
      let page = pdfDoc.addPage();
      const { width, height } = page.getSize();
      const margin = 40;
      let y = height - margin;

      // Aplicar fondo azul a toda la página
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: height,
        color: COLORS.background,
      });

      // Función para dibujar recuadros de sección
      const drawSectionBox = (x, y, boxWidth, boxHeight) => {
        // Fondo de la sección
        page.drawRectangle({
          x: x,
          y: y - boxHeight,
          width: boxWidth,
          height: boxHeight,
          color: COLORS.sectionBg,
        });
        
        // Borde de la sección
        page.drawRectangle({
          x: x,
          y: y - boxHeight,
          width: boxWidth,
          height: boxHeight,
          borderColor: COLORS.border,
          borderWidth: 2,
        });
      };

      // Función para dibujar líneas conectoras
      const drawConnectorLine = (x1, y1, x2, y2, color = COLORS.border) => {
        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: 1,
          color: color,
        });
      };

      // Variables para el control de posición
      let currentY = y;
      const sectionWidth = width - (margin * 2);
      const contentMargin = margin + 15;

      // Función mejorada para dibujar texto
      const drawText = (text, x, size, isBold = false, color = COLORS.textPrimary, maxWidth = null) => {
        if (currentY < margin + 50) {
          page = pdfDoc.addPage();
          // Aplicar fondo azul a la nueva página
          page.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: height,
            color: COLORS.background,
          });
          currentY = height - margin;
        }

        const fontName = isBold ? "Helvetica-Bold" : "Helvetica";
        const font = pdfDoc.embedStandardFont(fontName);
        
        // Dividir texto si es muy largo
        if (maxWidth && text.length > 80) {
          const words = text.split(' ');
          let line = '';
          for (const word of words) {
            const testLine = line + word + ' ';
            if (testLine.length > 80) {
              if (line) {
                page.drawText(line.trim(), {
                  x: x,
                  y: currentY,
                  size: size,
                  font: font,
                  color: color,
                });
                currentY -= size * 1.4;
                line = word + ' ';
              }
            } else {
              line = testLine;
            }
          }
          if (line) {
            page.drawText(line.trim(), {
              x: x,
              y: currentY,
              size: size,
              font: font,
              color: color,
            });
          }
        } else {
          page.drawText(text, {
            x: x,
            y: currentY,
            size: size,
            font: font,
            color: color,
          });
        }
        currentY -= size * 1.5;
      };

      // Función para dibujar secciones con estilo detective
      const drawSection = (title, data, icon = "●") => {
        if (data && (typeof data === 'object' ? Object.keys(data).length > 0 : data.length > 0)) {
          currentY -= 20;
          
          // Calcular altura de la sección
          const sectionHeight = 40;
          
          // Dibujar recuadro de sección
          drawSectionBox(margin, currentY + 10, sectionWidth, sectionHeight);
          
          // Dibujar línea conectora superior
          drawConnectorLine(margin, currentY + 10, width - margin, currentY + 10, COLORS.accent);
          
          // Título de la sección con icono
          drawText(`${icon} ${title.toUpperCase()}`, contentMargin, 14, true, COLORS.accent);
          currentY -= 10;
          
          // Línea separadora
          drawConnectorLine(contentMargin, currentY + 5, width - contentMargin, currentY + 5, COLORS.border);
          currentY -= 5;
        }
      };

      // Función para dibujar pares clave-valor con estilo detective
      const drawKeyValuePair = (label, value, level = 0) => {
        const indent = contentMargin + (level * 20);
        const bulletColor = level === 0 ? COLORS.info : COLORS.textSecondary;
        
        // Bullet point
        drawText("▸", indent, 10, false, bulletColor);
        
        // Etiqueta
        drawText(`${label}:`, indent + 15, 10, true, COLORS.textSecondary);
        
        // Valor con línea conectora
        const valueText = `${value || "NO DISPONIBLE"}`;
        const valueColor = value ? COLORS.textPrimary : COLORS.warning;
        
        // Línea conectora entre etiqueta y valor
        drawConnectorLine(indent + 15, currentY + 8, indent + 25, currentY + 8, COLORS.border);
        
        drawText(`  ${valueText}`, indent + 30, 10, false, valueColor, sectionWidth - 100);
      };

      // Header con logo y título principal
      try {
        const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
        const mainIcon = await Jimp.read(iconBuffer);
        const pngImage = await pdfDoc.embedPng(await mainIcon.getBufferAsync(Jimp.MIME_PNG));
        
        // Fondo del header
        page.drawRectangle({
          x: 0,
          y: height - 120,
          width: width,
          height: 120,
          color: COLORS.sectionBg,
        });
        
        // Logo
        page.drawImage(pngImage, {
          x: width - 130,
          y: height - 110,
          width: 80,
          height: 80,
        });
        
        // Líneas decorativas del header
        drawConnectorLine(margin, height - 40, width - margin, height - 40, COLORS.accent);
        drawConnectorLine(margin, height - 120, width - margin, height - 120, COLORS.accent);
        
      } catch (error) {
        console.error("Error al cargar el icono:", error);
      }

      // Título principal con estilo detective
      currentY = height - 60;
      drawText("🔍 FICHA DE INVESTIGACIÓN PERSONAL", margin, 20, true, COLORS.accent);
      drawText(`📋 EXPEDIENTE: ${dni}`, margin, 12, false, COLORS.info);
      currentY -= 30;

      // Datos Personales
      drawSection("DATOS PERSONALES", reniecData, "🆔");
      if (reniecData) {
        drawKeyValuePair("DNI", reniecData.nuDni);
        drawKeyValuePair("APELLIDOS", `${reniecData.apePaterno} ${reniecData.apeMaterno} ${reniecData.apCasada || ''}`.trim());
        drawKeyValuePair("PRENOMBRES", reniecData.preNombres);
        drawKeyValuePair("NACIMIENTO", reniecData.feNacimiento);
        drawKeyValuePair("SEXO", reniecData.sexo);
        drawKeyValuePair("ESTADO CIVIL", reniecData.estadoCivil);
        drawKeyValuePair("ESTATURA", `${reniecData.estatura || "NO REGISTRADO"} cm`);
        drawKeyValuePair("GRADO INSTRUCCIÓN", reniecData.gradoInstruccion);
        drawKeyValuePair("RESTRICCIÓN", reniecData.deRestriccion || "NINGUNA");
        drawKeyValuePair("DONACIÓN ÓRGANOS", reniecData.donaOrganos);
        drawKeyValuePair("EMISIÓN", reniecData.feEmision);
        drawKeyValuePair("CADUCIDAD", reniecData.feCaducidad);
        drawKeyValuePair("FALLECIMIENTO", reniecData.feFallecimiento || "NO REGISTRADO");
      }

      // Datos de Dirección
      drawSection("UBICACIÓN GEOGRÁFICA", reniecData, "📍");
      if (reniecData) {
        drawKeyValuePair("DIRECCIÓN", reniecData.desDireccion);
        drawKeyValuePair("DEPARTAMENTO", reniecData.depaDireccion);
        drawKeyValuePair("PROVINCIA", reniecData.provDireccion);
        drawKeyValuePair("DISTRITO", reniecData.distDireccion);
        drawKeyValuePair("UBIGEO RENIEC", reniecData.ubicacion?.ubigeo_reniec);
        drawKeyValuePair("UBIGEO INEI", reniecData.ubicacion?.ubigeo_inei);
      }

      // Padres
      drawSection("INFORMACIÓN FAMILIAR", reniecData, "👨‍👩‍👧‍👦");
      if (reniecData) {
        drawKeyValuePair("PADRE", reniecData.nomPadre || "NO REGISTRADO");
        drawKeyValuePair("MADRE", reniecData.nomMadre || "NO REGISTRADO");
      }

      // Matrimonios
      drawSection("REGISTRO MATRIMONIAL", matrimoniosData?.coincidences, "💒");
      if (matrimoniosData?.coincidences?.length > 0) {
        matrimoniosData.coincidences.forEach((matrimonio, index) => {
          currentY -= 5;
          drawText(`▣ MATRIMONIO ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("CÓNYUGE", `${matrimonio.nombres} ${matrimonio.apellido_paterno} ${matrimonio.apellido_materno || ""}`.trim(), 1);
          drawKeyValuePair("DOCUMENTO", matrimonio.doc, 1);
          drawKeyValuePair("FECHA", matrimonio.fecha, 1);
          drawKeyValuePair("LUGAR", matrimonio.lugar, 1);
          currentY -= 10;
        });
      }

      // Telefonía
      drawSection("REGISTRO TELEFÓNICO", telefoniaData?.coincidences, "📞");
      if (telefoniaData?.coincidences?.length > 0) {
        telefoniaData.coincidences.forEach((tel, index) => {
          currentY -= 5;
          drawText(`▣ LÍNEA ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("TELÉFONO", tel.telefono, 1);
          drawKeyValuePair("OPERADOR", tel.fuente, 1);
          drawKeyValuePair("PLAN", tel.plan || "NO ESPECIFICADO", 1);
          drawKeyValuePair("PERIODO", tel.periodo || "NO ESPECIFICADO", 1);
          currentY -= 10;
        });
      }

      // Correos Electrónicos
      drawSection("REGISTRO DE CORREOS", correosData?.coincidences, "📧");
      if (correosData?.coincidences?.length > 0) {
        correosData.coincidences.forEach((correo, index) => {
          currentY -= 5;
          drawText(`▣ CORREO ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("EMAIL", correo.correo, 1);
          drawKeyValuePair("FUENTE", correo.fuente, 1);
          drawKeyValuePair("FECHA", correo.fecha || "NO ESPECIFICADA", 1);
          currentY -= 10;
        });
      }

      // Sueldos
      drawSection("REGISTRO SALARIAL", sueldosData?.coincidences, "💰");
      if (sueldosData?.coincidences?.length > 0) {
        sueldosData.coincidences.forEach((sueldo, index) => {
          currentY -= 5;
          drawText(`▣ EMPLEO ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("EMPRESA", `${sueldo.empresa} (RUC: ${sueldo.ruc})`, 1);
          drawKeyValuePair("SUELDO", `S/ ${sueldo.sueldo}`, 1);
          drawKeyValuePair("PERIODO", sueldo.periodo, 1);
          currentY -= 10;
        });
      }

      // Trabajos
      drawSection("HISTORIAL LABORAL", trabajosData?.coincidences, "💼");
      if (trabajosData?.coincidences?.length > 0) {
        trabajosData.coincidences.forEach((trabajo, index) => {
          currentY -= 5;
          drawText(`▣ TRABAJO ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("EMPRESA", `${trabajo.rz} (RUC: ${trabajo.ruc})`, 1);
          drawKeyValuePair("INICIO", trabajo.fip, 1);
          drawKeyValuePair("FIN", trabajo.ffp, 1);
          currentY -= 10;
        });
      }

      // Consumos
      drawSection("REGISTRO DE CONSUMOS", consumosData?.coincidences, "🛒");
      if (consumosData?.coincidences?.length > 0) {
        consumosData.coincidences.forEach((consumo, index) => {
          currentY -= 5;
          drawText(`▣ TRANSACCIÓN ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("EMISOR", `${consumo.razonSocial} (RUC: ${consumo.numRucEmisor})`, 1);
          drawKeyValuePair("MONTO", `S/ ${consumo.monto}`, 1);
          drawKeyValuePair("FECHA", consumo.fecha, 1);
          currentY -= 10;
        });
      }

      // Árbol Genealógico
      drawSection("ÁRBOL GENEALÓGICO", arbolData?.coincidences, "🌳");
      if (arbolData?.coincidences?.length > 0) {
        arbolData.coincidences.forEach((relacion, index) => {
          currentY -= 5;
          drawText(`▣ RELACIÓN ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("TIPO", relacion.tipo, 1);
          drawKeyValuePair("NOMBRE", `${relacion.nom} ${relacion.ap} ${relacion.am || ""}`.trim(), 1);
          drawKeyValuePair("DNI", relacion.dni, 1);
          drawKeyValuePair("VERIFICACIÓN", relacion.verificacion_relacion, 1);
          currentY -= 10;
        });
      }

      // Empresas
      drawSection("EMPRESAS RELACIONADAS", empresasData?.coincidences, "🏢");
      if (empresasData?.coincidences?.length > 0) {
        empresasData.coincidences.forEach((empresa, index) => {
          currentY -= 5;
          drawText(`▣ EMPRESA ${index + 1}`, contentMargin, 11, true, COLORS.info);
          drawKeyValuePair("RAZÓN SOCIAL", `${empresa.razon_social} (RUC: ${empresa.ruc})`, 1);
          drawKeyValuePair("CARGO", empresa.cargo, 1);
          drawKeyValuePair("DESDE", empresa.desde, 1);
          currentY -= 10;
        });
      }

      // Pie de página con estilo detective
      if (currentY < margin + 80) {
        page = pdfDoc.addPage();
        // Aplicar fondo azul a la nueva página
        page.drawRectangle({
          x: 0,
          y: 0,
          width: width,
          height: height,
          color: COLORS.background,
        });
        currentY = height - margin;
      }
      
      // Fondo del footer
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: 80,
        color: COLORS.sectionBg,
      });
      
      // Líneas decorativas del footer
      drawConnectorLine(margin, 70, width - margin, 70, COLORS.accent);
      drawConnectorLine(margin, 10, width - margin, 10, COLORS.accent);
      
      currentY = 55;
      drawText("🔍 FUENTE: www.socialcreator.com/consultapeapk", margin, 9, false, COLORS.textSecondary);
      drawText("⚖️ DOCUMENTO INFORMATIVO - SIN VALIDEZ LEGAL OFICIAL", margin, 9, false, COLORS.warning);
      drawText(`📅 GENERADO: ${new Date().toLocaleString('es-PE')}`, margin, 9, false, COLORS.textSecondary);

      // Guardar el PDF y enviar la URL
      const pdfBytes = await pdfDoc.save();
      const nombreArchivo = `ficha_detective_${dni}_${uuidv4()}.pdf`;
      const rutaPDF = path.join(PUBLIC_DIR, nombreArchivo);
      await fs.promises.writeFile(rutaPDF, pdfBytes);

      const url = `${req.protocol}://${req.get("host")}/public/${nombreArchivo}`;
      res.json({ message: "Ficha generada en PDF con diseño detective/RENIEC", url });

    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Error al generar la ficha en PDF", detalle: error.message });
    }
  });

  app.use("/public", express.static(PUBLIC_DIR));

  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

// Llama a la función para inicializar la aplicación
initializeApp();

