# Getting Started

## 前提

- Node.js 20+
- PostgreSQL（本番）または Podman + `docker-compose.yml`（Windows ローカル）
- Discord bot token（Message Content Intent 必須）

## セットアップ

```bash
npm ci
cp .env.example .env
# .env を編集
npx prisma migrate deploy
npm run db:generate
npm run deploy:commands
npm run build
```

開発起動:

```bash
npm run dev
```

## Windows（Podman）

```powershell
npm run db:windows:up
npm run check:windows
npm run dev:windows
```

## よく使う npm scripts

| Script | 用途 |
|--------|------|
| `npm test` | Vitest |
| `npm run build` | prisma generate + tsc → `dist/` |
| `npm run deploy:commands` | スラッシュコマンド登録 |
| `npm run db:dev` | 開発用 migration |
| `npm run db:normalize-memories` | 記憶正規化（dry-run） |

## See Also

- [Configuration](wiki://configuration)
- [Deployment](wiki://deployment)
- [Overview](wiki://overview)
- [Testing](wiki://testing)

