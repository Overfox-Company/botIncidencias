import { MENSAJE_BIENVENIDA, TOKEN, DIA_REPORTE, TEMP_DATA_FILE } from './config.js';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import cron from 'node-cron';
import { generarIncidencias, guardarTemporal, analyzeSMSBeforeSave } from './functions.js';
import { Configuration } from './utils/DBClient.js';

const bot = new TelegramBot(TOKEN, { polling: true });
const DEFAULT_HOUR = 11;
const FORMATO_SMS = `📝 Formato de SMS requerido:

Estado: Táchira
Fecha de inicio: DD/MM/AAAA
Fecha finalizada: DD/MM/AAAA
Hora de inicio: HH:MM AM/PM
Hora de cierre: HH:MM AM/PM

Hacer breve descripción de la incidencia: ...

área de la incidencia: ...

Impacto: ...

Importancia: bajo | medio | alto

describir detalladamente los trabajos realizados durante la atención de la incidencia: ...

estatus: Resuelta | Pendiente por resolver

Puntos de atención: ...

Gerente estatal de atit: ...

coordinador de telecomunicaciones: ...
coordinador de infraestructura: ...
coordinador de automatizacion: ...

personal ejecutor:
- Nombre 1
- Nombre 2

Personal de guardia:
- Nombre 1`;
const COMANDOS = new Set(['/start', '/formato']);

// Archivo temporal donde guardamos mensajes para no perderlos si se apaga el bot
const dataFile = TEMP_DATA_FILE;

// Cargar datos guardados si existen
console.log('📂 Verificando datos temporales...');

const obtenerUsuario = (msg) => (
    msg.from?.username ||
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') ||
    'usuario'
);

const responderFormato = (chatId) => bot.sendMessage(chatId, FORMATO_SMS);

const manejarComando = (msg, texto) => {
    if (texto === '/start') {
        bot.sendMessage(msg.chat.id, `${MENSAJE_BIENVENIDA}\n\nUsa /formato para ver la plantilla del SMS.`);
        return true;
    }

    if (texto === '/formato') {
        responderFormato(msg.chat.id);
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
        bot.sendMessage(msg.chat.id, '⚠️ Solo puedo procesar mensajes de texto. Usa /formato para ver la plantilla.');
        return;
    }

    if (manejarComando(msg, texto)) {
        return;
    }

    if (texto.startsWith('/') && !COMANDOS.has(texto)) {
        bot.sendMessage(msg.chat.id, '❓ Comando no reconocido. Usa /formato para ver la plantilla válida.');
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
