export const TOKEN = '8757545402:AAGC3UJ2tkToSzEK3vdGW9o5su7unDCTZb8'; // tu token aquí
// 📅 Configuración del día y hora del reporte
// 0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado
export const DIA_REPORTE = 4;  // dia de la semana
const HORA_REPORTE = 11 // hora del dia en hora militar (0-23)
const MINUTO_REPORTE = 0; // minuto exacto (0-59)

// 🕒 Generar expresión CRON automáticamente
// '0 0 HORA * * DIA' → minutos=0, horas=HORA, díaSemana=DIA
export async function INTERVALO_REPORTE() {

    const { Configuration } = await import("./utils/DBClient.js");


    const datos = await Configuration.findFirst({
        where: { id: 1 },
    });
    // console.log(datos)
    return `0 ${MINUTO_REPORTE} ${datos.hour} * * ${datos.day}`;
}
export const INTERVALO_PRUEBA = '0 */30 * * * *';


//Mensajes de bienvenida

const Presentacion = '👋 ¡Hola soy el asistente de la gerencia ATIT Táchira! Estoy aquí para ayudar a procesar las incidencias'
const Instrucciones = '📋 Envía cualquier mensaje y lo registraré para generar un reporte semanal de todas las incidencias que surjan'
export const MENSAJE_BIENVENIDA = `${Presentacion}\n\n${Instrucciones}`;


export const EXPORT_ROUTE = './exports/'; // Ruta donde se guardarán los archivos exportados
export const TEMPLATE_ROUTE = './template/incidencias.xlsx'; // Ruta de la plantilla de Excel
export const TEMP_DATA_FILE = './temp/temporal.json'; // Archivo temporal para guardar mensajes