// A tiny OpenAI-compatible provider for tests (never used in production):
// keys must start with "test-"; chat answers stream deterministic text, or a
// fixed JSON when the system prompt asks for one; transcription returns text.
//   node tests/stubs/fakeAi.mjs [port]
import http from 'node:http';

const MODELS = ['fake-chat-1', 'fake-chat-2', 'whisper-large-v3-turbo'];

function answer(system, user) {
  if (/"todos"/.test(system))
    return JSON.stringify({
      title: 'Kick-off fase 2',
      summary: 'Resumo de teste: âmbito da fase 2 confirmado.',
      review: ['Validar mapeamento de rubricas'],
      todos: ['Pedro — preparar plano de testes'],
    });
  if (/"steps"/.test(system))
    return JSON.stringify({
      steps: [
        { step: 'Executar PC00_M19_CALC para o período', expected: 'Cálculo sem erros' },
        { step: 'Verificar resultados na PC_PAYRESULT', expected: 'Rubricas corretas' },
      ],
    });
  if (/code|código/i.test(system) && /explain|explica/i.test(system))
    return 'Explicação de teste: o programa **lê** os resultados de payroll.';
  const n = (user.match(/^\[\d+\]/gm) || []).length;
  return `Resposta de teste com ${n} fontes [1]. Fim.`;
}

export function startFakeAi(port = 4010) {
  const server = http.createServer(async (req, res) => {
    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer test-')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end('{"error":{"message":"invalid key"}}');
    }
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const path = (req.url ?? '').replace(/^\/v1/, '');
    if (req.method === 'GET' && path === '/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ data: MODELS.map((id) => ({ id })) }));
    }
    if (req.method === 'POST' && path === '/audio/transcriptions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: 'Transcrição de teste: decidimos avançar com a fase 2.' }));
    }
    if (req.method === 'POST' && path === '/chat/completions') {
      const body = JSON.parse(raw.toString('utf8') || '{}');
      if (!MODELS.includes(body.model)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end('{"error":{"message":"model not found"}}');
      }
      const msgs = body.messages ?? [];
      const system = msgs.find((m) => m.role === 'system')?.content ?? '';
      const user = [...msgs].reverse().find((m) => m.role === 'user')?.content ?? '';
      const text = answer(system, user);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const parts = text.match(/.{1,12}/gs) ?? [text];
      for (const p of parts)
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const port = Number(process.argv[2] || 4010);
  await startFakeAi(port);
  console.log(`fake AI on http://127.0.0.1:${port}`);
}
