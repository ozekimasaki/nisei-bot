# Feature Engines

単機能ロジックは `src/*.ts` に分離し、`ResponsePlanner` から呼び出す。

| エンジン | ファイル | 概要 |
|----------|----------|------|
| 占い | `fortune.ts` | 運勢・ラッキーカラー・アイテム |
| 俳句 | `haiku.ts` | 雑なモーラ推定で五七五っぽく |
| じゃんけん | `janken.ts` | 高勝率・連勝セッション |
| ダイス | `dice.ts` | BCDice 連携 |
| クイズ | `quiz.ts` | 覚えている知識からのクイズ |
| Wikipedia | `wikipedia.ts` + `wiki-cooldown.ts` | 調べもの＋クールダウン |
| AIステータス | `ai-status.ts` | `/nisei_ai_status`。OpenAI/Claude/Google/xAI の公式ステータスを取得し Gemini でにせい口調で説明 |
| 季節 | `seasonal.ts` | 季節ネタ |
| 虹色 ANSI | `ansi-rainbow.ts` | Discord `ansi` フェンス用 |

## 編集ルール

- 純粋関数寄りのロジックはエンジン側に置く
- 分類キーワードは `classifier.ts`、永続化は `db.ts`
- 挙動を変えたら対応する `tests/*.test.ts` を更新

## See Also

- [Intent Classification](wiki://intent-classification)
- [Response Pipeline](wiki://response-pipeline)
- [Discord Integration](wiki://discord-integration)
- [Agent Ownership](wiki://agent-ownership)
- [Testing](wiki://testing)
