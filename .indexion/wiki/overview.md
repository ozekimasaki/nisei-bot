# Overview

chisei-oss は Discord bot「にせい」のリポジトリです。生成AIを主エンジンにせず、ルールベースと乱数で「幼稚園児くらいのアホの子」っぽく振る舞います。

## 目的

- サーバーごとの知識学習（`○○は××だよ`）
- たまに間違える・自信満々な返答
- じゃんけん・占い・俳句・ダイス・クイズなどの遊び機能
- なつき・勘違い・たからものなど人格的な副作用

## 技術スタック

| 項目 | 内容 |
|------|------|
| Runtime | Node.js 20+、ESM (`"type": "module"`) |
| Discord | discord.js 14 |
| DB | PostgreSQL + Prisma 6 |
| Test | Vitest |
| 本番 | pm2 (`nisei-bot`、fork・単一インスタンス) |

## エージェント向け入口

- 人間向けセットアップ: [README.md](../../README.md)
- エージェント向け規約: [AGENTS.md](../../AGENTS.md)
- この wiki: `.indexion/wiki/`

## See Also

- [Getting Started](wiki://getting-started)
- [Architecture](wiki://architecture)
- [Agent Ownership](wiki://agent-ownership)
- [Deployment](wiki://deployment)
- [Testing](wiki://testing)

