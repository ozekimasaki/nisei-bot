# Configuration

環境変数の読み込みとデフォルトは `src/config.ts`。新しい env は `.env.example` も同時更新する。秘密情報は `.env` のみ（コミットしない）。

## 代表的な設定

| 変数 | 意味 |
|------|------|
| `DISCORD_TOKEN` / `CLIENT_ID` / `GUILD_ID` | Discord 接続 |
| `DATABASE_URL` | PostgreSQL |
| `BOT_NAMES` / `BOT_DISPLAY_NAME` | 呼び名 |
| `TALK_LEVEL` | 話しやすさ（1–10 系）。`TALKATIVENESS` は非推奨フォールバック |
| `CONFUSION_RATE` 等 | 勘違い・沈黙・絵文字などの確率 |
| `JANKEN_WIN_RATE` | じゃんけん勝率 |
| `GEMINI_*` | チャンネル要約・AIステータス説明など任意の Gemini 連携 |
| `AI_STATUS_TIMEOUT_MS` | `/nisei_ai_status` のステータス取得タイムアウト（既定 8000） |

数値レートは `numberEnv` パターンに従う。ギルド単位の talk level 上書きは `GuildState.talkLevel` + `talk-level.ts`。

## See Also

- [Getting Started](wiki://getting-started)
- [Deployment](wiki://deployment)
- [Discord Integration](wiki://discord-integration)
- [Agent Ownership](wiki://agent-ownership)

