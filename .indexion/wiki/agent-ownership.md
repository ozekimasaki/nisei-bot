# Agent Ownership

コーディングエージェントが「どこを編集するか」の正本。詳細規約と indexion の使い方は [AGENTS.md](../../AGENTS.md)（indexion ナレッジベース節）を参照。

## オーナーシップ表

| 変更したいこと | 主な編集先 |
|---|---|
| 意図判定（正規表現・キーワード） | `src/classifier.ts` |
| 返答ロジック・新会話パターン | `src/responder.ts` |
| DB 読み書き・スキーマ | `src/db.ts` + `prisma/schema.prisma` |
| スラッシュコマンド定義 | `src/commands.ts` |
| スラッシュコマンド処理 | `src/index.ts` の `handleCommand` |
| 環境変数・デフォルト | `src/config.ts`、`.env.example` |
| 占い・俳句・じゃんけん等 | 各 `src/*.ts` エンジン |
| デフォルト語彙・リアクション | `src/default-brain.ts` |
| 静音・活動・要約 | `quiet-channel.ts` / `channel-activity.ts` / `channel-summary.ts` |
| AI各社ステータス説明 | `ai-status.ts` + `commands.ts` + `index.ts` の `handleAiStatusCommand` |

## 避けること

- `src/index.ts` にビジネスロジックを大量追加しない
- `scripts/` を本番経路に組み込まない
- pm2 cluster 化など Gateway 二重接続を招く変更

## indexion の使い方

```powershell
# PATH に %USERPROFILE%\.indexion\bin を追加済み想定
indexion wiki index build --wiki-dir=.indexion/wiki
indexion search "じゃんけん" .indexion/wiki/
indexion agent orient --task "add quiet-channel tests" --output .indexion/cache/agent/orient.md .
indexion plan reconcile --doc='.indexion/wiki/*.md' --doc-spec=markdown --format=md .
```

編集前に [Architecture](wiki://architecture) とこのページを読む。実装後は `wiki pages ingest` でソース変更を検知し、必要ならページを `wiki pages update` する。

## See Also

- [Architecture](wiki://architecture)
- [Overview](wiki://overview)
- [Testing](wiki://testing)
- [Discord Integration](wiki://discord-integration)
- [Feature Engines](wiki://feature-engines)
- [Response Pipeline](wiki://response-pipeline)
- [Intent Classification](wiki://intent-classification)
- [Memory Store](wiki://memory-store)
- [Configuration](wiki://configuration)


