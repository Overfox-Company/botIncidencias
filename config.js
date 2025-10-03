export const TOKEN = '8236415704:AAGRAnTHv_TUBg3k1-21UjCzlF4mvr_PpIg'; // tu token aquí

// 📅 Configuración del día y hora del reporte
// 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
export const DIA_REPORTE = 2;  // dia de la semana
const HORA_REPORTE = 13 // hora del dia en hora militar (0-23)
const MINUTO_REPORTE = 20; // minuto exacto (0-59)

// 🕒 Generar expresión CRON automáticamente
// '0 0 HORA * * DIA' → minutos=0, horas=HORA, díaSemana=DIA
export const INTERVALO_REPORTE = `0 ${MINUTO_REPORTE} ${HORA_REPORTE} * * ${DIA_REPORTE}`;
export const INTERVALO_PRUEBA = '0 */30 * * * *';


//Mensajes de bienvenida

const Presentacion = '👋 ¡Hola soy el asistente de marimar! Estoy aquí para ayudarla en su flujo de trabajo'
const Instrucciones = '📋 Envía cualquier mensaje y lo registraré para generar un reporte semanal de todas las incidencias que surjan'
export const MENSAJE_BIENVENIDA = `${Presentacion}\n\n${Instrucciones}`;


export const EXPORT_ROUTE = './exports/'; // Ruta donde se guardarán los archivos exportados
export const TEMPLATE_ROUTE = './template/incidencias.xlsx'; // Ruta de la plantilla de Excel
export const TEMP_DATA_FILE = './temp/temporal.json'; // Archivo temporal para guardar mensajes