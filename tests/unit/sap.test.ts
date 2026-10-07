import { describe, expect, it } from 'vitest';
import { connectionText, envColor, modColor, sapShortcut, TX_SEED } from '@/lib/sap';

// SAP landscape helpers (ZNotes.dc.html gui() / copy()).
const sys = {
  sid: 'BSD',
  name: 'BSD - DEV',
  mandt: '100',
  router: '',
  host: '172.16.23.1',
  inst: '00',
  sapUser: 'RPEREIRA',
  lang: 'PT',
};

describe('SAP GUI shortcut', () => {
  it('builds the prototype .sap file', () => {
    const f = sapShortcut(sys);
    expect(f.file).toBe('BSD_100.sap');
    expect(f.body.split('\r\n')).toEqual([
      '[System]',
      'Name=BSD',
      'Description=BSD - DEV',
      'Client=100',
      'GuiParm=/H/172.16.23.1/S/3200',
      '[User]',
      'Name=RPEREIRA',
      'Language=PT',
      '[Function]',
      'Command=SMEN',
      '[Configuration]',
      'WorkDir=',
      '[Options]',
      'Reuse=1',
    ]);
  });
  it('uses the settings (language, start transaction) and a SAProuter', () => {
    const f = sapShortcut(
      { ...sys, router: '/H/saprouter.example/S/3299', inst: '01' },
      { lang: 'EN', tx: 'se38 ' },
    );
    expect(f.body).toContain('GuiParm=/H/saprouter.example/S/3299/H/172.16.23.1/S/3201');
    expect(f.body).toContain('Language=EN');
    expect(f.body).toContain('Command=SE38');
  });
  it('cannot inject extra sections through a field', () => {
    const f = sapShortcut({ ...sys, name: 'X\r\n[Function]\r\nCommand=SU01', sid: '../evil' });
    expect(f.body.split('\r\n').filter((l) => l === '[Function]')).toHaveLength(1);
    expect(f.file).toBe('evil_100.sap');
  });
});

it('connection text, colours and the prototype catalogue', () => {
  expect(
    connectionText({ ...sys, router: 'r' }, { host: 'Servidor', inst: 'Instância', mandt: 'Mandante' }),
  ).toBe('BSD - DEV\nSID: BSD\nServidor: 172.16.23.1\nInstância: 00\nMandante: 100\nSAProuter: r');
  expect(envColor('PRD')).toBe('oklch(0.72 0.17 25)');
  expect(envColor('X')).toBe('oklch(0.8 0 0)');
  expect(modColor('FI')).toBe('oklch(0.82 0.12 150)');
  expect(TX_SEED).toHaveLength(23);
});
