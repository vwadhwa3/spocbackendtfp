const http = require('http');
const options = { hostname: 'localhost', port: 3002, path: '/api/auth/login', method: 'GET' };
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => console.log('GET login:', res.statusCode, body));
});
req.on('error', e => console.error('Error:', e.message));
req.end();