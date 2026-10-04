// Sample rows from the ZNotes prototype (SYS_SEED).
export type SysRow = {
  id: string;
  name: string;
  customer: string;
  sid: string;
  env: 'DEV' | 'QAS' | 'PRD';
  host: string;
  inst: string;
  mandt: string;
  type: string;
};

export const SYSTEMS: SysRow[] = [
  {
    id: 's1',
    name: 'BSD - DEV',
    customer: 'Banco SOL',
    sid: 'BSD',
    env: 'DEV',
    host: '172.16.23.1',
    inst: '00',
    mandt: '100',
    type: 'S/4HANA',
  },
  {
    id: 's2',
    name: 'BSP - PRD',
    customer: 'Banco SOL',
    sid: 'BSP',
    env: 'PRD',
    host: '172.16.23.6',
    inst: '00',
    mandt: '300',
    type: 'S/4HANA',
  },
  {
    id: 's3',
    name: 'BSQ - QAS',
    customer: 'Banco SOL',
    sid: 'BSQ',
    env: 'QAS',
    host: '172.16.23.4',
    inst: '00',
    mandt: '200',
    type: 'S/4HANA',
  },
  {
    id: 's4',
    name: 'ECP - DEV',
    customer: 'Grupo ID',
    sid: 'JOG',
    env: 'DEV',
    host: 'vaciJOG',
    inst: '00',
    mandt: '100',
    type: 'Employee Central Payroll',
  },
  {
    id: 's5',
    name: 'ECP - PRD',
    customer: 'Grupo ID',
    sid: 'JOI',
    env: 'PRD',
    host: 'vaciJOI',
    inst: '00',
    mandt: '100',
    type: 'Employee Central Payroll',
  },
  {
    id: 's6',
    name: 'ECP - QAS',
    customer: 'Grupo ID',
    sid: 'JOH',
    env: 'QAS',
    host: 'vaciJOH',
    inst: '00',
    mandt: '100',
    type: 'Employee Central Payroll',
  },
];

export const ENV_COLOR = {
  DEV: 'oklch(0.82 0.11 210)',
  QAS: 'oklch(0.85 0.12 75)',
  PRD: 'oklch(0.72 0.17 25)',
} as const;
