# Personality and Mood

にせいの「性格」はルールと乱数で組み立てる。ユーザー向け文言は日本語・短く・自信満々・たまに間違える口調に合わせる。

## 構成

| モジュール | 役割 |
|------------|------|
| `mood.ts` | ギルド気分 |
| `affection.ts` | ユーザーへのなつき |
| `personality.ts` | mood / affection を踏まえた言い回し |
| `default-brain.ts` | デフォルト語彙・リアクション |
| `chatter-engine.ts` | 雑談エンジン |
| `phrase.ts` + `word-dictionary.ts` | 分かち書き・語彙 |

## 編集ヒント

- 定型フレーズの追加は `default-brain.ts` か各エンジンの返答配列
- 学習した知識の取り違えは `confusion.ts` / `Misunderstanding`
- レート系（沈黙・絵文字・勘違い再利用）は `config.ts` の env

## See Also

- [Response Pipeline](wiki://response-pipeline)
- [Memory Store](wiki://memory-store)
- [Configuration](wiki://configuration)
