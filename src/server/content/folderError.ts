import { ApiError } from '@/server/errors';

/**
 * Drizzle wraps the driver error. The kh_note_folder_owner trigger raises
 * 23503 for a foreign notebook; the shared-folder trigger and RLS raise 42501
 * for a shared folder the writer can't edit.
 */
export function folderError(e: { code?: string; cause?: { code?: string } }): never {
  const c = e.code ?? e.cause?.code;
  if (c === '23503') throw new ApiError(400, 'folder_not_found');
  if (c === '42501') throw new ApiError(403, 'forbidden');
  throw e;
}
