# Discord Integration

## 配線（`src/index.ts`）

- Client 初期化、Intent: `Guilds` / `GuildMessages` / `MessageContent`
- `MessageCreate` → guard → `ResponsePlanner`
- `InteractionCreate` → `handleCommand`
- 返信は `allowedMentions: { parse: [] }` を維持

ビジネスロジックをここに大量追加しない。配線とディスパッチに留める。

## スラッシュコマンド（`src/commands.ts`）

プレフィックス `nisei_`。例: `nisei_help`, `nisei_uranai`, `nisei_haiku`, `nisei_stats`, `nisei_poke`, `nisei_treasure`, `nisei_forget`, `nisei_wiki`, `nisei_kanchigai`, `nisei_album`, `nisei_quiz`, `nisei_janken`, `nisei_shizuka`, `nisei_hatsugen`, `nisei_summary`, `nisei_ai_status`。

追加・変更後は必ず:

```bash
npm run deploy:commands
```

定義は `commands.ts`、処理は `index.ts` の `handleCommand`（要約・AIステータスなど複雑 UI / 長時間処理は別 handler）、登録スクリプトは `deploy-commands.ts`。

## 周辺

| ファイル | 役割 |
|----------|------|
| `message-guard.ts` | 対象外・重複メッセージの除外 |
| `channel-activity.ts` | チャンネル活動度 |
| `channel-summary.ts` | 要約（Gemini 利用の場合あり）。ログ作者名は `GuildMember.displayName`（必要時 REST で members fetch） |
| `summary-page-store.ts` | 要約ページの Discord 側保持 |
| `ai-status.ts` | `/nisei_ai_status` 用。社別ステータス取得＋Gemini でにせい口調化 |
| `quiet-channel.ts` | 静音チャンネル判定 |

## See Also

- [Architecture](wiki://architecture)
- [Configuration](wiki://configuration)
- [Deployment](wiki://deployment)
- [Feature Engines](wiki://feature-engines)
- [Agent Ownership](wiki://agent-ownership)

