import 'server-only';
import { requireContent } from '@/server/content/guard';

/** The person, with "Orçamentos" in their plan. */
export const budgetAuth = () => requireContent('mg_budget');
