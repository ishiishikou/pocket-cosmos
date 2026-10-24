# pocket-cosmos（ゆびさき宇宙旅行）

家族みんなの指先で、光と音の宇宙をつくるリアルタイム共同体験Webアプリ。元のChatGPT Sites版から独立したNode.js + WebSocketアプリです。

## できること

- 指でなぞると光の軌跡と音階が生まれる。文字選択やスクロールが発生しないタッチ操作。
- くじら、きつね、うさぎ、くま、おうち座、お手紙など元の体験を維持。
- iPhoneからアカウント不要で、親が招待用QR / リンクを作成し、参加番号を確認して承認。
- 最大8台で匿名の動物・色を区別しながら、光の軌跡、音符イベント、くじらの演出を共有。
- 切断時もひとりで遊び続け、通信復旧後は元の参加者で再接続。
- 家族の名前は端末内の `localStorage` にだけ保存（WebSocketへは送信しない）。

## 開発・検証

Node.js 22以上（RenderではNode.js 24を推奨）。

```bash
npm ci
npm run verify
npx playwright install chromium webkit
npm run test:e2e
npm start
```

開発用には `npm run dev` でビルドとWebサーバー起動を行います。ブラウザは `http://localhost:3000` で開けます。

`npm run verify` は構文・秘密情報パターン検査、Node.js統合テスト、Web資産ビルドを行います。PlaywrightテストはChromiumとWebKitで、共同プレイ・承認・音声イベント・再接続・操作感を検証します。自動テストはiPhone実機の代替にはなりません。

## Render公開

リポジトリ直下の `render.yaml` に、シンガポール・Freeプラン・Node単一インスタンス・ヘルスチェック `/healthz` を定義しています。

- Build: `npm ci && npm run build`
- Start: `npm start`
- Port: Renderの `PORT` 環境変数を使用
- Health: `GET /healthz`（`{ "status": "ok" }`）
- WebSocket: 同一ホストの `/socket`（HTTPSではWSS）

公開先では、`main` のCI成功後にデプロイする運用を推奨します。**Render Freeは15分間HTTPまたはWebSocketの着信がないと停止するため、再起動まで待ち時間が生じます。** 再デプロイ・再起動・停止によりメモリ上のルームは失われます。これは永続データを持たないプライバシー設計とのトレードオフです。

## 安全性・運用上の前提

- 招待トークンは256-bit乱数。招待URLのフラグメント（`#room=…&key=…`）はHTTPリクエストに直接送られず、参加承認前の共同イベントは配信しません。
- 実名・招待トークンをGitHub Issue、ログ、公開テスト結果に記載しないでください。
- リアルタイムのイベントだけを転送します。音声データそのものをストリーミングせず、音符イベントから各端末で音を再生します。
- ルームはサーバーメモリのみ。最大6時間、無操作15分で終了し、サーバー再起動でも失われます。
- 端末・OS・ネットワークごとに音声遅延が異なるため、音楽的な完全同期は保証できません。
- 有料インフラや複数インスタンス構成への変更時は別途設計・承認が必要です。

## iPhone実機確認

デプロイ後は [docs/iphone-checklist.md](docs/iphone-checklist.md) に従い、2台以上のiPhone Safariで承認、光、音、再接続、画面回転、タッチ選択防止を確認します。実機で未検証の項目は完了として扱いません。

開発状況の正本: [Issue #1](https://github.com/ishiishikou/pocket-cosmos/issues/1)。実装PR: [#2](https://github.com/ishiishikou/pocket-cosmos/pull/2)。


## カード登録なしで遊ぶ：GitHub Pages（P2P実験モード）

本リポジトリには、既存Node/WebSocketサーバー版のほか、**GitHub Pagesで動く2台専用のWebRTC P2P版**があります。接続準備にはサーバーを使わず、親と子がOffer/AnswerのQRコードを互いのiPhone画面から読み取ります。読み取りが難しい場合はコードをコピーして貼り付けます。

1. 親と子のiPhoneを同じ自宅Wi-Fiに接続する（またはテザリングで一方を接続）。
2. 公開URL \`https://ishiishikou.github.io/pocket-cosmos/\` を両方で開く。公開前は後述の設定が必要。
3. 親で「みんなで」→「おとなが宇宙をつくる」。子で「みんなで」→「こどもが参加する」→「QRコードを読み取る」。
4. 子が親のQRを読み取ったら、子に出た「返事のQR」を親が読み取る。
5. 双方が直接接続されたら、光・音符・くじらの演出を双方向に楽しめる。

ブラウザ同士のRTCDataChannelは暗号化され、クラウドの中継サーバーは使用しません。Safariの端末ごとのローカル接続制限、Wi-Fiの端末間通信遮断、iPhoneテザリングの構造により、同じネットワークでも接続できない場合があります。**iPhone実機で接続が確認できるまでは試作版です。** 最初のバージョンは2台専用で、3台以上の同時参加は未対応です。

\`\`\`bash
npm ci
npm run verify
npm run build:pages
\`\`\`

これにより \`dist/index.html\` に静的P2P版が生成されます。GitHubの Settings → Pages → Build and deployment → Source を **GitHub Actions** に設定すると、\`.github/workflows/pages.yml\` から自動で公開します。初回サイト設定にはリポジトリ管理者の操作が必要になる場合があります。追加のクラウド契約は必要ありません。

Safariの「ホーム画面に追加」に対応し、初回オンライン読込後はService Workerで静的アプリを保存してオフライン起動を試みます。アプリを開く際にインターネットが必要なくても、iPhone間のローカル通信が確立できることとは別です。通信を再開するには接続コードを交換し直します。

iPhone検証方法: [docs/p2p-test-plan.md](docs/p2p-test-plan.md)。既存のNode/WebSocket版の使い方・テストはそのまま残しています。
