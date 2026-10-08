import { NextResponse } from 'next/server';
import { healthReport } from '@/lib/health';

export const dynamic = 'force-dynamic';

// ?strict=1 also fails when the worker has stopped (no heartbeat for 3 min):
// the address for an external uptime monitor, which also watches the worker
// that sends the alert emails.
export async function GET(req: Request) {
  const report = await healthReport();
  const strict = new URL(req.url).searchParams.get('strict') === '1';
  const beat = report.worker.lastHeartbeatSecondsAgo;
  const ok = report.ok && (!strict || (beat !== null && beat < 180));
  return NextResponse.json(report, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
