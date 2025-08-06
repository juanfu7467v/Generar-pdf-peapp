const express = require("express");
const axios = require("axios");
const Jimp = require("jimp");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);

// URL del icono de la aplicación
const APP_ICON_URL = "https://www.socialcreator.com/srv/imgs/gen/79554_icohome.png";

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

// Función para generar marcas de agua
const generarMarcaDeAgua = async (imagen) => {
    const marcaAgua = new Jimp(imagen.bitmap.width, imagen.bitmap.height, 0x00000000);
    const fontWatermark = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const text = "CONSULTA CIUDADANA";
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

// Función para imprimir texto que se ajusta a una nueva línea si es demasiado largo
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

app.get("/generar-ficha", async (req, res) => {
    const { dni } = req.query;
    if (!dni) return res.status(400).json({ error: "Falta el parámetro DNI" });

    try {
        const allData = await Promise.all(
            Object.values(API_URLS).map(async (urlFunc) => {
                try {
                    const response = await axios.get(urlFunc(dni));
                    return response.data?.result;
                } catch (error) {
                    return null;
                }
            })
        );
        const [reniecData, matrimoniosData, telefoniaData, correosData, sueldosData, trabajosData, consumosData, arbolData, familiaData, empresasData] = allData;

        if (!reniecData) return res.status(404).json({ error: "No se encontró información de RENIEC para el DNI ingresado." });

        const images = [];
        let currentPageIndex = 0;

        // Función para crear una nueva página
        const createNewPage = async () => {
            const newImage = new Jimp(1080, 1920, "#003366");
            const marcaAgua = await generarMarcaDeAgua(newImage);
            newImage.composite(marcaAgua, 0, 0);

            // Icono principal y título
            try {
                const iconBuffer = (await axios({ url: APP_ICON_URL, responseType: 'arraybuffer' })).data;
                const mainIcon = await Jimp.read(iconBuffer);
                mainIcon.resize(300, Jimp.AUTO);
                const iconX = (newImage.bitmap.width - mainIcon.bitmap.width) / 2;
                newImage.composite(mainIcon, iconX, 50);
            } catch (error) {
                console.error("Error al cargar el icono:", error);
            }
            const fontTitle = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
            newImage.print(fontTitle, 0, 200, {
                text: "Ficha de Consulta Ciudadana",
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_TOP
            }, newImage.bitmap.width, newImage.bitmap.height);

            const pageInfoFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
            newImage.print(pageInfoFont, newImage.bitmap.width - 100, 1850, `Pág. ${images.length + 1}`);

            images.push({ image: newImage, y: 300 });
        };

        // Creamos la primera página
        await createNewPage();
        let currentPage = images[currentPageIndex];
        
        const marginHorizontal = 50;
        const lineHeight = 30;
        const headingSpacing = 40;
        const fontHeading = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
        const fontBold = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
        const fontData = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

        const checkAndCreatePage = async (requiredSpace) => {
            if (currentPage.y + requiredSpace > currentPage.image.bitmap.height - 150) {
                await createNewPage();
                currentPageIndex++;
                currentPage = images[currentPageIndex];
            }
        };

        const printSection = async (title, contentFunc) => {
            await checkAndCreatePage(headingSpacing + 20);
            currentPage.image.print(fontHeading, marginHorizontal, currentPage.y, title);
            currentPage.y += headingSpacing;
            await contentFunc();
            currentPage.y += headingSpacing;
        };

        const printField = async (label, value) => {
            const labelX = marginHorizontal;
            const valueX = labelX + 200;
            const maxWidth = currentPage.image.bitmap.width - valueX - marginHorizontal;
            await checkAndCreatePage(lineHeight);
            currentPage.image.print(fontBold, labelX, currentPage.y, `${label}:`);
            currentPage.y = printWrappedText(currentPage.image, fontData, valueX, currentPage.y, maxWidth, `${value || "-"}`, lineHeight) - 10;
        };
        
        // --- Contenido de la Ficha ---

        // Sección: Foto (solo en la primera página)
        if (reniecData.imagenes?.foto) {
            const bufferFoto = Buffer.from(reniecData.imagenes.foto, 'base64');
            const foto = await Jimp.read(bufferFoto);
            const fotoWidth = 300;
            const fotoHeight = 350;
            foto.resize(fotoWidth, fotoHeight);
            const fotoX = (currentPage.image.bitmap.width - fotoWidth) / 2;
            currentPage.image.composite(foto, fotoX, currentPage.y);
            currentPage.y += fotoHeight + headingSpacing;
        }

        // Sección: Datos Personales (RENIEC)
        await printSection("Datos Personales (RENIEC)", async () => {
            await printField("Nombres", `${reniecData.preNombres}`);
            await printField("Apellidos", `${reniecData.apePaterno} ${reniecData.apeMaterno}`);
            await printField("Fecha de Nacimiento", reniecData.feNacimiento);
            await printField("Sexo", reniecData.sexo);
            await printField("Estado Civil", reniecData.estadoCivil);
            await printField("Estatura", `${reniecData.estatura} cm`);
            await printField("Grado de Instrucción", reniecData.gradoInstruccion);
        });

        // Sección: Familiares (RENIEC y Árbol Genealógico)
        await printSection("Información Familiar", async () => {
            await printField("Padre", reniecData.nomPadre);
            await printField("Madre", reniecData.nomMadre);
            if (arbolData && arbolData.coincidences) {
                const familiares = arbolData.coincidences.filter(f => f.tipo !== 'PADRE' && f.tipo !== 'MADRE');
                if (familiares.length > 0) {
                    await printField("---", "Otros familiares encontrados:");
                    for (const familiar of familiares) {
                        const relacion = `${familiar.tipo}: ${familiar.nom} ${familiar.ap} ${familiar.am || ''}`;
                        await printField(`  - ${familiar.dni}`, relacion);
                    }
                }
            }
        });
        
        // Sección: Matrimonios
        if (matrimoniosData?.coincidences?.length > 0) {
            await printSection("Matrimonios", async () => {
                for (const matrimonio of matrimoniosData.coincidences) {
                    const info = `Cónyuge: ${matrimonio.nombres} ${matrimonio.apellido_paterno} ${matrimonio.apellido_materno || ''} | Fecha: ${matrimonio.fecha}`;
                    await printField("Matrimonio", info);
                }
            });
        }
        
        // Sección: Telefonía
        if (telefoniaData?.coincidences?.length > 0) {
            await printSection("Telefonía", async () => {
                for (const tel of telefoniaData.coincidences) {
                    const info = `Número: ${tel.telefono} | Fuente: ${tel.fuente} | Plan: ${tel.plan || 'N/A'}`;
                    await printField("Teléfono", info);
                }
            });
        }

        // Sección: Correos Electrónicos
        if (correosData?.coincidences?.length > 0) {
            await printSection("Correos Electrónicos", async () => {
                for (const correo of correosData.coincidences) {
                    const info = `Correo: ${correo.correo} | Fuente: ${correo.fuente}`;
                    await printField("Correo", info);
                }
            });
        }
        
        // Sección: Empleos y Sueldos
        if (trabajosData?.coincidences?.length > 0 || sueldosData?.coincidences?.length > 0) {
            await printSection("Empleo y Sueldos", async () => {
                if (trabajosData?.coincidences?.length > 0) {
                    for (const trabajo of trabajosData.coincidences) {
                        const info = `Empresa: ${trabajo.rz} | Desde: ${trabajo.fip} | Hasta: ${trabajo.ffp}`;
                        await printField("Trabajo", info);
                    }
                }
                if (sueldosData?.coincidences?.length > 0) {
                    await printField("Historial de Sueldos:", "");
                    const sueldosPorEmpresa = sueldosData.coincidences.reduce((acc, current) => {
                        (acc[current.empresa] = acc[current.empresa] || []).push(current);
                        return acc;
                    }, {});

                    for (const empresa in sueldosPorEmpresa) {
                        await printField(`  - ${empresa}`, "");
                        sueldosPorEmpresa[empresa].forEach(async (sueldo) => {
                            const info = `    - Periodo: ${sueldo.periodo} | Sueldo: S/.${sueldo.sueldo}`;
                            await printField("", info);
                        });
                    }
                }
            });
        }
        
        // Sección: Empresas
        if (empresasData?.coincidences?.length > 0) {
            await printSection("Empresas Vinculadas", async () => {
                for (const empresa of empresasData.coincidences) {
                    const info = `Razón Social: ${empresa.razon_social} | Cargo: ${empresa.cargo} | Desde: ${empresa.desde}`;
                    await printField("Empresa", info);
                }
            });
        }
        
        // Sección: Consumos y Gastos
        if (consumosData?.coincidences?.length > 0) {
            await printSection("Consumos y Gastos", async () => {
                const consumosRecientes = consumosData.coincidences.slice(0, 10);
                for (const consumo of consumosRecientes) {
                    const info = `Empresa: ${consumo.razonSocial} | Monto: S/.${consumo.monto} | Fecha: ${consumo.fecha}`;
                    await printField("Consumo", info);
                }
                if (consumosData.quantity > 10) {
                    await printField("...", `(Se encontraron ${consumosData.quantity - 10} consumos más...)`);
                }
            });
        }

        // Pie de página en cada imagen
        for (const page of images) {
            const footerY = page.image.bitmap.height - 100;
            const fontFooter = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
            page.image.print(
                fontFooter,
                marginHorizontal,
                footerY,
                "Fuente: Consulta Ciudadana"
            );
            page.image.print(
                fontFooter,
                marginHorizontal,
                footerY + 30,
                "Esta imagen es solo informativa. No representa un documento oficial."
            );
        }

        // Guardar las imágenes generadas y construir URLs
        const urls = [];
        for (let i = 0; i < images.length; i++) {
            const nombreArchivo = `${uuidv4()}_${i + 1}.png`;
            const rutaImagen = path.join(PUBLIC_DIR, nombreArchivo);
            await images[i].image.writeAsync(rutaImagen);
            urls.push(`${req.protocol}://${req.get("host")}/public/${nombreArchivo}`);
        }

        res.json({ message: "Ficha(s) generada(s)", urls });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error al generar la ficha", detalle: error.message });
    }
});

app.use("/public", express.static(PUBLIC_DIR));

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
