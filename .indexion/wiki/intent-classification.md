# Intent Classification

`src/classifier.ts` がユーザー発話を `MessageIntent`（discriminated union）に分類する。

## 主な intent

| type | 概要 |
|------|------|
| `teach` / `denyTeach` | 知識の学習・否定 |
| `question` | 質問（覚えた知識への問い合わせ） |
| `wikiSearch` | Wikipedia 検索要求 |
| `greeting` | 朝・夜・帰宅などの挨拶 |
| `fortune` / `haiku` / `dice` / `quiz` | 遊び機能 |
| `jankenStart` / `jankenHand` / `jankenRematch` | じゃんけん |
| `poke` / `treasure` / `kanchigai` / `album` | なつき・たからもの・勘違い |
| `quietOn` / `quietOff` | チャンネル静音 |
| `chatter` | 呼びかけ以外の雑談候補 |
| `correction` / `doubt` / `lieCall` | 訂正・疑い・嘘つき指摘 |

## 編集ルール

- 正規表現・キーワードの追加はここが正本
- 新しい intent を追加したら `tests/classifier.test.ts` を更新する
- `switch` で扱う側（`responder.ts`）は `default` に `never` チェックを入れる

## 呼び出し判定

`isCalled` / `ClassifierOptions.botNames` / bot メンションで「呼ばれたか」を判定する。ダイス式は `extractDiceFormula` が補助する。

## See Also

- [Response Pipeline](wiki://response-pipeline)
- [Feature Engines](wiki://feature-engines)
- [Testing](wiki://testing)
- [Agent Ownership](wiki://agent-ownership)

