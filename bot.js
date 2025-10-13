import { INTERVALO_REPORTE, MENSAJE_BIENVENIDA, TOKEN, DIA_REPORTE } from './config.js'; // Importar el token desde config.js

import TelegramBot from 'node-telegram-bot-api';
import { TEMP_DATA_FILE } from './config.js';
import fs from 'fs';
import cron from 'node-cron';
import { generarIncidencias, guardarTemporal, analyzeSMSBeforeSave } from './functions.js';


const bot = new TelegramBot(TOKEN, { polling: true });

// Archivo temporal donde guardamos mensajes para no perderlos si se apaga el bot
const dataFile = TEMP_DATA_FILE;

// Cargar datos guardados si existen
console.log('📂 Verificando datos temporales...');


//bot.on("polling_error", (err) => console.error("Polling error:", err));

// Escuchar mensajes y filtrar por rango de fechas
bot.on('message', (msg) => {
    if (msg.text === '/start') {
        bot.sendMessage(msg.chat.id, MENSAJE_BIENVENIDA);
        return;
    }
    const usuario = msg.from.username || `${msg.from.first_name} ${msg.from.last_name || ''}`;
    const texto = msg.text || '';


    // Guardar mensaje con fecha exacta
    const mensajes = {
        Usuario: usuario,
        Mensaje: texto,
        Fecha: new Date().toLocaleString()
    };
    const { ok, errors } = analyzeSMSBeforeSave(texto);
    console.log(ok)
    console.log(errors)
    if (!ok) {
        bot.sendMessage(msg.chat.id, `❌ El mensaje no cumple con el formato requerido, ${usuario}. Por favor revisa los siguientes errores:\n\n- ${errors.join('\n- ')}`);
        return;
    }
    console.log('💾 Guardando mensaje');
    guardarTemporal(dataFile, mensajes);

    bot.sendMessage(msg.chat.id, `✅ Tu reporte ha sido registrado, ${usuario}. Gracias por informar.`);
});

// Programar tarea: todos los viernes a las 18:00
cron.schedule(INTERVALO_REPORTE, () => {
    console.log('🕒 Ejecutando tarea');
    generarIncidencias();
});

// Verificar al iniciar si es viernes y aún no se generó el reporte
(function checkStartup() {
    const hoy = new Date();
    if (hoy.getDay() === DIA_REPORTE) { // 5 = viernes
        const archivos = fs.readdirSync('.');
        const fechaHoy = hoy.toISOString().split('T')[0];
        const yaGenerado = archivos.some(a => a.includes(`reporte_${fechaHoy}.xlsx`));

        if (!yaGenerado) {
            console.log('📅 Hoy es viernes, generando reporte...');
            generarIncidencias();
        }
    }
})();
// se tiene que generar todos los sms en un excel
// se tiene que generar el nombre del archivo con un timestamp
// se tiene que generar en un tiempo determinado y omitir los sms anteriores
// en caso de que el bot se apague cuando vuelva a encender debe generar el reporte si es la fecha correspondiente generarlo
// hay que hacerlo con un formato  de columnas y celdas personalizadas del sheet
console.log('✅ Bot iniciado correctamente. Esperando mensajes...');