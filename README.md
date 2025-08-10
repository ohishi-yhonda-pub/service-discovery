# Service Discovery

Cloudflare WorkersとDurable Objectsを使用したRPCベースのサービスディスカバリシステム

## 機能

- **サービス登録**: サービスの登録とメタデータの管理
- **サービス検索**: 名前によるサービス検索
- **サービス一覧**: プレフィックスフィルタリング付きサービス一覧
- **ヘルスチェック**: サービスの健全性監視
- **RPCプロキシ**: JSON-RPC 2.0呼び出しの中継

## API エンドポイント

### サービス登録
```
POST /register
Content-Type: application/json

{
  "name": "user-service",
  "url": "https://user-service.example.com",
  "metadata": {
    "version": "1.0.0"
  }
}
```

### サービス登録解除
```
POST /unregister
Content-Type: application/json

{
  "name": "user-service"
}
```

### サービス検索
```
POST /discover
Content-Type: application/json

{
  "name": "user-service"
}
```

### サービス一覧
```
GET /services?prefix=user
```

### ヘルスチェック
```
POST /health-check
Content-Type: application/json

{
  "name": "user-service"
}
```

### RPC呼び出し
```
POST /rpc
Content-Type: application/json

{
  "service": "user-service",
  "method": "getUser",
  "params": [123]
}
```

## 開発

### 前提条件
- Node.js (v18以上)
- npm または pnpm
- Cloudflare アカウント

### セットアップ

1. リポジトリをクローン
```bash
git clone https://github.com/yourusername/service-discovery.git
cd service-discovery
```

2. 依存関係をインストール
```bash
npm install
```

3. Wranglerでログイン（初回のみ）
```bash
npx wrangler login
```

### 開発サーバー起動
```bash
npm run dev
```

開発サーバーは http://localhost:3000 で起動します。

### テスト実行
```bash
npm test
```

### デプロイ

1. Cloudflare アカウントIDを確認
```bash
npx wrangler whoami
```

2. デプロイ実行
```bash
npm run deploy
```

### 設定のカスタマイズ

`wrangler.jsonc`でWorkerの設定をカスタマイズできます：
- `name`: Workerの名前
- `compatibility_date`: 互換性日付
- `dev.port`: 開発サーバーのポート番号

## アーキテクチャ

このシステムはCloudflare WorkersとDurable Objectsを使用して構築されています:

- **Worker**: HTTP APIエンドポイントを提供
- **ServiceRegistry Durable Object**: サービス情報の永続化と管理
- **RPC Proxy**: 登録されたサービスへのJSON-RPC呼び出しを中継

## テスト

100%のコードカバレッジを達成した包括的なテストスイート:

- ユニットテスト: ServiceRegistry Durable Objectの各メソッド
- 統合テスト: Worker APIエンドポイント
- エラーケース: 異常系のテスト

テストはvitestと@cloudflare/vitest-pool-workersを使用してCloudflare Workers環境で実行されます。

## ライセンス

MIT License - 詳細は[LICENSE](./LICENSE)ファイルを参照してください。