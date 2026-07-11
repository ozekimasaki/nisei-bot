# Architecture

## メッセージ処理の流れ

```
Discord Gateway
  ↓
src/index.ts … Client、MessageCreate / InteractionCreate
  ↓
src/message-guard.ts … 重複処理・対象フィルタ
  ↓
src/responder.ts … ResponsePlanner（応答中枢）
  ↓
src/classifier.ts … MessageIntent 分類
  ↓
機能エンジン + MemoryStore (src/db.ts / Prisma)
```

## レイヤ責務

| レイヤ | 役割 | 代表ファイル |
|--------|------|----------------|
| Gateway 配線 | Discord イベント接続、コマンドディスパッチ | `src/index.ts` |
| 応答計画 | intent に応じた返答組み立て | `src/responder.ts` |
| 意図分類 | 正規表現・キーワードで MessageIntent | `src/classifier.ts` |
| 永続化 | Prisma ラッパ | `src/db.ts` |
| 機能エンジン | 占い・俳句・じゃんけん等の純粋寄りのロジック | `src/fortune.ts` 等 |
| 人格・気分 | mood / affection / chatter | `src/mood.ts` 等 |

## 拡張ポイント

1. 新しい会話パターン → `classifier.ts` に intent 追加 → `responder.ts` で処理
2. 新しいスラッシュコマンド → `commands.ts` + `index.ts` の `handleCommand` + `deploy:commands`
3. 新しい永続データ → `prisma/schema.prisma` + migration + `MemoryStore`

## See Also

- [Intent Classification](wiki://intent-classification)
- [Response Pipeline](wiki://response-pipeline)
- [Memory Store](wiki://memory-store)
- [Discord Integration](wiki://discord-integration)
