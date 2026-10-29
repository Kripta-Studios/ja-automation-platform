// Disposable browser fixture: directory reads work; mailbox writes fail.
import { createServer } from 'node:http';
createServer(async (request, response) => {
  if (request.method === 'GET') {
    response.end('ready');
    return;
  }
  let body = '';
  for await (const chunk of request) body += chunk;
  const { methodCalls } = JSON.parse(body);
  if (methodCalls.some(([method]) => method.endsWith('/set'))) {
    response.writeHead(503);
    response.end('Simulated mail outage');
    return;
  }
  const methodResponses = methodCalls.map(([method, , id]) => [
    method,
    method === 'x:Domain/query'
      ? { ids: ['test-domain'] }
      : method === 'x:Domain/get'
        ? { list: [{ id: 'test-domain', name: 'j-aautomation.com' }] }
        : { ids: [], total: 0 },
    id,
  ]);
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ methodResponses }));
}).listen(4178, '127.0.0.1');
