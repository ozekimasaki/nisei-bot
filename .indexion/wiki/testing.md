# Testing

フレームワークは Vitest（`npm test` → `vitest run`）。

## 規約

- 分類・純粋関数には必ずテストを追加（`classifier`, `confusion`, `haiku`, `janken`, `dice` など）
- import は `../src/foo.js` 形式（ESM）
- `ResponsePlanner` のような統合ロジックは、可能なら小さな純粋関数に切り出してからテストする

## 配置

- テスト: `tests/*.test.ts`
- 対象: `src/*.ts`

意図分類を変えたら `tests/classifier.test.ts` を必ず更新する。

## See Also

- [Intent Classification](wiki://intent-classification)
- [Feature Engines](wiki://feature-engines)
- [Agent Ownership](wiki://agent-ownership)
- [Getting Started](wiki://getting-started)
- [Overview](wiki://overview)

