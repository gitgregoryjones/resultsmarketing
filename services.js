const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

function fetchServiceJson(serviceUrl) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(serviceUrl);
    } catch (err) {
      reject(new Error('Invalid service URL'));
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      reject(new Error('Unsupported service protocol'));
      return;
    }

    const transport = parsedUrl.protocol === 'https:' ? https : http;
    const request = transport.request(
      parsedUrl,
      { method: 'GET', headers: { Accept: 'application/json' } },
      (response) => {
        let body = '';
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Service responded with ${response.statusCode}`));
            return;
          }
          try {
            const json = JSON.parse(body || 'null');
            resolve(json);
          } catch (err) {
            reject(new Error('Unable to parse service response'));
          }
        });
      }
    );

    request.on('error', (err) => reject(err));
    request.end();
  });
}

module.exports = { fetchServiceJson };
