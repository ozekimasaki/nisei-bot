# Deployment

## 本番（Ubuntu / pm2）

```bash
git pull
npm ci
npm run db:generate
npx prisma migrate deploy
npm run build
pm2 restart nisei-bot
```

- アプリ名: `nisei-bot`
- `instances: 1` / `exec_mode: "fork"`（cluster 不可 — Gateway 二重接続防止）
- `.env` 変更後: `pm2 restart nisei-bot --update-env`
- `Script not found: dist/index.js` → 先に `npm run build`

## Windows ローカル

Podman で DB、pm2 なしで `npm run dev:windows`。補助スクリプトは `scripts/`（本番経路に組み込まない）。

## See Also

- [Getting Started](wiki://getting-started)
- [Configuration](wiki://configuration)
- [Overview](wiki://overview)

