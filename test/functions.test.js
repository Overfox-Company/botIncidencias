import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { analyzeSMSBeforeSave, cleanSMS, construirFilaIncidencia, guardarTemporal } from '../functions.js';

const VARIANT_FIXTURES = {
    telecomunicaciones: {
        coordinadorTitulo: 'coordinador de telecomunicaciones',
        coordinador: 'Ing Jose Parada',
        areas: [
            'SISTEMAS DE RESPALDO DE ENERGÍA',
            'SISTEMA DE CLIMATIZACION',
            'MANTENIMIENTO DE LA PLATAFORMA',
            'ENLACES DE RADIOCOMUNICACIONES',
            'ENLACES DE FIBRA OPTICA',
            'RED DE DATOS Y SISTEMAS DE TELEFONIA',
            'RED DE DATOS Y SISTEMAS',
            'COMUNICACIONES MÓVILES'
        ]
    },
    infraestructura: {
        coordinadorTitulo: 'coordinador de infraestructura',
        coordinador: 'Ing. Leonel Duarte',
        areas: [
            'INFRAESTRUCTURA TECNOLÓGICA'
        ]
    },
    automatizacion: {
        coordinadorTitulo: 'coordinador de automatizacion',
        coordinador: 'Ing Freddy Ruiz',
        areas: [
            'TELEPROTECCIÓN, TELEMETRIA Y TELEMEDICION',
            'SISTEMAS DE AUTOMATIZACIÓN'
        ]
    }
};

const buildValidSms = (variant = 'telecomunicaciones', overrides = {}) => {
    const variantConfig = VARIANT_FIXTURES[variant];
    if (!variantConfig) {
        throw new Error(`Variante no soportada en tests: ${variant}`);
    }

    const defaults = {
        estado: 'Táchira',
        fechaInicio: '03/04/2026',
        fechaFinalizada: '03/04/2026',
        horaInicio: '10:30 am',
        horaCierre: '02:00 pm',
        descripcion: 'Falla en el sistema de respaldo principal.',
        area: variantConfig.areas[0],
        impacto: 'Interrupción parcial del servicio en el nodo principal.',
        importancia: 'alto',
        actividades: 'Se reemplazó el módulo averiado y se validó la operación.',
        estatus: 'Resuelta',
        puntosAtencion: 'Subestación San Cristóbal.',
        gerente: 'Ing. William Castro.',
        coordinadorTitulo: variantConfig.coordinadorTitulo,
        coordinador: variantConfig.coordinador,
        personalBlocks: [
            {
                title: 'Personal ejecutor',
                lines: ['Ing Joel Zambrano']
            }
        ]
    };

    const values = { ...defaults, ...overrides };
    const personalBlocks = values.personalBlocks
        .map((block) => [block.title + ':', ...block.lines].join('\n'))
        .join('\n\n');

    const lines = [
        `Estado: ${values.estado}`,
        `Fecha de inicio: ${values.fechaInicio}`,
        `Fecha finalizada: ${values.fechaFinalizada}`,
        `Hora de inicio: ${values.horaInicio}`,
        `Hora de cierre: ${values.horaCierre}`,
        '',
        `Descripción: ${values.descripcion}`,
        '',
        'Área:',
        values.area,
        '',
        `Impacto: ${values.impacto}`,
        '',
        `Importancia: ${values.importancia}`,
        '',
        `Actividades: ${values.actividades}`,
        '',
        `Estatus: ${values.estatus}`,
        '',
        'Gerente estatal de atit:',
        values.gerente,
        '',
        `${values.coordinadorTitulo}:`,
        values.coordinador,
        '',
        personalBlocks,
        '',
        '"ATIT, Somos la voz comando y control del SEN, nadie se cansa"'
    ];

    if (values.puntosAtencion !== undefined) {
        lines.splice(18, 0, `Puntos de atención: ${values.puntosAtencion}`, '');
    }

    return lines.join('\n');
};

