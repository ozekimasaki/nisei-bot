# Response Pipeline

`ResponsePlanner`（`src/responder.ts`）がメッセージ応答の中枢。`IncomingMessage` を受け取り `ResponseResult`（本文・フォローアップ等）を返す。

## 責務

- `classifyMessage` の結果に応じてエンジンを呼び出す
- `MemoryStore` 経由で学習・照会・勘違いを扱う
- talk level / cooldown / silence / emoji などのレートを適用
- 口調は短く自信満々、たまに間違える（`utterance` / `personality` / `confusion`）

## 関連モジュール

| モジュール | 役割 |
|------------|------|
| `utterance.ts` | 定型っぽい短い発話 |
| `personality.ts` | なつき・気分を踏まえた言い回し |
| `chatter-engine.ts` | 雑談・独り言寄りの生成 |
| `confusion.ts` | 知識の取り違え |
| `unsolicited.ts` | 呼ばれていないときの介入判定 |
| `bot-context.ts` | bot 側コンテキスト組み立て |

## 編集ルール

- 新しい会話パターンは可能なら小さな純粋関数に切り出してから `ResponsePlanner` に配線する
- 生の `prisma` 呼び出しをここに散らさない（`MemoryStore` 経由）
- `src/index.ts` にビジネスロジックを戻さない

## See Also

- [Intent Classification](wiki://intent-classification)
- [Memory Store](wiki://memory-store)
- [Personality and Mood](wiki://personality-and-mood)
- [Agent Ownership](wiki://agent-ownership)

