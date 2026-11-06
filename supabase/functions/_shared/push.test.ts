// Ejecutar: node --test supabase/functions/_shared/push.test.ts   (Node ≥ 23.6)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { construirMensajes, construirTexto, eventoValido, lotes, tokensInvalidos, type InfoIncidencia } from './push.ts';

const inc: InfoIncidencia = { id: 12, clase: 'bache', severidad: 'alta', estado: 'en_proceso', alcaldia: 'Coyoacán' };

describe('construirTexto', () => {
  it('cambio de estado', () => {
    assert.deepEqual(construirTexto('estado', inc), {
      title: 'Bache en Coyoacán: En proceso',
      body: 'La incidencia #12 que sigues cambió a «En proceso».',
    });
  });
  it('resuelto', () => {
    assert.equal(construirTexto('estado', { ...inc, estado: 'resuelto' }).title, 'Bache resuelto en Coyoacán');
  });
  it('nueva alta sin alcaldía', () => {
    assert.equal(construirTexto('nueva_alta', { ...inc, clase: 'basura', alcaldia: null }).title, 'Basura acumulada de severidad alta');
  });
});

describe('construirMensajes', () => {
  it('quita tokens repetidos y marca prioridad alta en nuevas altas', () => {
    const m = construirMensajes('nueva_alta', inc, ['a', 'b', 'a']);
    assert.deepEqual(m.map((x) => x.to), ['a', 'b']);
    assert.equal(m[0].priority, 'high');
    assert.deepEqual(m[0].data, { incidenciaId: 12 });
  });
});

describe('lotes', () => {
  it('parte en grupos de 100', () => {
    const r = lotes(Array.from({ length: 250 }, (_, i) => i));
    assert.deepEqual(r.map((x) => x.length), [100, 100, 50]);
  });
  it('vacío → sin lotes', () => assert.deepEqual(lotes([]), []));
});

describe('tokensInvalidos', () => {
  it('devuelve solo los DeviceNotRegistered', () => {
    const m = construirMensajes('estado', inc, ['a', 'b', 'c']);
    const r = tokensInvalidos(m, [
      { status: 'ok', id: '1' },
      { status: 'error', message: 'x', details: { error: 'DeviceNotRegistered' } },
      { status: 'error', message: 'y', details: { error: 'MessageRateExceeded' } },
    ]);
    assert.deepEqual(r, ['b']);
  });
});

describe('eventoValido', () => {
  it('acepta solo eventos conocidos', () => {
    assert.ok(eventoValido('estado'));
    assert.ok(!eventoValido('otro'));
  });
});