const buildValidTelecomSms = (overrides = {}) => buildValidSms('telecomunicaciones', overrides);

test('guardarTemporal crea y agrega mensajes en un archivo JSON', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telegram-bot-test-'));
    const dataFile = path.join(tempDir, 'temporal.json');

    guardarTemporal(dataFile, { Usuario: 'A', Mensaje: 'uno' });
    guardarTemporal(dataFile, { Usuario: 'B', Mensaje: 'dos' });

    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    assert.equal(saved.length, 2);
    assert.deepEqual(saved[0], { Usuario: 'A', Mensaje: 'uno' });
    assert.deepEqual(saved[1], { Usuario: 'B', Mensaje: 'dos' });
});

test('cleanSMS extrae los campos principales y omite el footer del template', () => {
    const sms = buildValidTelecomSms({
        personalBlocks: [
            { title: 'Personal ejecutor', lines: ['Ing Joel Zambrano'] },
            { title: 'Personal de CANTV', lines: ['Cantv 1', 'Cantv 2'] },
            { title: 'Personal de ATIT Mérida', lines: ['Merida 1', 'Merida 2'] }
        ]
    });

    const parsed = cleanSMS(sms);

    assert.equal(parsed.estado, 'Táchira');
    assert.equal(parsed.indicador, 'SISTEMAS DE RESPALDO DE ENERGÍA');
    assert.equal(parsed.trabajosRealizados, 'Se reemplazó el módulo averiado y se validó la operación.');
    assert.equal(parsed.estatus, 'Resuelta');
    assert.equal(parsed.personalSections.length, 3);
    assert.match(parsed.personalEjecutor, /Personal ejecutor:/);
    assert.match(parsed.personalEjecutor, /Personal de CANTV:/);
    assert.match(parsed.personalEjecutor, /Personal de ATIT Mérida:/);
    assert.doesNotMatch(parsed.personalEjecutor, /ATIT, Somos la voz comando y control del SEN/);
});

test('cleanSMS no reconoce palabras clave incrustadas dentro de otra sección', () => {
    const sms = [
        'Estado: Táchira',
        'Fecha de inicio: 03/04/2026',
        'Fecha finalizada: 03/04/2026',
        'Hora de inicio: 10:30 am',
        'Hora de cierre: 02:00 pm',
        '',
        'Descripción: Durante la atención se documentaron actividades de respaldo y validaciones internas sin crear un nuevo apartado.',
        '',
        'Área:',
        'SISTEMAS DE RESPALDO DE ENERGÍA',
        '',
        'Impacto: Interrupción parcial del servicio en el nodo principal.',
        '',
        'Importancia: alto',
        '',
        'Estatus: Resuelta'
    ].join('\n');

    const parsed = cleanSMS(sms);

    assert.match(parsed.descripcion, /actividades de respaldo/i);
    assert.equal(parsed.trabajosRealizados, undefined);
});

test('cleanSMS exige que la palabra clave comience la línea para reconocer actividades', () => {
    const sms = [
        'Estado: Táchira',
        'Fecha de inicio: 03/04/2026',
        'Fecha finalizada: 03/04/2026',
        'Hora de inicio: 10:30 am',
        'Hora de cierre: 02:00 pm',
        '',
        'Descripción: Se dejó constancia. Nota técnica Actividades: este texto sigue siendo parte de la descripción.',
        '',
        'Área:',
        'SISTEMAS DE RESPALDO DE ENERGÍA',
        '',
        'Impacto: Interrupción parcial del servicio en el nodo principal.',
        '',
        'Importancia: alto',
        '',
        'Estatus: Resuelta'
    ].join('\n');

    const parsed = cleanSMS(sms);

    assert.match(parsed.descripcion, /Nota técnica Actividades:/);
    assert.equal(parsed.trabajosRealizados, undefined);
});

