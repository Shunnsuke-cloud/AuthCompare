# Zenn記事用の検証ノート

未確認の実験結果や感想は埋めていません。自動テストとブラウザ実験を分けて記録してください。

## 用語と違い

- Cookie：ブラウザで保存し、条件に合う通信へ自動添付する仕組み。
- Session：サーバーが利用者ごとの状態を管理。このデモはCookieにID、メモリにユーザー情報を保存。
- JWT：Header・Payload・Signatureからなる署名付き情報。このデモはCookieで送信。
- Cookieは両者を運べる。署名は暗号化ではなく、改ざん検知。Payloadに秘密情報を入れない。

## 処理の流れ

Sessionログイン：ブラウザ → CSRF確認 → アカウント照合 → ID再生成 → Session保存 → Cookie付きレスポンス。

Session確認：ブラウザ → ID Cookie → サーバーのストア検索 → userの有無を確認 → 200/401。

Sessionログアウト：ブラウザ → CSRF確認 → Session破棄 → Cookie削除。

JWTログイン：ブラウザ → CSRF確認 → アカウント照合 → JWT署名 → HttpOnly Cookie付きレスポンス。

JWT確認：ブラウザ → JWT Cookie → HS256署名・iss・aud・exp検証 → 検証済み情報/401。

JWTログアウト：ブラウザ → CSRF確認 → Cookie削除。JWTそのものの期限は変わらない。

## 自動テスト記録

コマンドは`npm test`。APIの自動テストはブラウザ操作を実施した証拠にはなりません。

### 開発時に実施した確認（2026-10-31）

- Node.js v22.15.1 / npm 10.9.2。
- `npm test`：12件成功、失敗0、スキップ0。
- 両方式のログイン成功/失敗・状態確認・ログアウト・未認証拒否・Cookieなし要求を確認。
- Session ID再生成、古いIDの拒否、破棄後の拒否、サーバー側期限切れ、別インスタンスでのSession消失を確認。
- JWTの不正値・異なる鍵の署名・期限切れ・誤った発行者/宛先/アルゴリズムを拒否。
- Cookie削除後でも、保存しておいたJWTを再送すると期限内は認証されることを確認。
- JWTにはSession Cookieが付かず、別インスタンスでも同じ鍵で検証できることを確認。
- ログイン・ログアウトのCSRF拒否、Cookie属性、CSP、no-storeを確認。
- `node --check`：server.js、src/app.js、public/app.js、test/auth.test.jsが成功。
- `npm start`で起動し、PowerShellからページHTTP 200と両方式のログイン200・状態確認・ログアウトを確認。
- `git check-ignore .env`で除外を確認。`npm install`時の監査は脆弱性0件。
- 最初のnpm取得は環境の通信制限で失敗。許可付きの再実行でインストール成功。
- ブラウザ連携は「The browser access host is unavailable」。画面操作、視覚レイアウト、実際のChromeでのCookie自動送信/期限削除、スクリーンショット撮影は未実施。

以上はAPIと起動確認の記録です。以下のブラウザ実験欄や感想欄は、利用者自身が確認するまで空欄のままにします。

## ブラウザ実験の記入欄

| 検証項目 | 予想 | 結果（実施後に記入） |
| --- | --- | --- |
| Sessionログイン成功/失敗 | 正しい入力で200、不正入力で401 | 未記入 |
| JWTログイン成功/失敗 | 正しい入力で200、不正入力で401 | 未記入 |
| 両方式同時ログイン | 別Cookieなので両方有効 | 未記入 |
| Cookie属性 | HttpOnly・Lax、ローカルではSecureなし | 未記入 |
| Session再ログイン | IDが変わる | 未記入 |
| Sessionログアウト | Session破棄・Cookie削除・401 | 未記入 |
| JWTログアウト | Cookie削除・401 | 未記入 |
| Cookie手動削除 | 次の状態確認が401 | 未記入 |
| 120秒待つ | JWT Cookieが期限切れで消える | 未記入 |
| 不正/期限切れJWT送信 | サーバーで拒否（自動テスト参照） | 未記入 |
| Sessionでサーバー再起動 | 未認証になる | 未記入 |
| JWTでサーバー再起動 | 同じ鍵かつ期限内なら有効 | 未記入 |
| 専用ヘッダーなしログイン | CSRF対策で403 | 未記入 |
| ログイン中に誤入力 | 失敗しても既存認証を維持 | 未記入 |

実施日：＿＿＿＿ / OS：＿＿＿＿ / Node.js：＿＿＿＿ / Chrome：＿＿＿＿

操作と条件：＿＿＿＿

NetworkのURL・ステータス・レスポンスの観察：＿＿＿＿

予想と異なった点と再現手順：＿＿＿＿

## スクリーンショットを撮る場所

1. 初期画面：左右比較とCookieの説明。
2. 両方ログイン後：状態、保存場所、認証フロー。
3. Session情報とJWT Header/Payloadの展開表示。
4. Application → Cookies：名前・属性・期限。値の列を隠す。
5. Network：meの200と401、logoutのCookie削除。Cookie値を隠す。
6. JWT期限後とSession破棄後の表示。

Cookie値・パスワード・.env・秘密値を記事に載せないでください。

## 紹介するとよい実装

- src/app.js：Cookie共通属性とCookie名の分離。
- Sessionのregenerate → user保存 → save、logoutのdestroy。
- JWTのsign/verify、検証済み情報のみ返す学習API。
- Session middlewareをSessionルートだけに適用する理由。
- ログインにも適用するOriginと専用ヘッダーの確認。
- test/auth.test.js：古いSession IDとログアウト後JWTを再送する比較。

## 検証から分かったこと（自分の言葉で記入）

Cookieと認証方式を分けて考えると：＿＿＿＿

保存場所が違う意味：＿＿＿＿

ログアウトの意味の違い：＿＿＿＿

期限・サーバー再起動から分かったこと：＿＿＿＿

追加で調べたいこと：＿＿＿＿

## 学習上の注意点

- 画面は生のCookieではなくサーバーの学習用情報。
- decodeできることと認証できることは別。必ず署名検証する。
- ブラウザのCookie期限とサーバーのJWT期限検証を分けて観察する。
- Cookie削除とサーバーのSession破棄を区別する。
- JWTでも鍵・アカウント・権限・失効の設計は必要。
- HttpOnlyやSameSiteだけで全ての攻撃を防げるわけではない。
- 固定パスワードとMemoryStoreは学習用。
- 実施していないブラウザ実験を「確認できた」と記載しない。
