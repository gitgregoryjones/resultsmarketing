const { Readable } = require('node:stream');
const { handleRequest } = require('../../server');

function buildRequest(event) {
  const body = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '');
  const req = Readable.from(body.length ? [body] : []);
  req.method = event.httpMethod || 'GET';
  const rawPath = event.rawUrl ? new URL(event.rawUrl).pathname : event.path || '/';
  const path = rawPath.replace(/^\/\.netlify\/functions\/server\/?/, '/') || '/';
  const query = event.rawUrl
    ? new URL(event.rawUrl).search
    : event.rawQuery
      ? `?${event.rawQuery}`
      : '';
  req.url = `${path}${query}`;
  req.headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])
  );
  return req;
}

function buildResponse(resolve) {
  const chunks = [];
  const headers = {};
  let statusCode = 200;
  return {
    writeHead(status, responseHeaders = {}) {
      statusCode = status;
      Object.assign(headers, responseHeaders);
    },
    write(chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    },
    end(chunk) {
      if (chunk) this.write(chunk);
      const bodyBuffer = Buffer.concat(chunks);
      const contentType = headers['Content-Type'] || headers['content-type'] || '';
      const isText = /^text\//i.test(contentType) || /json|javascript|svg/i.test(contentType);
      resolve({
        statusCode,
        headers,
        body: isText ? bodyBuffer.toString('utf8') : bodyBuffer.toString('base64'),
        isBase64Encoded: !isText,
      });
    },
  };
}

exports.handler = async (event) => new Promise((resolve) => {
  const req = buildRequest(event);
  const res = buildResponse(resolve);
  handleRequest(req, res).catch((err) => {
    console.error(err);
    resolve({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error' }),
    });
  });
});
