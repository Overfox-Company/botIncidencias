import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { analyzeSMSBeforeSave, cleanSMS, guardarTemporal } from '../functions.js';

const buildValidTelecomSms = (overrides = {}) => {
    const defaults = {
        estado: 'Táchira',
        fechaInicio: '03/04/2026',
        fechaFinalizada: '03/04/2026',
        horaInicio: '10:30 am',
        horaCierre: '02:00 pm',
        descripcion: 'Falla en el sistema de respaldo principal.',
        area: 'SISTEMAS DE RESPALDO DE ENERGÍA',
        impacto: 'Interrupción parcial del servicio en el nodo principal.',
        importancia: 'alto',
        actividades: 'Se reemplazó el módulo averiado y se validó la operación.',
        estatus: 'Resuelta',
        puntosAtencion: 'Subestación San Cristóbal.',
        gerente: 'Ing. William Castro.',
        coordinadorTitulo: 'coordinador de telecomunicaciones',
        coordinador: 'Ing Jose Parada',
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

    return [
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
        `Puntos de atención: ${values.puntosAtencion}`,
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
    ].join('\n');
};

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