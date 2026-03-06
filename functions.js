import pkg from 'xlsx';
const { readFile, writeFile, utils } = pkg;
import fs from 'fs';
import { TEMP_DATA_FILE, TEMPLATE_ROUTE, EXPORT_ROUTE } from './config.js';
import ExcelJS from "exceljs";
import moment from 'moment';

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

        // Guardar el nuevo archivo con fecha/hora
        const outputPath = EXPORT_ROUTE + `incidencias_${moment().format('YYYY-MM-DD HH-mm')}.xlsx`;
        await workbook.xlsx.writeFile(outputPath);

        // Eliminar archivo temporal
        deleteMensajes();

        console.log("Archivo generado con éxito en:", outputPath);

    } catch (error) {
        console.error("Error al generar el archivo de incidencias:", error);
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

    const sectionEndLookahead = String.raw`(?=\n(?:Estado|Fecha(?:\s+de)?\s*inicio|Fecha(?:\s+de)?\s*(?:finalizada|finalizado|cierre)|Hora(?:\s+de)?\s*inicio|Hora(?:\s+de)?\s*cierre|Hacer breve descripci[oó]n de la incidencia|Descripci[oó]n|[ÁA]rea de la incidencia|Lugar|Impacto|Importancia|Clasificaci[oó]n del impacto|Describir detalladamente los trabajos realizados durante la atenci[oó]n de la incidencia|Trabajos realizados|Estatus|Puntos de ?atenci[oó]n|Gerente estatal de atit|Gerente|Coordinador(?: de telecomunicaciones| de infraestructura| de automatizaci[oó]n)?|Personal ejecutor|Personal de guardia|COR)|$)`;

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
    const regexTrabajosRealizados = new RegExp(`(?:Describir detalladamente los trabajos realizados durante la atenci[oó]n de la incidencia|Trabajos realizados)\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexPuntosAtencion = new RegExp(`Puntos de ?atenci[oó]n(?:\\s*\\([^)]*\\))?\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexPersonalEjecutor = new RegExp(`(?:📌|♦️)?\\s*Personal\\s+ejecutor\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexPersonalGuardia = new RegExp(`Personal de guardia\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexGerenteEstatalAtit = new RegExp(`Gerente estatal de atit\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexCoordinadorTelecom = new RegExp(`Coordinador de telecomunicaciones\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexCoordinadorInfra = new RegExp(`Coordinador de infraestructura\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");
    const regexCoordinadorAutom = new RegExp(`Coordinador de automatizaci[oó]n\\s*:?\\s*([\\s\\S]*?)${sectionEndLookahead}`, "i");

    // Lugar
    const regexLugar = new RegExp(`${emojiOpt}\\s*lugar${emojiOpt}\\s*:?\\s*(.+)`, "i");
    const regexAreaIncidencia = new RegExp(`${emojiOpt}\\s*[áa]rea\\s+de\\s+la\\s+incidencia${emojiOpt}\\s*(?:\\([^)]*\\))?\\s*:?\\s*(.+)`, "i");
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
        return value
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
    const personalEjecutor = sanitizeBlockText(normalizedSMS.match(regexPersonalEjecutor)?.[1]);
    const personalGuardia = sanitizeBlockText(normalizedSMS.match(regexPersonalGuardia)?.[1]);
    const gerenteEstatalAtit = sanitizeInlineText(normalizedSMS.match(regexGerenteEstatalAtit)?.[1]);
    const coordinadorTelecomunicaciones = sanitizeInlineText(normalizedSMS.match(regexCoordinadorTelecom)?.[1]);
    const coordinadorInfraestructura = sanitizeInlineText(normalizedSMS.match(regexCoordinadorInfra)?.[1]);
    const coordinadorAutomatizacion = sanitizeInlineText(normalizedSMS.match(regexCoordinadorAutom)?.[1]);
    const areaIncidencia = sanitizeInlineText(normalizedSMS.match(regexAreaIncidencia)?.[1]);
    const lugar = sanitizeInlineText(normalizedSMS.match(regexLugar)?.[1]) || areaIncidencia;
    const estado = sanitizeInlineText(normalizedSMS.match(regexEstado)?.[1]);
    const estatus = sanitizeInlineText(normalizedSMS.match(regexEstatus)?.[1]);
    return {
        estado,
        fechaInicio,
        fechaFinalizado,
        horaInicio,
        horaCierre,
        descripcion,
        areaIncidencia,
        clasificacionImpacto,
        impacto,
        trabajosRealizados,
        puntosAtencion,
        gerenteEstatalAtit,
        coordinadorTelecomunicaciones,
        coordinadorInfraestructura,
        coordinadorAutomatizacion,
        personalEjecutor,
        personalGuardia,
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

    // --- 1. Validar existencia de TODOS los campos ---
    const requiredFields = [
        "estado",
        "fechaInicio",
        "fechaFinalizado",
        "horaInicio",
        "horaCierre",
        "areaIncidencia",
        "descripcion",
        "impacto",
        "clasificacionImpacto",
        "trabajosRealizados",
        "puntosAtencion",
        "gerenteEstatalAtit",
        "personalEjecutor",
        "personalGuardia",
        "estatus"
    ];
    //  console.log(parsed)



    // Revisamos cuáles son nulos o undefined
    const missingFields = requiredFields.filter(
        (field) => parsed[field] === undefined || parsed[field] === null || parsed[field] === ""
    );
    // console.log(missingFields)
    for (const field of missingFields) {
        errors.push(`Falta el campo obligatorio: ${field}`);
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
    if (parsed.horaInicio && !horaInicio) errors.push("Hora de inicio inválida.");
    if (parsed.horaCierre && !horaCierre) errors.push("Hora de cierre inválida.");
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

    const clasificacionesValidas = ["bajo", "medio", "alto"];
    if (parsed.clasificacionImpacto && !clasificacionesValidas.includes(parsed.clasificacionImpacto.toLowerCase())) {
        errors.push("La clasificación del impacto debe ser: bajo, medio o alto.");
    }

    const estatusValidos = ["resuelta", "pendiente por resolver"];
    if (parsed.estatus && !estatusValidos.includes(parsed.estatus.toLowerCase())) {
        errors.push("El estatus debe ser: Resuelta o Pendiente por resolver.");
    }

    const coordinadores = [
        ["telecomunicaciones", parsed.coordinadorTelecomunicaciones],
        ["infraestructura", parsed.coordinadorInfraestructura],
        ["automatizacion", parsed.coordinadorAutomatizacion]
    ].filter(([, value]) => Boolean(value));

    if (coordinadores.length === 0) {
        errors.push("Debe indicar un coordinador responsable.");
    }

    if (coordinadores.length > 1) {
        errors.push("Debe indicar solo un coordinador responsable según la variante del SMS.");
    }

    // --- 4. Validar personal ejecutor ---
    const personalArray = (parsed.personalEjecutor || "")
        .replace(/♦️|♦|•|·|-\s|—|–|📌/g, "\n")
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean);

    if (personalArray.length === 0) {
        errors.push("Personal ejecutor vacío o no reconocido.");
    }

    const personalGuardiaArray = (parsed.personalGuardia || "")
        .replace(/♦️|♦|•|·|-\s|—|–|📌/g, "\n")
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean);

    if (personalGuardiaArray.length === 0) {
        errors.push("Personal de guardia vacío o no reconocido.");
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
            areaIncidencia: parsed.areaIncidencia,
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
            personalArray,
            personalGuardiaArray,
        }
    };
};
