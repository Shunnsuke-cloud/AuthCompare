import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp, readConfig, COOKIES } from '../src/app.js';

const config = { port: 3000, origin: 'http://localhost:3000', sessionSecret: 's'.repeat(64), jwtSecret: 'j'.repeat(64), jwtTtl: 120, sessionTtl: 900, secure: false };
const credentials = { username: 'student', password: 'demo-password' };
const post = (client, path, body = credentials) => client.post(path).set('Origin', config.origin).set('X-AuthCompare-CSRF', '1').send(body);
const cookie = (res, name) => res.headers['set-cookie'].find(value => value.startsWith(`${name}=`)).split(';')[0];

for (const method of ['session', 'jwt']) {
  test(`${method}: 未認証・失敗・成功・Cookie属性・削除・ログアウト`, async () => {
    const app = createApp(config);
    const client = request.agent(app);
    await client.get(`/api/${method}/me`).expect(401);
    await post(client, `/api/${method}/login`, { ...credentials, password: 'wrong' }).expect(401);
    const login = await post(client, `/api/${method}/login`).expect(200);
    assert.equal(login.body.authenticated, true);
    const setCookie = login.headers['set-cookie'].join(';');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Lax/);
    assert.doesNotMatch(setCookie, /; Secure/);
    assert.doesNotMatch(JSON.stringify(login.body), /demo-password/);
    const saved = cookie(login, COOKIES[method]);
    assert.ok(!JSON.stringify(login.body).includes(saved.slice(saved.indexOf('=') + 1)));
    await client.get(`/api/${method}/me`).expect(200);
    // Cookieを持たない別クライアント＝Cookie削除後の要求。
    await request(app).get(`/api/${method}/me`).expect(401);
    // 失敗した再ログインでも既存のログインは継続する。
    await post(client, `/api/${method}/login`, { ...credentials, password: 'wrong' }).expect(401);
    await client.get(`/api/${method}/me`).expect(200);
    const logout = await post(client, `/api/${method}/logout`, {}).expect(200);
    assert.match(logout.headers['set-cookie'].join(';'), /Expires=Thu, 01 Jan 1970/);
    await client.get(`/api/${method}/me`).expect(401);
    // Sessionはサーバーで破棄される。JWTはCookieを削除しても署名済みトークン自体は有効。
    await request(app).get(`/api/${method}/me`).set('Cookie', saved).expect(method === 'jwt' ? 200 : 401);
  });
  test(`${method}: ログイン・ログアウトへのCSRFを拒否`, async () => {
    const app = createApp(config);
    for (const action of ['login', 'logout']) {
      await request(app).post(`/api/${method}/${action}`).send(credentials).expect(403);
      await request(app).post(`/api/${method}/${action}`).set('Origin', 'https://attacker.example').set('X-AuthCompare-CSRF', '1').send(credentials).expect(403);
      await request(app).post(`/api/${method}/${action}`).set('Origin', config.origin).send(credentials).expect(403);
      await post(request(app), `/api/${method}/${action}`).set('Sec-Fetch-Site', 'cross-site').expect(403);
      await request(app).post(`/api/${method}/${action}`).set('Origin', config.origin).set('X-AuthCompare-CSRF', '1').type('form').send(credentials).expect(415);
    }
  });
}
test('Session: ログインごとにIDを再生成し、古いIDは使えない', async () => {
  const app = createApp(config);
  const client = request.agent(app);
  const oldCookie = cookie(await post(client, '/api/session/login'), COOKIES.session);
  const newCookie = cookie(await post(client, '/api/session/login'), COOKIES.session);
  assert.notEqual(oldCookie, newCookie);
  await request(app).get('/api/session/me').set('Cookie', oldCookie).expect(401);
  await client.get('/api/session/me').expect(200);
});
test('Session: サーバー再起動でMemoryStoreのログインは消える', async () => {
  const login = await post(request(createApp(config)), '/api/session/login');
  await request(createApp(config)).get('/api/session/me').set('Cookie', cookie(login, COOKIES.session)).expect(401);
});
test('Session: サーバー側の有効期限切れを拒否', async () => {
  const app = createApp({ ...config, sessionTtl: 0.03 });
  const login = await post(request(app), '/api/session/login');
  await new Promise(resolve => setTimeout(resolve, 80));
  await request(app).get('/api/session/me').set('Cookie', cookie(login, COOKIES.session)).expect(401);
});
test('JWT: HeaderとPayloadの学習情報、Session Cookieなし', async () => {
  const login = await post(request(createApp(config)), '/api/jwt/login').expect(200);
  assert.equal(login.body.header.alg, 'HS256');
  assert.equal(login.body.payload.exp - login.body.payload.iat, 120);
  assert.equal(login.body.payload.sub, 'student-001');
  assert.equal(login.body.payload.password, undefined);
  assert.equal(login.body.signature, undefined);
  assert.ok(login.headers['set-cookie'].every(value => !value.startsWith(COOKIES.session)));
});
test('JWT: 不正値・改ざん・期限切れ・誤った発行者/宛先/アルゴリズムを拒否', async () => {
  const app = createApp(config);
  const options = { subject: 'student-001', issuer: 'auth-compare', audience: 'auth-compare-browser', expiresIn: 120 };
  const sign = (secret, overrides = {}) => jwt.sign({ username: 'student' }, secret, { ...options, ...overrides });
  const cases = ['not-a-jwt', sign('wrong-secret'), sign(config.jwtSecret, { expiresIn: -1 }),
    sign(config.jwtSecret, { issuer: 'other' }), sign(config.jwtSecret, { audience: 'other' }), sign(config.jwtSecret, { algorithm: 'HS384' })];
  for (const token of cases) {
    const res = await request(app).get('/api/jwt/me').set('Cookie', `${COOKIES.jwt}=${token}`).expect(401);
    assert.equal(res.body.payload, undefined);
    assert.match(res.headers['set-cookie'].join(';'), /Expires=Thu, 01 Jan 1970/);
  }
  const expired = await request(app).get('/api/jwt/me').set('Cookie', `${COOKIES.jwt}=${cases[2]}`);
  assert.match(expired.body.message, /有効期限/);
});
test('JWT: 同じ秘密鍵なら別サーバーインスタンスでも検証できる', async () => {
  const login = await post(request(createApp(config)), '/api/jwt/login');
  await request(createApp(config)).get('/api/jwt/me').set('Cookie', cookie(login, COOKIES.jwt)).expect(200);
});
test('Secure属性・レスポンスのキャッシュ抑止・CSP', async () => {
  const app = createApp({ ...config, secure: true });
  const login = await post(request(app), '/api/jwt/login').expect(200);
  assert.match(login.headers['set-cookie'].join(';'), /; Secure/);
  const page = await request(app).get('/').expect(200);
  assert.equal(page.headers['cache-control'], 'no-store');
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  await request(app).get('/app.js').expect(200);
  await request(app).get('/style.css').expect(200);
});
test('設定: 弱い秘密値・同一秘密値・不正な期限やOriginを拒否', () => {
  const env = { SESSION_SECRET: config.sessionSecret, JWT_SECRET: config.jwtSecret };
  assert.equal(readConfig(env).port, 3000);
  for (const overrides of [{ JWT_SECRET: 'short' }, { JWT_SECRET: config.sessionSecret }, { JWT_TTL_SECONDS: '0' }, { APP_ORIGIN: 'https://attacker.example' }, { COOKIE_SECURE: 'yes' }]) {
    assert.throws(() => readConfig({ ...env, ...overrides }));
  }
});
