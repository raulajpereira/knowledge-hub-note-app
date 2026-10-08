import { describe, expect, it } from 'vitest';
import { suggestTags } from '@/lib/tags';

const ALL = [
  { name: 'SAP', count: 9 },
  { name: 'go-live', count: 5 },
  { name: 'Migração SAP', count: 4 },
  { name: 'api', count: 3 },
  { name: 'Usap', count: 1 },
];

describe('tag suggestions', () => {
  it('lists the most used first when nothing is typed, without the tags already set', () => {
    expect(suggestTags(ALL, '', ['api'])).toEqual(['SAP', 'go-live', 'Migração SAP', 'Usap']);
  });
  it('ranks the start of the tag, then of a word, then anywhere — case-insensitive', () => {
    expect(suggestTags(ALL, 'sap', [])).toEqual(['SAP', 'Migração SAP', 'Usap']);
    expect(suggestTags(ALL, 'LIVE', [])).toEqual(['go-live']);
  });
  it('excludes regardless of case and caps the list', () => {
    expect(suggestTags(ALL, 'sap', ['sap'])).toEqual(['Migração SAP', 'Usap']);
    expect(suggestTags(ALL, '', [], 2)).toEqual(['SAP', 'go-live']);
  });
});
