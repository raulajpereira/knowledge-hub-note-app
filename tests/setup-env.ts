// Integration tests run the real services against a disposable database.
// They are skipped unless TEST_DATABASE_URL / TEST_DATABASE_ADMIN_URL are set.
import os from 'node:os';
import path from 'node:path';

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;
  process.env.APP_URL ??= 'http://127.0.0.1:3100/v2';
  process.env.NEXT_PUBLIC_BASE_PATH ??= '/v2';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.S3_ENDPOINT ??= 'http://localhost:9000';
  process.env.S3_BUCKET ??= 'kh-files';
  process.env.S3_ACCESS_KEY ??= 'kh-minio';
  process.env.S3_SECRET_KEY ??= 'test-minio-secret';
  process.env.ENCRYPTION_KEY ??= '1'.repeat(64);
  process.env.HIBP_CHECK = 'false';
  process.env.MAIL_DIRECT = 'true';
  process.env.MAIL_OUTBOX_DIR ??= path.join(os.tmpdir(), `kh-outbox-${process.pid}`);
  process.env.SUPERADMIN_EMAIL ??= 'owner@example.com';
  process.env.SUPERADMIN_NAME ??= 'Owner Test';
}
