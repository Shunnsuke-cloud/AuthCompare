# AuthCompare

Cookie・Session・JWTの関係を操作とコードで学ぶローカル専用Webアプリです。左右でSession認証とJWT認証を比較できます。Reactやビルド処理は不要です。

## 環境とライブラリの役割

Node.js **22以上**、npm、Windows PowerShell、VS Code、Chromeを想定しています。

| 技術 | 役割 |
| --- | --- |
| Node.js | サーバーでJavaScriptを実行 |
| Express | APIと静的ファイルを配信 |
| express-session | CookieのIDとサーバー側Sessionを結び付ける |
| jsonwebtoken | JWTを発行し、署名と期限を検証 |
| cookie-parser | 受信Cookieを解析してJWTを取り出す。Session Cookieはexpress-sessionが処理 |
| HTML / CSS / JavaScript | 比較画面、API通信、結果表示 |
| node:test / Supertest | HTTP APIの自動テスト |

`.env`はNode.jsの`--env-file`で読み込みます。dotenvは使いません。

## ファイル構成

```text
server.js               起動・設定エラーの表示
src/app.js              認証API・Cookie設定・CSRF対策
public/index.html       比較画面と解説
public/style.css        レスポンシブデザイン
public/app.js           ボタン操作・通信・学習用データ表示
test/auth.test.js       認証とセキュリティの自動テスト
docs/learning-notes.md  Zenn記事の検証ノート
.env.example           設定テンプレート
.env                   自分の秘密値（Git管理対象外）
.gitignore             Gitから除外するファイル指定
package.json           依存関係とコマンド
package-lock.json      インストールする依存バージョンを固定
README.md              起動・操作・仕組みの説明
```

## インストール・秘密鍵の生成（PowerShell）

VS Codeでプロジェクトを開き、PowerShellターミナルで実行します。

```powershell
cd C:\Users\ukimi\AuthCompare
node --version
npm install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
code .env
```

生成した1つ目を`SESSION_SECRET`、2つ目を`JWT_SECRET`に貼り付けて保存します。異なるランダム値を使ってください。ダミー値のままでは起動しません。すでに.envがある場合はコピーで上書きせず内容を確認してください。秘密値を記事やスクリーンショットに載せないでください。

この作業環境には、開発時に独立したランダム秘密値を設定した`.env`を作成済みです。そのまま`npm start`できます。別のPCやGitからの取得時は上の設定手順を行ってください。

```dotenv
PORT=3000
APP_ORIGIN=http://localhost:3000
SESSION_SECRET=ここを1つ目の生成値に置換
JWT_SECRET=ここを2つ目の生成値に置換
JWT_TTL_SECONDS=120
SESSION_TTL_SECONDS=900
COOKIE_SECURE=false
```

## 起動・アクセス・終了

```powershell
npm start
```

Chromeで **http://localhost:3000** にアクセス。終了はターミナルで **Ctrl+C**。サーバーコードの自動再起動は`npm run dev`。フロントの変更はブラウザを再読み込みします。設定を変えたら再起動してログインし直してください。

サーバーは`127.0.0.1`でのみ待ち受けます。URLに127.0.0.1を使うなら`APP_ORIGIN=http://127.0.0.1:3000`に合わせます。Originとは通信元のスキーム・ホスト・ポートです。

## アカウントと操作

ユーザー名：`student` / パスワード：`demo-password`

### Session

1. 左側のログインを押します。認証後、IDを再生成してサーバーメモリにユーザー情報を保存します。
2. 状態確認ボタンを押すとCookieのIDでSessionストアを検索します。
3. 「サーバー側のSession情報を見る」を展開します。生のIDはAPIから返しません。
4. ログアウトでSessionを破棄しCookieを削除。再確認でHTTP 401（未認証）になります。

### JWT

1. 右側でログイン。署名付きJWTがHttpOnly Cookieに保存されます。
2. 状態確認で署名・アルゴリズム・発行者・宛先・期限をサーバーが検証します。
3. 検証済みHeader・Payloadを展開。`sub`はユーザーID、`username`は名前、`iat`は発行時刻、`exp`は期限、`iss`は発行者、`aud`は宛先。時刻はUnix秒（1970年からの秒数）です。
4. 120秒後に確認すると、通常はブラウザが期限切れCookieを消すため「JWT Cookieがありません」となります。サーバーの期限検証は期限切れJWTを明示的に送る自動テストでも検証します。
5. ログアウトはCookie削除だけです。コピー済みJWT自体は期限まで使えます。

両方同時にログインできます。ページ表示時と操作時に状態を問い合わせます。カウントダウンは表示用で自動認証確認はしません。SessionはアクセスでCookie期限が延長される場合があり、画面の期限は直近応答時点の目安です。JWTのexpは発行時に固定。ログイン失敗時は既存認証を維持します。

## Chrome開発者ツール

1. F12またはCtrl+Shift+I → **Application → Storage → Cookies → http://localhost:3000**。
2. `authcompare.sid`と`authcompare.jwt`の名前、HttpOnly、SameSite=Lax、Path=/、Expiresを確認。ローカルではSecureは無効です。
3. **Network → Fetch/XHR**でlogin/me/logoutを選び、Cookie、Set-Cookie、Origin、X-AuthCompare-CSRF、HTTPステータス、Responseを確認します。
4. Applicationで片方のCookieを削除して状態確認すると401。Cookieだけ消してもサーバーのSessionは直ちに消えません。
5. Session再ログイン前後でIDの変更、ログアウト後にCookieの削除と401を確認します。

