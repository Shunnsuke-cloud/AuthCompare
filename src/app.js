import express from 'express';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'node:url';

const USER = Object.freeze({ id: 'student-001', username: 'student' });
const ISSUER = 'auth-compare';
const AUDIENCE = 'auth-compare-browser';
export const COOKIES = { session: 'authcompare.sid', jwt: 'authcompare.jwt' };

export function readConfig(env) {
  const integer = (name, fallback, max) => {
    const value = Number(env[name] || fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`${name}の値が不正です。`);
    return value;
  };
  const port = integer('PORT', 3000, 65535);
  const origin = env.APP_ORIGIN || `http://localhost:${port}`;
  if (![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(origin)) {
    throw new Error('APP_ORIGINはPORTと一致するローカルHTTP URLにしてください。');
  }
  for (const key of ['SESSION_SECRET', 'JWT_SECRET']) {
    if (!env[key] || env[key].length < 32 || env[key].startsWith('replace-')) {
      throw new Error(`${key}にランダムな32文字以上の秘密値を設定してください。`);
    }
  }
  if (env.SESSION_SECRET === env.JWT_SECRET) throw new Error('2つの秘密値は別の値にしてください。');
  if (env.COOKIE_SECURE && !['true', 'false'].includes(env.COOKIE_SECURE)) throw new Error('COOKIE_SECUREはtrueまたはfalseです。');
  return { port, origin, sessionSecret: env.SESSION_SECRET, jwtSecret: env.JWT_SECRET,
    jwtTtl: integer('JWT_TTL_SECONDS', 120, 86400), sessionTtl: integer('SESSION_TTL_SECONDS', 900, 86400),
    secure: env.COOKIE_SECURE === 'true' };
}

export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.secure, path: '/' };
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    next();
  });
  // Login CSRFも防ぐ。ブラウザが他originから付けられないカスタムヘッダーと厳密なOriginを両方確認。
  // CORSを許可しないため、他originのスクリプトはpreflightを通過できない。
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('Origin') !== config.origin || req.get('X-AuthCompare-CSRF') !== '1' || req.get('Sec-Fetch-Site') === 'cross-site') {
        return res.status(403).json({ message: 'CSRF対策: Originと専用ヘッダーを確認してください。' });
      }
      if (!req.is('application/json')) return res.status(415).json({ message: 'JSON形式で送信してください。' });
    }
    next();
  });
  app.use(express.json({ limit: '2kb' }));
  app.use(cookieParser());
  // JWTルートにはsession middlewareを適用しない。JWTのログイン状態は保存しない。
  app.use('/api/session', session({ name: COOKIES.session, secret: config.sessionSecret,
    resave: false, saveUninitialized: false,
    cookie: { ...cookieOptions, maxAge: config.sessionTtl * 1000 } }));

  const validCredentials = (body) => body?.username === USER.username && body?.password === 'demo-password';
  const rejectLogin = (res) => res.status(401).json({ authenticated: false, message: 'ユーザー名またはパスワードが違います。既存の認証状態は状態確認で確認してください。' });
  const sessionInfo = (req) => ({ authenticated: true, method: 'Session', user: req.session.user,
    cookie: { name: COOKIES.session, contents: '署名付きSession ID（生の値は表示しません）', ...cookieOptions },
    server: { storage: 'MemoryStore（サーバーメモリ）', data: { user: req.session.user, loggedInAt: req.session.loggedInAt } },
    expiresAt: new Date(req.session.cookie.expires).toISOString(),
    flow: ['ブラウザ：Session IDのCookieを送信', 'サーバー：IDでSessionストアを検索', '認証確認：保存されたuserを確認', 'レスポンス：ユーザー情報を返す'] });
  app.post('/api/session/login', (req, res, next) => {
    if (!validCredentials(req.body)) return rejectLogin(res);
    // 古いIDを破棄し新しいIDを発行することでSession固定攻撃を防ぐ。
    req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.user = { ...USER };
      req.session.loggedInAt = new Date().toISOString();
      req.session.save((error) => error ? next(error) : res.json({ ...sessionInfo(req), message: 'ログイン成功。Session IDを再生成し、Cookieを発行しました。' }));
    });
  });
  app.get('/api/session/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ authenticated: false, method: 'Session', message: '未認証です。Cookieがない、Sessionが失効した、またはサーバーが再起動した可能性があります。' });
    res.json(sessionInfo(req));
  });
  app.post('/api/session/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      res.clearCookie(COOKIES.session, cookieOptions);
      res.json({ authenticated: false, method: 'Session', message: 'サーバーのSessionを破棄し、Cookieを削除しました。' });
    });
  });

  const jwtInfo = (verified) => ({ authenticated: true, method: 'JWT', user: { id: verified.payload.sub, username: verified.payload.username },
    cookie: { name: COOKIES.jwt, contents: '署名付きJWT（生の値は表示しません）', ...cookieOptions },
    header: verified.header, payload: verified.payload, expiresAt: new Date(verified.payload.exp * 1000).toISOString(),
    server: { storage: 'ログイン状態の保存なし。秘密鍵で毎回検証。' },
    flow: ['ブラウザ：JWTのCookieを送信', 'サーバー：署名・発行者・宛先を検証', '認証確認：有効期限とPayloadを確認', 'レスポンス：検証済みの情報を返す'] });
  const verify = (token) => jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE, complete: true });
  app.post('/api/jwt/login', (req, res) => {
    if (!validCredentials(req.body)) return rejectLogin(res);
    const token = jwt.sign({ username: USER.username }, config.jwtSecret, {
      algorithm: 'HS256', subject: USER.id, issuer: ISSUER, audience: AUDIENCE, expiresIn: config.jwtTtl });
    res.cookie(COOKIES.jwt, token, { ...cookieOptions, maxAge: config.jwtTtl * 1000 });
    res.json({ ...jwtInfo(verify(token)), message: 'ログイン成功。JWTを発行し、HttpOnly Cookieに保存しました。' });
  });
  app.get('/api/jwt/me', (req, res) => {
    if (!req.cookies[COOKIES.jwt]) return res.status(401).json({ authenticated: false, method: 'JWT', message: 'JWT Cookieがありません。' });
    try { res.json(jwtInfo(verify(req.cookies[COOKIES.jwt]))); }
    catch (error) {
      res.clearCookie(COOKIES.jwt, cookieOptions);
      res.status(401).json({ authenticated: false, method: 'JWT', message: error.name === 'TokenExpiredError' ? 'JWTの有効期限が切れています。Cookieを削除しました。' : 'JWTの検証に失敗しました。Cookieを削除しました。' });
    }
  });
  app.post('/api/jwt/logout', (req, res) => {
    res.clearCookie(COOKIES.jwt, cookieOptions);
    res.json({ authenticated: false, method: 'JWT', message: 'Cookieを削除しました。発行済みJWTそのものは有効期限まで有効です。' });
  });
  app.use('/api', (req, res) => res.status(404).json({ message: 'APIが見つかりません。' }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use((error, req, res, next) => {
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ message: status === 500 ? 'サーバー内部でエラーが発生しました。' : 'リクエストの形式またはサイズが不正です。' });
  });
  return app;
}