test('construirFilaIncidencia alinea descripción y actividades con la plantilla del Excel', () => {
    const fila = construirFilaIncidencia(0, {
        descripcion: 'Descripcion esperada',
        indicador: 'ENLACES DE FIBRA OPTICA',
        impacto: 'Impacto esperado',
        clasificacionImpacto: 'medio',
        estado: 'Táchira',
        fechaInicio: '03/04/2026',
        fechaFinalizado: '03/04/2026',
        horaInicio: '10:30 am',
        horaCierre: '02:00 pm',
        trabajosRealizados: 'Actividades esperadas',
        personalEjecutor: 'Ing Joel Zambrano',
        estatus: 'Resuelta',
        puntosAtencion: 'Sin novedad'
    }, () => '3 horas y 30 minutos');

    assert.equal(fila[1], 'Descripcion esperada');
    assert.equal(fila[2], 'ENLACES DE FIBRA OPTICA');
    assert.equal(fila[13], 'Actividades esperadas');
    assert.equal(fila[4], 'MEDIO');
});

test('analyzeSMSBeforeSave acepta un SMS válido y normaliza el personal consolidado', () => {
    const sms = buildValidTelecomSms({
        personalBlocks: [
            { title: 'Personal ejecutor', lines: ['Ing Joel Zambrano'] },
            { title: 'Personal de CANTV', lines: ['Cantv 1', 'Cantv 2'] },
            { title: 'Personal de total com', lines: ['Total com 1 y 2'] }
        ]
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.deepEqual(result.normalized.personalArray, [
        'Ing Joel Zambrano',
        'Cantv 1',
        'Cantv 2',
        'Total com 1 y 2'
    ]);
    assert.equal(result.normalized.coordinadorTipo, 'telecomunicaciones');
    assert.equal(result.normalized.indicador, 'SISTEMAS DE RESPALDO DE ENERGÍA');
});

test('analyzeSMSBeforeSave acepta bloques de personal aunque no exista Personal ejecutor', () => {
    const sms = buildValidTelecomSms({
        personalBlocks: [
            { title: 'Personal de CANTV', lines: ['Cantv 1', 'Cantv 2'] },
            { title: 'Personal de total com', lines: ['Total com 1'] }
        ]
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.match(result.parsed.personalEjecutor, /Personal de CANTV:/);
    assert.match(result.parsed.personalEjecutor, /Personal de total com:/);
});

test('analyzeSMSBeforeSave acepta personal ejecutor cuando los nombres vienen en la misma línea del encabezado', () => {
    const sms = [
        'Estado: Táchira',
        'Fecha de inicio: 23/03/2026',
        'Fecha finalizada: 23/03/2026',
        'Hora de inicio: 10:00 AM',
        'Hora de cierre: 05:00 PM',
        '',
        'Descripción: Caída de los Servicios de voz y datos en la Subestación La Grita',
        '',
        'Área:',
        '- SISTEMAS DE RESPALDO DE ENERGÍA',
        '',
        'Impacto: El operador de turno de la Subestación La Grita pierde comunicación con el despacho.',
        '',
        'Importancia: alto',
        '',
        'Actividades: Se realizó evaluación en sitio y se determinó la necesidad de sustituir el banco de baterías.',
        '',
        'Estatus: Pendiente por resolver.',
        '',
        'Puntos de atención: Se debe adquirir un banco de baterías nuevo a la brevedad posible.',
        '',
        'Gerente Estatal de Atit:',
        '- Ing. William Castro.',
        '',
        'coordinador de telecomunicaciones:',
        '- Ing. José Parada',
        '',
        'Personal ejecutor:                                                                                                                                                                                                              - Ing. Olga Lázaro.                                                                                                                                                                                                           - Ing. Alejandro Arbeláez ',
        '',
        '"ATIT, Somos la voz comando y control del SEN, nadie se cansa"'
    ].join('\n');

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.deepEqual(result.normalized.personalArray, [
        'Ing. Olga Lázaro.',
        'Ing. Alejandro Arbeláez'
    ]);
});

test('analyzeSMSBeforeSave reporta errores específicos cuando el template queda sin completar', () => {
    const templateSms = [
        'Estado: Táchira',
        'Fecha de inicio: DD/MM/AAAA',
        'Fecha finalizada: DD/MM/AAAA',
        'Hora de inicio: HH:MM AM/PM',
        'Hora de cierre: HH:MM AM/PM',
        '',
        'Descripción: hacer breve descripción de la incidencia',
        '',
        'Área:',
        '- SISTEMAS DE RESPALDO DE ENERGÍA',
        '- SISTEMA DE CLIMATIZACION',
        '',
        'Impacto: ...',
        '',
        'Importancia: bajo | medio | alto',
        '',
        'Actividades: describir detalladamente los trabajos realizados durante la atención de la incidencia',
        '',
        'Estatus: Resuelta | Pendiente por resolver',
        '',
        'Puntos de atención: ...',
        '',
        'Gerente estatal de atit:',
        'Ing. William Castro.',
        '',
        'coordinador de telecomunicaciones:',
        'Ing Jose Parada',
        '',
        'Personal ejecutor:',
        '- Nombre 1',
        '- Nombre 2'
    ].join('\n');

    const result = analyzeSMSBeforeSave(templateSms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Fecha de inicio: reemplaza DD\/MM\/AAAA/);
    assert.match(result.errors.join('\n'), /Hora de inicio: reemplaza HH:MM AM\/PM/);
    assert.match(result.errors.join('\n'), /Impacto: reemplaza "\.\.\."/);
    assert.match(result.errors.join('\n'), /Importancia: reemplaza "bajo \| medio \| alto"/);
    assert.match(result.errors.join('\n'), /Actividades: reemplaza el texto de ejemplo/);
    assert.match(result.errors.join('\n'), /Personal ejecutor: reemplaza Nombre 1 \/ Nombre 2/);
});

test('analyzeSMSBeforeSave rechaza un área que no corresponde a la coordinación', () => {
    const sms = buildValidTelecomSms({
        area: 'INFRAESTRUCTURA TECNOLÓGICA'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Área inválida para telecomunicaciones/);
});

test('analyzeSMSBeforeSave detecta inconsistencias de fecha y hora', () => {
    const sms = buildValidTelecomSms({
        fechaInicio: '05/04/2026',
        fechaFinalizada: '03/04/2026',
        horaInicio: '04:00 pm',
        horaCierre: '02:00 pm'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /La fecha de inicio es posterior a la fecha final/);
});

test('analyzeSMSBeforeSave reconoce el alias RED DE DATOS Y SISTEMAS para telecomunicaciones', () => {
    const sms = buildValidTelecomSms({
        area: 'RED DE DATOS Y SISTEMAS'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.equal(result.normalized.indicador, 'RED DE DATOS Y SISTEMAS');
});

test('analyzeSMSBeforeSave acepta RED DE DATOS Y SISTEMAS DE TELEFONIA sin confundirla con el alias superpuesto', () => {
    const sms = buildValidTelecomSms({
        area: 'RED DE DATOS Y SISTEMAS DE TELEFONIA'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.equal(result.normalized.indicador, 'RED DE DATOS Y SISTEMAS DE TELEFONIA');
});

test('analyzeSMSBeforeSave sigue detectando cuando el bloque Área conserva dos opciones superpuestas del template', () => {
    const sms = buildValidTelecomSms({
        area: '- RED DE DATOS Y SISTEMAS DE TELEFONIA\n- RED DE DATOS Y SISTEMAS'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Área: elimina las opciones del template y deja solo el área que corresponde a la incidencia/);
});

test('analyzeSMSBeforeSave permite omitir puntos de atención', () => {
    const sms = buildValidTelecomSms({
        puntosAtencion: undefined
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.equal(result.parsed.puntosAtencion, undefined);
});

test('analyzeSMSBeforeSave valida puntos de atención cuando se informa con placeholder', () => {
    const sms = buildValidTelecomSms({
        puntosAtencion: '...'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Puntos de atención: reemplaza "\.\.\." por la información real/);
});

test('analyzeSMSBeforeSave acepta la única área válida en infraestructura', () => {
    const sms = buildValidSms('infraestructura');

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.equal(result.normalized.coordinadorTipo, 'infraestructura');
    assert.equal(result.normalized.indicador, 'INFRAESTRUCTURA TECNOLÓGICA');
});

test('analyzeSMSBeforeSave tolera viñetas y puntuación final en campos cortos', () => {
    const sms = buildValidTelecomSms({
        area: '- SISTEMAS DE RESPALDO DE ENERGÍA.',
        importancia: '* alto.',
        estatus: 'Resuelta.',
        gerente: '- Ing. William Castro.',
        coordinador: '* Ing Jose Parada.'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.equal(result.parsed.indicador, 'SISTEMAS DE RESPALDO DE ENERGÍA');
    assert.equal(result.parsed.clasificacionImpacto, 'alto');
    assert.equal(result.parsed.estatus, 'Resuelta');
    assert.equal(result.parsed.gerenteEstatalAtit, 'Ing. William Castro');
    assert.equal(result.parsed.coordinadorTelecomunicaciones, 'Ing Jose Parada');
});

test('analyzeSMSBeforeSave tolera puntuación final en infraestructura', () => {
    const sms = buildValidSms('infraestructura', {
        area: 'INFRAESTRUCTURA TECNOLÓGICA.',
        importancia: 'bajo.',
        estatus: 'Resuelta.',
        coordinador: 'Ing. Leonel Duarte.'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, true);
    assert.equal(result.normalized.coordinadorTipo, 'infraestructura');
    assert.equal(result.normalized.indicador, 'INFRAESTRUCTURA TECNOLÓGICA');
    assert.equal(result.parsed.estatus, 'Resuelta');
});

for (const [variant, config] of Object.entries(VARIANT_FIXTURES)) {
    test(`analyzeSMSBeforeSave acepta un SMS válido de ${variant}`, () => {
        const sms = buildValidSms(variant);

        const result = analyzeSMSBeforeSave(sms);

        assert.equal(result.ok, true);
        assert.equal(result.normalized.coordinadorTipo, variant);
        assert.equal(result.normalized.coordinadorResponsable, config.coordinador);
        assert.equal(result.normalized.indicador, config.areas[0]);
    });

    for (const area of config.areas) {
        test(`analyzeSMSBeforeSave acepta el área ${area} para ${variant}`, () => {
            const sms = buildValidSms(variant, { area });

            const result = analyzeSMSBeforeSave(sms);

            assert.equal(result.ok, true);
            assert.equal(result.normalized.coordinadorTipo, variant);
            assert.equal(result.normalized.indicador, area);
        });
    }
}

test('analyzeSMSBeforeSave rechaza un área de telecomunicaciones dentro de automatizacion', () => {
    const sms = buildValidSms('automatizacion', {
        area: 'ENLACES DE FIBRA OPTICA'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Área inválida para automatizacion/);
});

test('analyzeSMSBeforeSave rechaza un área de automatizacion dentro de infraestructura', () => {
    const sms = buildValidSms('infraestructura', {
        area: 'SISTEMAS DE AUTOMATIZACIÓN'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Área inválida para infraestructura/);
});

test('analyzeSMSBeforeSave detecta template sin depurar en automatizacion', () => {
    const sms = buildValidSms('automatizacion', {
        area: '- TELEPROTECCIÓN, TELEMETRIA Y TELEMEDICION\n- SISTEMAS DE AUTOMATIZACIÓN'
    });

    const result = analyzeSMSBeforeSave(sms);

    assert.equal(result.ok, false);
    assert.match(result.errors.join('\n'), /Área: elimina las opciones del template y deja solo el área que corresponde a la incidencia/);
});