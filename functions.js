import pkg from 'xlsx';
const { readFile, writeFile, utils } = pkg;
import fs from 'fs';
import { TEMP_DATA_FILE, TEMPLATE_ROUTE, EXPORT_ROUTE } from './config.js';
import ExcelJS from "exceljs";
import moment from 'moment';

const normalizarComparacion = (value) => String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const stripTemplateFooter = (value) => {
    if (!value) return value;

    const lines = String(value).split('\n');
    const footerIndex = lines.findIndex((line) => /^\s*["“”']?ATIT,\s*Somos la voz comando y control del SEN/i.test(line.trim()));

    if (footerIndex === -1) {
        return value;
    }

    return lines.slice(0, footerIndex).join('\n');
};

const isEllipsisValue = (value) => /^\.{3,}$/.test(String(value || '').trim());

const includesNormalized = (text, snippet) => normalizarComparacion(text).includes(normalizarComparacion(snippet));

const PERSONAL_HEADER_REGEX = /^\s*(?:📌|♦️)?\s*(Personal(?:\s+[^:\n]+)*)\s*:?\s*$/i;
const NON_PERSONAL_SECTION_REGEX = /^\s*(?:Estado|Fecha(?:\s+de)?\s*inicio|Fecha(?:\s+de)?\s*(?:finalizada|finalizado|cierre)|Hora(?:\s+de)?\s*inicio|Hora(?:\s+de)?\s*cierre|Hacer breve descripci[oó]n de la incidencia|Descripci[oó]n|[ÁA]rea(?:\s+de\s+la\s+incidencia)?|Lugar|Impacto|Importancia|Clasificaci[oó]n del impacto|Actividades|Describir detalladamente los trabajos realizados durante la atenci[oó]n de la incidencia|Trabajos realizados|Estatus|Puntos de ?atenci[oó]n|Gerente estatal de atit|Gerente|Coordinador(?: de telecomunicaciones| de infraestructura| de automatizaci[oó]n)?|COR)(?:\s*:.*)?$/i;

const extractPersonalSections = (sms) => {
    const normalizedSMS = String(sms || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    const lines = normalizedSMS.split("\n");
    const sections = [];
    let currentSection = null;

    const flushSection = () => {
        if (!currentSection) return;

        const content = stripTemplateFooter(currentSection.lines.join("\n"))
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{2,}/g, "\n")
            .trim();

        if (content) {
            sections.push({
                title: currentSection.title,
                content,
            });
        }

        currentSection = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (/^\s*["“”']?ATIT,\s*Somos la voz comando y control del SEN/i.test(line)) {
            flushSection();
            break;
        }

        const personalHeaderMatch = rawLine.match(PERSONAL_HEADER_REGEX);
        if (personalHeaderMatch) {
            flushSection();
            currentSection = {
                title: personalHeaderMatch[1].trim(),
                lines: [],
            };
            continue;
        }

        if (currentSection && NON_PERSONAL_SECTION_REGEX.test(line)) {
            flushSection();
            continue;
        }

        if (currentSection) {
            currentSection.lines.push(rawLine);
        }
    }

    flushSection();
    return sections;
};

const AREAS_POR_COORDINACION = {
    automatizacion: [
        'TELEPROTECCIÓN, TELEMETRIA Y TELEMEDICION',
        'SISTEMAS DE AUTOMATIZACIÓN'
    ],
    infraestructura: [
        'INFRAESTRUCTURA TECNOLÓGICA'
    ],
    telecomunicaciones: [
        'SISTEMAS DE RESPALDO DE ENERGÍA',
        'SISTEMA DE CLIMATIZACION',
        'MANTENIMIENTO DE LA PLATAFORMA',
        'ENLACES DE RADIOCOMUNICACIONES',
        'ENLACES DE FIBRA OPTICA',
        'RED DE DATOS Y SISTEMAS DE TELEFONIA',
        'RED DE DATOS Y SISTEMAS',
        'COMUNICACIONES MÓVILES'
    ]
};

const indicadoresPermitidos = Object.values(AREAS_POR_COORDINACION).flat();

const clasificacionesValidas = ['bajo', 'medio', 'alto'];
const estatusValidos = ['resuelta', 'pendiente por resolver'];

export function guardarTemporal(dataFile, mensaje) {

    let mensajes = [];

    // Si el archivo existe, cargar su contenido
    if (fs.existsSync(dataFile)) {
        const contenido = fs.readFileSync(dataFile, "utf-8");
        try {
            mensajes = JSON.parse(contenido);
            if (!Array.isArray(mensajes)) {
                mensajes = []; // en caso de que el archivo no tenga un array
            }
        } catch (error) {
            mensajes = []; // si hay error de parseo, reiniciamos
        }
    }

    // Agregar el nuevo mensaje
    mensajes.push(mensaje);

    // Guardar de nuevo el archivo
    fs.writeFileSync(dataFile, JSON.stringify(mensajes, null, 2), "utf-8");
}

export const generarIncidencias = async () => {
    try {
        // Crear un nuevo workbook desde la plantilla
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(TEMPLATE_ROUTE);

        // Obtener la primera hoja del template
        const sheet = workbook.getWorksheet(1);

        // Contenedor para los datos que se van a insertar
        const nuevoContenido = [];

        // Cargar mensajes desde archivo temporal
        const data = loadMensajes();

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('No hay mensajes en la carpeta temp para generar el reporte.');
        }

        // Función para calcular el tiempo transcurrido
        const CalculateTime = (startDate, endDate, horaInicio, horaCierre) => {
            const formato = 'DD/MM/YYYY hh:mm A'; // hh:mm A = hora en 12h con AM/PM

            const inicio = moment(`${startDate} ${horaInicio}`, formato);
            const fin = moment(`${endDate} ${horaCierre}`, formato);

            // Calcular diferencia
            const duracion = moment.duration(fin.diff(inicio));

            // Obtener horas y minutos transcurridos
            const horas = Math.floor(duracion.asHours());
            const minutos = duracion.minutes();

            return `${horas} horas y ${minutos} minutos`;
        };

        // Procesar los mensajes y armar las filas
        for (let i = 0; i < data.length; i++) {
            const mensaje = data[i];
            const a = cleanSMS(mensaje.Mensaje);
            console.log(a); // Juan

            nuevoContenido.push([
                i + 1, // Numero de fila
                a.lugar,
                a.indicador || 'RED DE DATOS Y SISTEMAS DE TELEFONIA',
                a.impacto || 'Impacto no especificado',
                'ALTO',
                'ATIT-Tachira',
                'Los Andes',
                'Tachira',
                a.fechaInicio || 'Fecha de inicio no especificada',
                a.fechaFinalizado || 'Fecha de finalización no especificada',
                a.horaInicio || 'Hora de inicio no especificada',
                a.horaCierre || 'Hora de cierre no especificada',
                CalculateTime(a.fechaInicio, a.fechaFinalizado, a.horaInicio, a.horaCierre),
                a.descripcion || 'Descripción no especificada',
                a.personalEjecutor || 'Personal no especificado',
                a.estatus || 'Estatus no especificado',
                a.puntosAtencion || 'Puntos de atención no especificados'
            ]);
        }

        // Insertar a partir de la fila 7
        sheet.spliceRows(7, 0, ...nuevoContenido);

        for (let i = 0; i < nuevoContenido.length; i++) {
            const row = sheet.getRow(7 + i);
            row.getCell(15).alignment = {
                ...(row.getCell(15).alignment || {}),
                wrapText: true,
                vertical: 'top'
            };
        }

        // Guardar el nuevo archivo con fecha/hora
        const outputPath = EXPORT_ROUTE + `incidencias_${moment().format('YYYY-MM-DD HH-mm')}.xlsx`;
        await workbook.xlsx.writeFile(outputPath);

        // Eliminar archivo temporal
        deleteMensajes();

        console.log("Archivo generado con éxito en:", outputPath);
        return outputPath;

    } catch (error) {
        console.error("Error al generar el archivo de incidencias:", error);
        throw error;
    }
};

export const loadMensajes = () => {
    const dataFile = TEMP_DATA_FILE;
    if (fs.existsSync(dataFile)) {
        try {
            return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
        }
        catch (error) {
            console.error("Error al leer el archivo temporal:", error);
            return [];
        }
    }
    return [];
};

export const deleteMensajes = () => {
    const dataFile = TEMP_DATA_FILE;
    if (fs.existsSync(dataFile)) {
        try {
            fs.unlinkSync(dataFile);
            console.log("Archivo temporal eliminado con éxito.");
            return true;
        } catch (error) {
            console.error("Error al eliminar el archivo temporal:", error);
            return false;
        }
    } else {
        console.warn("No se encontró el archivo temporal para eliminar.");
        return false;
    }
};

export const cleanSMS = (sms) => {
    // patrón de emojis opcionales
    const emojiOpt = "[\\p{Emoji_Presentation}\\p{Extended_Pictographic}]*";

    const normalizedSMS = String(sms || "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");

    const sectionEndLookahead = String.raw`(?=\n(?:Estado|Fecha(?:\s+de)?\s*inicio|Fecha(?:\s+de)?\s*(?:finalizada|finalizado|cierre)|Hora(?:\s+de)?\s*inicio|Hora(?:\s+de)?\s*cierre|Hacer breve descripci[oó]n de la incidencia|Descripci[oó]n|[ÁA]rea(?:\s+de\s+la\s+incidencia)?|Lugar|Impacto|Importancia|Clasificaci[oó]n del impacto|Actividades|Describir detalladamente los trabajos realizados durante la atenci[oó]n de la incidencia|Trabajos realizados|Estatus|Puntos de ?atenci[oó]n|Gerente estatal de atit|Gerente|Coordinador(?: de telecomunicaciones| de infraestructura| de automatizaci[oó]n)?|Personal(?:\s+[^:\n]+)*|["“”']?ATIT,|COR)|$)`;

    // Horas
    const regexHoraInicio = new RegExp(`${emojiOpt}\\s*Hora(?:\\s+de)?\\s*inicio${emojiOpt}\\s*:?\\s*([\\d:]+(?:\\s*[APMapm]{2})?)`, "i");
    const regexHoraCierre = new RegExp(`${emojiOpt}\\s*Hora(?:\\s+de)?\\s*cierre${emojiOpt}\\s*:?\\s*([\\d:]+(?:\\s*[APMapm]{2})?)`, "i");

    // Fechas
    const regexFechaInicio = new RegExp(`${emojiOpt}\\s*Fecha(?:\\s+de)?\\s*inicio${emojiOpt}\\s*:?\\s*(\\d{2}\\/\\d{2}\\/\\d{4})`, "i");
    const regexFechaFinalizado = new RegExp(`${emojiOpt}\\s*Fecha(?:\\s+de)?\\s*(?:Finalizada|Finalizado|cierre)${emojiOpt}\\s*:?\\s*(\\d{2}\\/\\d{2}\\/\\d{4})`, "i");
    const regexFechaUnica = new RegExp(`${emojiOpt}\\s*Fecha${emojiOpt}\\s*:?\\s*(\\d{2}\\/\\d{2}\\/\\d{4})`, "i");

    // Secciones largas
    const regexDescripcion = new RegExp(`(?:Hacer breve descripci[oó]n de la incidencia|Descripci[oó]n)\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexImpacto = new RegExp(`Impacto(?:\\s*\\([^)]*\\))?\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexClasificacionImpacto = new RegExp(`(?:Importancia|Clasificaci[oó]n del impacto)(?:\\s*\\([^)]*\\))?\\s*:?\\s*(.+)`, "i");
    const regexTrabajosRealizados = new RegExp(`(?:Actividades|Describir detalladamente los trabajos realizados durante la atenci[oó]n de la incidencia|Trabajos realizados)\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexPuntosAtencion = new RegExp(`Puntos de ?atenci[oó]n(?:\\s*\\([^)]*\\))?\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexGerenteEstatalAtit = new RegExp(`Gerente estatal de atit\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexCoordinadorTelecom = new RegExp(`Coordinador de telecomunicaciones\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexCoordinadorInfra = new RegExp(`Coordinador de infraestructura\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexCoordinadorAutom = new RegExp(`Coordinador de automatizaci[oó]n\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");

    // Lugar
    const regexLugar = new RegExp(`${emojiOpt}\\s*lugar${emojiOpt}\\s*:?\\s*(.+)`, "i");
    const regexIndicador = new RegExp(`${emojiOpt}\\s*[áa]rea(?:\\s+de\\s+la\\s+incidencia)?${emojiOpt}\\s*(?:\\([^)]*\\))?\\s*:?\\s*(.+)`, "i");
    const regexEstado = new RegExp(`${emojiOpt}\\s*Estado${emojiOpt}\\s*:?\\s*(.+)`, "i");

    // estatus
    const regexEstatus = new RegExp(`${emojiOpt}\\s*Estatus${emojiOpt}\\s*:?\\s*(.+)`, "i");
    // ---- Fechas ----
    let fechaInicio = null;
    let fechaFinalizado = null;
    const matchInicio = normalizedSMS.match(regexFechaInicio);
    const matchFinalizado = normalizedSMS.match(regexFechaFinalizado);
    const matchUnica = normalizedSMS.match(regexFechaUnica);

    if (matchInicio && matchFinalizado) {
        fechaInicio = matchInicio[1];
        fechaFinalizado = matchFinalizado[1];
    } else if (matchUnica) {
        fechaInicio = matchUnica[1];
        fechaFinalizado = matchUnica[1];
    }

    // ---- Función de limpieza ----
    const sanitizeInlineText = (value) => {
        if (!value) return undefined;
        return value
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "") // elimina emojis
            .replace(/\s+/g, " ") // colapsa espacios múltiples
            .trim();
    };

    const sanitizeBlockText = (value) => {
        if (!value) return undefined;
        return stripTemplateFooter(value)
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{2,}/g, "\n")
            .trim();
    };

    // ---- Extracciones ----
    const horaInicio = sanitizeInlineText(normalizedSMS.match(regexHoraInicio)?.[1]);
    const horaCierre = sanitizeInlineText(normalizedSMS.match(regexHoraCierre)?.[1]);
    const descripcion = sanitizeBlockText(normalizedSMS.match(regexDescripcion)?.[1]);
    const impacto = sanitizeBlockText(normalizedSMS.match(regexImpacto)?.[1]);
    const clasificacionImpacto = sanitizeInlineText(normalizedSMS.match(regexClasificacionImpacto)?.[1]);
    const trabajosRealizados = sanitizeBlockText(normalizedSMS.match(regexTrabajosRealizados)?.[1]);
    const puntosAtencion = sanitizeBlockText(normalizedSMS.match(regexPuntosAtencion)?.[1]);
    const personalSections = extractPersonalSections(normalizedSMS);
    const personalEjecutor = personalSections.length > 0
        ? personalSections.map((section) => `${section.title}:\n${section.content}`).join('\n\n')
        : undefined;
    const gerenteEstatalAtit = sanitizeInlineText(normalizedSMS.match(regexGerenteEstatalAtit)?.[1]);
    const coordinadorTelecomunicaciones = sanitizeInlineText(normalizedSMS.match(regexCoordinadorTelecom)?.[1]);
    const coordinadorInfraestructura = sanitizeInlineText(normalizedSMS.match(regexCoordinadorInfra)?.[1]);
    const coordinadorAutomatizacion = sanitizeInlineText(normalizedSMS.match(regexCoordinadorAutom)?.[1]);
    const indicador = sanitizeInlineText(normalizedSMS.match(regexIndicador)?.[1]);
    const lugar = sanitizeInlineText(normalizedSMS.match(regexLugar)?.[1]) || indicador;
    const estado = sanitizeInlineText(normalizedSMS.match(regexEstado)?.[1]);
    const estatus = sanitizeInlineText(normalizedSMS.match(regexEstatus)?.[1]);
    return {
        estado,
        fechaInicio,
        fechaFinalizado,
        horaInicio,
        horaCierre,
        descripcion,
        indicador,
        clasificacionImpacto,
        impacto,
        trabajosRealizados,
        puntosAtencion,
        gerenteEstatalAtit,
        coordinadorTelecomunicaciones,
        coordinadorInfraestructura,
        coordinadorAutomatizacion,
        personalSections,
        personalEjecutor,
        lugar,
        estatus
    };
};
// --- Función de análisis/validación previa al guardado ---
export const analyzeSMSBeforeSave = (sms, options = {}) => {
    const opts = Object.assign({
        treatAmbiguousTimeAsError: true,
    }, options);

    // 👀 usar la misma función de parsing que ya tienes
    const parsed = cleanSMS(sms);
    const errors = [];
    const warnings = [];
    const smsNormalizado = normalizarComparacion(sms);
    const addError = (message) => errors.push(message);
    const coordinadores = [
        ["telecomunicaciones", parsed.coordinadorTelecomunicaciones],
        ["infraestructura", parsed.coordinadorInfraestructura],
        ["automatizacion", parsed.coordinadorAutomatizacion]
    ].filter(([, value]) => Boolean(value));
    const coordinadorTipo = coordinadores[0]?.[0] || null;
    const areasPermitidasCoordinacion = coordinadorTipo
        ? (AREAS_POR_COORDINACION[coordinadorTipo] || [])
        : indicadoresPermitidos;
    const areaTemplateUntouched = areasPermitidasCoordinacion.filter((item) => smsNormalizado.includes(normalizarComparacion(item))).length >= Math.min(2, areasPermitidasCoordinacion.length);
    const personalContienePlaceholder = (parsed.personalSections || []).some((section) => /(^|\n)\s*-?\s*Nombre\s+\d+/i.test(section.content));

    if (!parsed.estado) {
        addError('Estado: indica el estado afectado.');
    }

    if (includesNormalized(sms, 'Fecha de inicio: DD/MM/AAAA')) {
        addError('Fecha de inicio: reemplaza DD/MM/AAAA por la fecha real del inicio de la incidencia.');
    } else if (!parsed.fechaInicio) {
        addError('Fecha de inicio: falta completar este campo con formato DD/MM/AAAA.');
    }

    if (includesNormalized(sms, 'Fecha finalizada: DD/MM/AAAA')) {
        addError('Fecha finalizada: reemplaza DD/MM/AAAA por la fecha real de cierre de la incidencia.');
    } else if (!parsed.fechaFinalizado) {
        addError('Fecha finalizada: falta completar este campo con formato DD/MM/AAAA.');
    }

    if (includesNormalized(sms, 'Hora de inicio: HH:MM AM/PM')) {
        addError('Hora de inicio: reemplaza HH:MM AM/PM por la hora real de inicio.');
    } else if (!parsed.horaInicio) {
        addError('Hora de inicio: falta completar este campo con formato HH:MM AM/PM.');
    }

    if (includesNormalized(sms, 'Hora de cierre: HH:MM AM/PM')) {
        addError('Hora de cierre: reemplaza HH:MM AM/PM por la hora real de cierre.');
    } else if (!parsed.horaCierre) {
        addError('Hora de cierre: falta completar este campo con formato HH:MM AM/PM.');
    }

    if (!parsed.descripcion) {
        addError('Descripción: falta completar este campo.');
    } else if (includesNormalized(parsed.descripcion, 'hacer breve descripcion de la incidencia')) {
        addError('Descripción: reemplaza el texto de ejemplo por la descripción real de la incidencia.');
    }

    if (!parsed.indicador) {
        addError('Área: selecciona una sola área del listado.');
    } else if (areaTemplateUntouched || /^-.*-$/.test(parsed.indicador.trim())) {
        addError('Área: elimina las opciones del template y deja solo el área que corresponde a la incidencia.');
    }

    if (!parsed.impacto) {
        addError('Impacto: falta completar este campo.');
    } else if (isEllipsisValue(parsed.impacto)) {
        addError('Impacto: reemplaza "..." por el impacto real de la incidencia.');
    }

    if (!parsed.clasificacionImpacto) {
        addError('Importancia: indica si el impacto es bajo, medio o alto.');
    } else if (parsed.clasificacionImpacto.includes('|') || includesNormalized(sms, 'Importancia: bajo | medio | alto')) {
        addError('Importancia: reemplaza "bajo | medio | alto" por un solo valor: bajo, medio o alto.');
    }

    if (!parsed.trabajosRealizados) {
        addError('Actividades: falta describir los trabajos realizados.');
    } else if (includesNormalized(parsed.trabajosRealizados, 'describir detalladamente los trabajos realizados durante la atencion de la incidencia')) {
        addError('Actividades: reemplaza el texto de ejemplo por las actividades realizadas.');
    }

    if (!parsed.puntosAtencion) {
        addError('Puntos de atención: falta completar este campo.');
    } else if (isEllipsisValue(parsed.puntosAtencion)) {
        addError('Puntos de atención: reemplaza "..." por la información real.');
    }

    if (!parsed.gerenteEstatalAtit) {
        addError('Gerente estatal de ATIT: falta indicar el responsable.');
    }

    if (!parsed.estatus) {
        addError('Estatus: indica si la incidencia está Resuelta o Pendiente por resolver.');
    } else if (parsed.estatus.includes('|') || includesNormalized(sms, 'Estatus: Resuelta | Pendiente por resolver')) {
        addError('Estatus: reemplaza "Resuelta | Pendiente por resolver" por una sola opción.');
    }

    // --- 2. Validar fechas ---
    const parseDateDMY = (str) => {
        if (!str) return null;
        const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return null;
        const d = +m[1], mo = +m[2], y = +m[3];
        if (mo < 1 || mo > 12) return null;
        const daysInMonth = new Date(y, mo, 0).getDate();
        if (d < 1 || d > daysInMonth) return null;
        return new Date(y, mo - 1, d);
    };

    const fechaInicio = parseDateDMY(parsed.fechaInicio);
    const fechaFinal = parseDateDMY(parsed.fechaFinalizado);

    if (!fechaInicio && parsed.fechaInicio) errors.push("Fecha de inicio inválida.");
    if (!fechaFinal && parsed.fechaFinalizado) errors.push("Fecha final inválida.");
    if (fechaInicio && fechaFinal && fechaInicio > fechaFinal) {
        errors.push("La fecha de inicio es posterior a la fecha final.");
    }

    // --- 3. Validar horas ---
    // --- 3. Validar horas ---
    const parseTimeString = (timeStr) => {
        if (!timeStr) return null;
        const s = String(timeStr).replace(/\./g, "").trim();

        // Regex para horas con o sin AM/PM
        const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm]?)?$/);
        if (!m) return null;

        let h = parseInt(m[1], 10);
        let min = m[2] ? parseInt(m[2], 10) : 0;
        const ampm = m[3] ? m[3].toLowerCase() : null;
        let ambiguous = false;

        if (ampm) {
            if (ampm.startsWith("p")) {
                if (h >= 1 && h <= 11) h += 12; // 3 pm → 15
                else if (h > 12) h = h; // 15 pm → lo dejamos como 15
            } else if (ampm.startsWith("a")) {
                if (h === 12) h = 0;      // 12 am → 0
                else if (h > 12) return null; // 15 am → inválido
            }
        } else {
            // Sin AM/PM
            if (h > 23 || h < 0) return null; // fuera de rango 0-23
            // if (h >= 1 && h <= 12) ambiguous = e; // podría ser AM o PM
        }

        if (min < 0 || min > 59) return null;

        return { h, min, ambiguous, original: timeStr };
    };

    const horaInicio = parseTimeString(parsed.horaInicio);
    const horaCierre = parseTimeString(parsed.horaCierre);
    if (parsed.horaInicio && !horaInicio) errors.push("Hora de inicio inválida. Usa el formato HH:MM AM/PM.");
    if (parsed.horaCierre && !horaCierre) errors.push("Hora de cierre inválida. Usa el formato HH:MM AM/PM.");
    if (horaInicio && horaCierre) {
        const start = horaInicio.h * 60 + horaInicio.min;
        const end = horaCierre.h * 60 + horaCierre.min;
        if (start > end && fechaInicio?.getTime() === fechaFinal?.getTime()) {
            errors.push("La hora de inicio es posterior a la hora de cierre.");
        }
    }

    if (opts.treatAmbiguousTimeAsError) {
        if (horaInicio?.ambiguous) errors.push(`Hora de inicio ambigua: ${horaInicio.original}`);
        if (horaCierre?.ambiguous) errors.push(`Hora de cierre ambigua: ${horaCierre.original}`);
    }

    if (parsed.clasificacionImpacto && !clasificacionesValidas.includes(parsed.clasificacionImpacto.toLowerCase())) {
        errors.push("Importancia inválida. Debe ser uno de estos valores: bajo, medio o alto.");
    }

    const indicadorValido = areasPermitidasCoordinacion.find(
        (item) => normalizarComparacion(item) === normalizarComparacion(parsed.indicador)
    );
    if (parsed.indicador && !areaTemplateUntouched && !/^-.*-$/.test(parsed.indicador.trim()) && !indicadorValido) {
        errors.push(`Área inválida para ${coordinadorTipo || 'la coordinación indicada'}. Debe ser una de estas opciones: ${areasPermitidasCoordinacion.join(", ")}.`);
    }

    if (parsed.estatus && !estatusValidos.includes(parsed.estatus.toLowerCase())) {
        errors.push("Estatus inválido. Debe ser: Resuelta o Pendiente por resolver.");
    }

    if (coordinadores.length === 0) {
        errors.push("Coordinador: falta indicar el coordinador responsable según la plantilla seleccionada.");
    }

    if (coordinadores.length > 1) {
        errors.push("Coordinador: deja solo un coordinador responsable según la variante del SMS.");
    }

    // --- 4. Validar personal ejecutor ---
    const personalArray = (parsed.personalSections || [])
        .flatMap((section) => section.content
            .replace(/♦️|♦|•|·|-\s|—|–|📌/g, "\n")
            .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .filter((line) => !/^Nombre\s+\d+$/i.test(line))
        );

    if (personalArray.length === 0) {
        errors.push(personalContienePlaceholder
            ? "Personal ejecutor: reemplaza Nombre 1 / Nombre 2 por el personal real que atendió la incidencia."
            : "Personal ejecutor: falta indicar al menos una persona responsable.");
    }

    // --- Resultado ---
    return {
        ok: errors.length === 0,
        errors,
        warnings,
        parsed,
        normalized: {
            fechaInicioISO: fechaInicio ? fechaInicio.toISOString().slice(0, 10) : null,
            fechaFinalISO: fechaFinal ? fechaFinal.toISOString().slice(0, 10) : null,
            horaInicio24: horaInicio ? `${String(horaInicio.h).padStart(2, "0")}:${String(horaInicio.min).padStart(2, "0")}` : null,
            horaCierre24: horaCierre ? `${String(horaCierre.h).padStart(2, "0")}:${String(horaCierre.min).padStart(2, "0")}` : null,
            estado: parsed.estado,
            indicador: indicadorValido || parsed.indicador || null,
            lugar: parsed.lugar,
            descripcion: parsed.descripcion,
            impacto: parsed.impacto,
            clasificacionImpacto: parsed.clasificacionImpacto,
            trabajosRealizados: parsed.trabajosRealizados,
            puntosAtencion: parsed.puntosAtencion,
            gerenteEstatalAtit: parsed.gerenteEstatalAtit,
            coordinadorTelecomunicaciones: parsed.coordinadorTelecomunicaciones,
            coordinadorInfraestructura: parsed.coordinadorInfraestructura,
            coordinadorAutomatizacion: parsed.coordinadorAutomatizacion,
            coordinadorTipo: coordinadores[0]?.[0] || null,
            coordinadorResponsable: coordinadores[0]?.[1] || null,
            personalSections: parsed.personalSections || [],
            personalArray,
        }
    };
};
