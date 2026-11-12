import { z } from 'zod';
import { body, handler, json } from '@/server/http';
import { getSettings, MappingZ, MatrixZ, saveMapping, saveMatrix } from '@/server/budget';
import { budgetAuth } from '@/server/budget/http';

/** GET /budgets/settings — the matrix, the Excel model (name, size) and its mapping. */
export const GET = handler(async () => {
  const auth = await budgetAuth();
  return json({ settings: await getSettings(auth) });
});

/** PUT /budgets/settings — { matrix } or { mapping }. */
export const PUT = handler(async (req) => {
  const input = await body(req, z.union([z.object({ matrix: MatrixZ }), z.object({ mapping: MappingZ })]));
  const auth = await budgetAuth();
  const settings =
    'matrix' in input ? await saveMatrix(auth, input.matrix) : await saveMapping(auth, input.mapping);
  return json({ settings });
});