HttpOnlyはJavaScriptによる読み取りを禁止しますが、開発者ツールでは値を見られます。画面は生のCookieを取得せず、サーバーの学習用レスポンスを表示しています。スクリーンショットではCookie値・秘密値・パスワードを隠します。

## 仕組みとメリット・デメリット

Cookieはブラウザが情報を保存し、条件の合う通信に自動添付する仕組み。Sessionはサーバーで状態を管理する仕組み、JWTは署名付き情報の形式です。同列ではありません。このデモでは両者ともCookieを運び手に使いますが、JWTにCookieが必須という意味ではありません。

SessionはIDを手掛かりにストアを検索。JWTは秘密鍵で署名を検証。署名は改ざんの検知であり暗号化ではなく、Payloadは読めるのでパスワード等を入れてはいけません。JWT側にはSession middlewareを適用しません。

| 方式 | メリット | デメリット |
| --- | --- | --- |
| Session | サーバーで即時失効しやすい。Cookieが小さい | ストア管理や複数サーバー間の共有が必要 |
| JWT | ログイン状態のストアを参照せず検証できる | 即時失効に失効リスト等が必要。情報変更に再発行が必要。サイズにも注意 |

JWTでも鍵、アカウント、権限などの管理は必要です。

## セキュリティ

- **学習専用**：固定の平文パスワードと開発用MemoryStoreは本番利用しないでください。本番にはパスワードの適切なハッシュ化、永続ストア、HTTPS、試行回数制限、監査ログ等が必要です。このデモはレート制限・JWT失効リスト・リフレッシュトークンを実装していません。
- **Session固定攻撃**（既知のIDでログインさせる攻撃）：認証後にregenerateでIDを変更。save完了後に成功を返し、ログアウトはdestroy完了後に応答します。
- **CSRF**（Cookie自動送信を利用した他サイトからの操作）：ログインを含む全状態変更APIに完全一致のOrigin、専用ヘッダー`X-AuthCompare-CSRF: 1`、JSON形式を要求。他Originの専用ヘッダー付き要求にはブラウザの事前確認が必要ですが、CORSを許可しないため通過できません。値は秘密トークンではありません。OriginなしのPOSTも拒否します。
- **HttpOnly**でもXSS（不正スクリプトの混入）で操作される危険は残ります。データ表示はtextContentを使用し、CSPでスクリプト読み込み元を制限します。
- **SameSite=Lax**は異なるサイトからのCookie送信を制限しますが、単独で全てのCSRFを防ぎません。GETではログアウトしません。
- **Secure**はHTTPSでのCookie送信を要求する属性です。暗号化はHTTPSが行います。ローカルHTTPはfalse。本番はHTTPSとSecureが必要。trueは属性実験用で、このサーバー自身はHTTPSを提供しません。TLSやプロキシ設定は別途必要です。
- JWTはverifyでHS256だけを許可し、署名・exp・iss・audを検証。decodeだけでは認証しません。不正/期限切れは401でCookieも削除します。
- JWTログアウトは即時失効ではありません。短い期限や失効設計が必要です。Sessionは再起動で消えますが、JWTは同じ秘密鍵なら期限まで検証できます。
- APIはno-storeでキャッシュ禁止。認証情報をlocalStorageやURLに保存しません。.envはGit対象外です。秘密値を変えると既存Cookieを検証できなくなります。

## 自動テスト

```powershell
npm test
```

.env不要。テスト用秘密値と独立したアプリを使用。ログイン成功/失敗、ログアウト、未認証、Cookieなし、Session再生成と破棄、期限切れ、JWT改ざん、誤った発行者・宛先・アルゴリズム、CSRF、Cookie属性を検証します。Cookieなしの要求で削除後のサーバー動作を確認します。Chromeの自動送信/削除とレイアウトは別途ブラウザで確認が必要です。

## よくあるエラー

| 症状 | 解決方法 |
| --- | --- |
| npmがない | Node.js 22以上を入れてVS Codeを開き直す |
| npm.ps1が実行禁止 | npm.cmd install / npm.cmd start / npm.cmd testを使用。実行ポリシーを緩める必要はありません |
| .envがない | 直下にテンプレートをコピー。.env.txtでないか確認 |
| 秘密値の設定エラー | ダミーを置換し、異なる32文字以上のランダム値を設定 |
| EADDRINUSE | 別サーバーをCtrl+Cで終了、またはPORT=3001とAPP_ORIGIN=http://localhost:3001に変更 |
| CSRFの403 | URLとAPP_ORIGINを一致。file://で開かない。POSTはOrigin・専用ヘッダー・JSONが必要 |
| ログイン後未認証 | Cookieの許可、Secure=false、期限、サーバー再起動の有無を確認 |
| 変更が反映されない | 再起動・再ログイン・ページ再読み込み |
| npmの通信エラー | レジストリへのネットワークやプロキシ設定を確認 |

## 参考

- [Express session公式](https://expressjs.com/en/resources/middleware/session/)：Cookie設定、MemoryStore、再生成と破棄。
- [jsonwebtoken公式](https://github.com/auth0/node-jsonwebtoken)：sign、verify、期限。
- [OWASP CSRF対策](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)：ログインCSRF、Origin、専用ヘッダー。
