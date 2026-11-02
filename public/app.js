const definitions = {
  session: { title: 'Session', subtitle: '状態をサーバーに預ける', number: 'A', cookie: 'Session ID', server: 'ユーザー情報をSessionストアに保存', steps: ['CookieでIDを送る', 'Sessionを検索', 'userを確認', '結果を返す'] },
  jwt: { title: 'JWT', subtitle: '署名付きの情報を持ち歩く', number: 'B', cookie: '署名付きJWT', server: 'ログイン状態は保存せず、署名を検証', steps: ['CookieでJWTを送る', '署名を検証', '期限を確認', '結果を返す'] }
};
const state = {};
for (const [key, def] of Object.entries(definitions)) {
  const card = document.createElement('section');
  card.className = `auth-card ${key}`;
  card.innerHTML = `<div class="card-heading"><div><span class="card-kicker">METHOD ${def.number}</span><h3>${def.title}<small>認証</small></h3><p>${def.subtitle}</p></div><span class="status" id="${key}-status">未確認</span></div>
    <form id="${key}-form"><label for="${key}-username">ユーザー名</label><input id="${key}-username" name="username" autocomplete="username" value="student" required maxlength="80"><label for="${key}-password">パスワード</label><input id="${key}-password" name="password" type="password" autocomplete="current-password" value="demo-password" required maxlength="100"><button class="primary" type="submit">ログイン <span>→</span></button></form>
    <div class="secondary-actions"><button type="button" data-action="me">ログイン状態を確認</button><button type="button" data-action="logout">ログアウト</button></div>
    <div class="feedback" role="status" aria-live="polite" id="${key}-feedback">状態を確認しています…</div>
    <div class="storage"><div><span>ブラウザ / COOKIE</span><strong>${def.cookie}</strong></div><span class="storage-arrow">⇄</span><div><span>サーバー</span><strong>${def.server}</strong></div></div>
    <div class="flow-heading">認証確認の流れ <span id="${key}-time">まだ確認していません</span></div><ol class="flow">${def.steps.map((step, index) => `<li><span>${['ブラウザ', 'サーバー', '認証確認', 'レスポンス'][index]}</span>${step}</li>`).join('')}</ol>
    <p class="expiry" id="${key}-expiry">有効期限：ログイン後に表示</p>
    <details><summary>${key === 'jwt' ? '検証済みHeader・Payloadを見る' : 'サーバー側のSession情報を見る'}</summary><pre id="${key}-data">ログインすると学習用データが表示されます。</pre></details>`;
  document.querySelector('#comparison').append(card);
  state[key] = { card, data: null };
  card.querySelector('form').addEventListener('submit', (event) => {
    event.preventDefault();
    request(key, 'login', Object.fromEntries(new FormData(event.target)));
  });
  card.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => request(key, button.dataset.action)));
}

function render(key, data, message) {
  state[key].data = data;
  const status = document.getElementById(`${key}-status`);
  status.textContent = data.authenticated ? '● ログイン中' : '○ 未ログイン';
  status.classList.toggle('authenticated', Boolean(data.authenticated));
  document.getElementById(`${key}-feedback`).textContent = message || data.message || `${data.user.username} としてログインしています。`;
  document.getElementById(`${key}-time`).textContent = new Date().toLocaleTimeString('ja-JP');
  document.getElementById(`${key}-data`).textContent = data.authenticated
    ? JSON.stringify(key === 'jwt' ? { header: data.header, payload: data.payload } : data.server, null, 2)
    : '認証済みのデータはありません。';
  updateExpiry(key);
}
function updateExpiry(key) {
  const data = state[key].data;
  const el = document.getElementById(`${key}-expiry`);
  if (!data?.authenticated) { el.textContent = '有効期限：ログイン後に表示'; return; }
  const seconds = Math.max(0, Math.ceil((Date.parse(data.expiresAt) - Date.now()) / 1000));
  el.textContent = `期限の目安：${new Date(data.expiresAt).toLocaleString('ja-JP')}（残り ${seconds} 秒）${seconds === 0 ? ' — 状態確認でサーバーの判定を確認' : ''}`;
}
async function request(key, action, body = {}) {
  const card = state[key].card;
  card.querySelectorAll('button').forEach(b => b.disabled = true);
  const get = action === 'me';
  try {
    const response = await fetch(`/api/${key}/${action}`, { method: get ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      ...(get ? {} : { headers: { 'Content-Type': 'application/json', 'X-AuthCompare-CSRF': '1' }, body: JSON.stringify(body) }) });
    const data = await response.json();
    if (action === 'login' && !response.ok) {
      // ログイン失敗は既存Cookieを消さない。表示も必ずサーバーの現在状態で更新する。
      const current = await fetch(`/api/${key}/me`, { credentials: 'same-origin', cache: 'no-store' });
      render(key, await current.json(), data.message);
    } else if (response.ok || response.status === 401) render(key, data);
    else document.getElementById(`${key}-feedback`).textContent = data.message;
  } catch {
    document.getElementById(`${key}-feedback`).textContent = '通信に失敗しました。サーバーの起動状態を確認してください。表示は最後に確認した状態です。';
  } finally { card.querySelectorAll('button').forEach(b => b.disabled = false); }
}
for (const key of Object.keys(definitions)) request(key, 'me');
setInterval(() => Object.keys(definitions).forEach(updateExpiry), 1000);
