# Memory Store

`MemoryStore`（`src/db.ts`）が Prisma モデルの唯一のアプリ側ラッパ。`responder.ts` から生の Prisma を直接叩かない。

## 主要モデル

| Model | 用途 |
|-------|------|
| `GuildMemory` | サーバーごとの主語→述語知識 |
| `MessageSnippet` | 発話スニペット |
| `GuildState` | mood / talkCount / talkLevel 等 |
| `KnownUser` | なつき（affection） |
| `Misunderstanding` | 勘違い知識 |
| `TreasureWord` | たからもの単語 |
| `JankenSession` | じゃんけん連勝管理 |
| `QuietChannel` | 静音チャンネル |
| `HandledMessage` | 二重処理防止 |
| `LearnedEmoji` / `PokeState` | 絵文字学習・つつき |

## スキーマ変更手順

1. `prisma/schema.prisma` を更新
2. `prisma/migrations/` に migration 追加（`npm run db:dev`）
3. `npm run db:generate`
4. `MemoryStore` に API を追加
5. 本番: `npx prisma migrate deploy`

## 正規化

`src/normalize-memories.ts` + `scripts/normalize-memories.ts` で記憶テーブルの正規化プランを dry-run / apply できる。本番経路には組み込まない。

## See Also

- [Architecture](wiki://architecture)
- [Response Pipeline](wiki://response-pipeline)
- [Configuration](wiki://configuration)
- [Agent Ownership](wiki://agent-ownership)

