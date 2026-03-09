import { MENSAJE_BIENVENIDA, TOKEN, DIA_REPORTE, TEMP_DATA_FILE } from './config.js';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import cron from 'node-cron';
import { generarIncidencias, guardarTemporal, analyzeSMSBeforeSave } from './functions.js';
import { Configuration } from './utils/DBClient.js';

const bot = new TelegramBot(TOKEN, { polling: true });
const DEFAULT_HOUR = 11;
const VARIANTES_VALIDAS = ['telecomunicaciones', 'infraestructura', 'automatizacion'];
const COMANDOS_BASE = new Set(['/start', '/formato', '/telecomunicaciones', '/infraestructura', '/automatizacion']);
const COORDINADORES_POR_VARIANTE = {
    telecomunicaciones: 'Ing Jose Parada',
    infraestructura: 'Ing. Leonel Duarte',
    automatizacion: 'Ing Freddy Ruiz'
};
const AREAS_POR_VARIANTE = {
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
        'COMUNICACIONES MÓVILES'
    ]
};
const construirFormatoSMS = (variante) => {
    const coordinadorLabel = `coordinador de ${variante}`;
    const coordinadorNombre = COORDINADORES_POR_VARIANTE[variante] || '...';
    const areas = (AREAS_POR_VARIANTE[variante] || []).map((area) => `- ${area}`).join('\n');

    return `
Estado: Táchira
Fecha de inicio: DD/MM/AAAA
Fecha finalizada: DD/MM/AAAA
Hora de inicio: HH:MM AM/PM
Hora de cierre: HH:MM AM/PM

Descripción: hacer breve descripción de lo que ocurrio en la incidencia

Área: 
${areas}

Impacto: En que afecta la empresa el que se haya resulto o no esta incidencia

Importancia: bajo | medio | alto

Actividades: describir detalladamente los trabajos realizados durante la atención de la incidencia

Estatus: Resuelta | Pendiente por resolver

Puntos de atención: Explicar si hubo algun apoyo de otra gerencia o coordinación, o si se requirió apoyo externo

Gerente estatal de atit:
Ing. William Castro.

${coordinadorLabel}: 
${coordinadorNombre}

Personal ejecutor:
- Nombre 1
- Nombre 2

"ATIT, Somos la voz comando y control del SEN, nadie se cansa"
`;
};

const FORMATO_SMS_GENERAL = `📝 Variantes disponibles:

- /telecomunicaciones
- /infraestructura
- /automatizacion

Debes usar solo una variante por SMS.`;

// Archivo temporal donde guardamos mensajes para no perderlos si se apaga el bot
const dataFile = TEMP_DATA_FILE;

// Cargar datos guardados si existen
console.log('📂 Verificando datos temporales...');

const obtenerUsuario = (msg) => (
    msg.from?.username ||
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') ||
    'usuario'
);

const responderFormato = (chatId, variante) => {
    if (!variante) {
        bot.sendMessage(chatId, FORMATO_SMS_GENERAL);
        return;
    }

    bot.sendMessage(chatId, construirFormatoSMS(variante));
};

const normalizarTexto = (texto) => String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizarComando = (texto) => normalizarTexto(texto.split(/\s+/, 1)[0].split('@')[0]);
const extraerVarianteComando = (texto) => normalizarComando(texto).replace(/^\//, '');

const manejarComando = (msg, texto) => {
    const comando = normalizarComando(texto);

    if (comando === '/start') {
        bot.sendMessage(msg.chat.id, `${MENSAJE_BIENVENIDA}\n\nUsa /telecomunicaciones, /infraestructura o /automatizacion para ver la plantilla del SMS.`);
        return true;
    }

    if (comando === '/formato') {
        responderFormato(msg.chat.id);
        return true;
    }

    if (texto.startsWith('/')) {
        const variante = extraerVarianteComando(texto);
        if (!VARIANTES_VALIDAS.includes(variante)) {
            return false;
        }
        responderFormato(msg.chat.id, variante);
        return true;
    }

    return false;
};

const procesarReporte = (msg, texto) => {
    const usuario = obtenerUsuario(msg);
    const mensajes = {
        Usuario: usuario,
        Mensaje: texto,
        Fecha: new Date().toLocaleString()
    };
    const { ok, errors } = analyzeSMSBeforeSave(texto);

    if (!ok) {
        bot.sendMessage(msg.chat.id, `❌ El mensaje no cumple con el formato requerido, ${usuario}. Por favor revisa los siguientes errores:\n\n- ${errors.join('\n- ')}`);
        return;
    }

    console.log('💾 Guardando mensaje');
    guardarTemporal(dataFile, mensajes);
    bot.sendMessage(msg.chat.id, `✅ Tu reporte ha sido registrado, ${usuario}. Gracias por informar.`);
};

bot.on('polling_error', (error) => {
    console.error('Polling error:', error.message);
});

// Escuchar mensajes y filtrar por rango de fechas
bot.on('message', (msg) => {
    const texto = msg.text?.trim();

    if (!texto) {
        bot.sendMessage(msg.chat.id, '⚠️ Solo puedo procesar mensajes de texto. Usa /telecomunicaciones, /infraestructura o /automatizacion.');
        return;
    }

    if (manejarComando(msg, texto)) {
        return;
    }

    const comandoBase = normalizarComando(texto);
    if (texto.startsWith('/') && !COMANDOS_BASE.has(comandoBase)) {
        bot.sendMessage(msg.chat.id, '❓ Comando no reconocido. Usa /telecomunicaciones, /infraestructura o /automatizacion.');
        return;
    }

    procesarReporte(msg, texto);
});

const programarReporte = async () => {
    const config = await Configuration.findFirst({
        where: { id: 1 },
        select: { day: true, hour: true }
    });
    const reportDay = config?.day ?? DIA_REPORTE;
    const reportHour = config?.hour ?? DEFAULT_HOUR;
    const intervalo = `0 0 ${reportHour} * * ${reportDay}`;

    cron.schedule(intervalo, async () => {
        console.log('🕒 Ejecutando tarea programada');
        await generarIncidencias();
    });
};

// Verificar al iniciar si es viernes y aún no se generó el reporte
(async function bootstrap() {
    await programarReporte();

    const hoy = new Date();
    const config = await Configuration.findFirst({
        where: { id: 1 },
        select: { day: true }
    });

    const dayReport = config?.day ?? DIA_REPORTE;

    if (hoy.getDay() === dayReport) {
        const archivos = fs.readdirSync('.');
        const fechaHoy = hoy.toISOString().split('T')[0];
        const yaGenerado = archivos.some(a => a.includes(`reporte_${fechaHoy}.xlsx`));

        if (!yaGenerado) {
            console.log('📅 Hoy es viernes, generando reporte...');
            await generarIncidencias();
        }
    }
})();
// se tiene que generar todos los sms en un excel
// se tiene que generar el nombre del archivo con un timestamp
// se tiene que generar en un tiempo determinado y omitir los sms anteriores
// en caso de que el bot se apague cuando vuelva a encender debe generar el reporte si es la fecha correspondiente generarlo
// hay que hacerlo con un formato  de columnas y celdas personalizadas del sheet
console.log('✅ Bot iniciado correctamente. Esperando mensajes...');
