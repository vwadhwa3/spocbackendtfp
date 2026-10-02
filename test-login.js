const http = require('http');
const data = JSON.stringify({email:'dummy.spoc@theflyingpanda.com', password:'Dummy@2026!'});
const options = {
  hostname: 'localhost',
  port: 3002,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});
req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();