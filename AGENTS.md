# AGENTS.md

このファイルは、chisei-oss（Discord bot「にせい」）を編集するコーディングエージェント向けのガイドです。

## プロジェクト概要

- **目的**: 生成AIを使わず、ルールベースと乱数で「幼稚園児くらいのアホの子」っぽく振る舞う Discord bot
- **ランタイム**: Node.js 20+、ESM（`"type": "module"`）
- **主要依存**: discord.js 14、Prisma 6、PostgreSQL、Vitest
- **本番起動**: `npm run build` → `pm2 start ecosystem.config.cjs`（アプリ名 `nisei-bot`、**cluster 不可・単一インスタンス**）

bot の返答文・性格は日本語です。ユーザー向け文言を追加・変更する場合は、既存の口調（短く、自信満々、たまに間違える）に合わせてください。

## よく使うコマンド

```bash
npm ci
npm run db:generate
npx prisma migrate deploy   # 本番 / 初回セットアップ
npm run db:dev              # 開発用 migration 作成
npm run deploy:commands     # スラッシュコマンド登録（要 .env）
npm run dev                 # 開発起動（tsx）
npm run build               # tsc → dist/
npm start                   # node dist/index.js
npm test                    # vitest run
```

Windows ローカル検証（Podman）:

```powershell
npm run db:windows:up
npm run check:windows
npm run dev:windows
```

## アーキテクチャ

```
Discord Gateway
    ↓
src/index.ts          … Client 初期化、MessageCreate / InteractionCreate
    ↓
src/responder.ts      … ResponsePlanner（メッセージ応答の中枢）
    ↓
src/classifier.ts     … 意図分類（teach / question / janken など）
src/db.ts             … MemoryStore（Prisma 経由の永続化）
src/confusion.ts 等   … 各機能エンジン（占い・俳句・じゃんけん・気分など）
```

### 編集時のオーナーシップ

| 変更したいこと | 主な編集先 |
|---|---|
| メッセージの意図判定（正規表現・キーワード） | `src/classifier.ts` |
| 返答ロジック・新しい会話パターン | `src/responder.ts` |
| DB 読み書き・スキーマ連携 | `src/db.ts` + `prisma/schema.prisma` |
| スラッシュコマンド定義 | `src/commands.ts` |
| スラッシュコマンドの処理 | `src/index.ts` の `handleCommand` |
| 環境変数・デフォルト値 | `src/config.ts`、`.env.example` |
| 占い・俳句・じゃんけん等の単体ロジック | 各 `src/*.ts` モジュール |
| デフォルトの語彙・リアクション | `src/default-brain.ts` |

**避けること**

- `src/index.ts` にビジネスロジックを大量追加しない（配線だけに留める）
- `scripts/` を本番経路に組み込まない（開発補助用）
- Discord Gateway の重複接続を招く変更（pm2 cluster 化など）

## コーディング規約

### TypeScript / ESM

- `tsconfig.json` は `rootDir: "src"`、`include: ["src/**/*.ts"]` のみ
- ソース内の相対 import は **`.js` 拡張子付き**（例: `import { x } from "./config.js"`）
- `strict: true` を維持する
- discriminated union の `switch` では `default` に `never` チェックを入れる

### テスト

- フレームワーク: Vitest（`tests/*.test.ts`）
- **分類・純粋関数は必ずテストを追加**（`classifier`, `confusion`, `haiku`, `janken` など）
- import パスは `../src/foo.js` 形式
- `ResponsePlanner` のような統合ロジックは、可能なら小さな純粋関数に切り出してからテストする

### データベース

- スキーマ変更時は `prisma/schema.prisma` を更新し、`prisma/migrations/` に migration を追加
- `MemoryStore` が Prisma モデルの唯一のラッパーとして機能している。生の `prisma` 呼び出しを `responder.ts` に散らさない
- 本番反映前: `npm run db:generate` → `npx prisma migrate deploy`

### Discord

- 必要 Intent: `Guilds`, `GuildMessages`, `MessageContent`（Server Members Intent は不要）
- 返信時は `allowedMentions: { parse: [] }` を維持（意図しないメンション防止）
- スラッシュコマンド名は `nisei_` プレフィックス（`src/commands.ts`）
- コマンド追加・変更後は `npm run deploy:commands` が必要

### 設定・秘密情報

- 秘密情報は `.env` のみ。コミットしない
- 新しい env 変数は `src/config.ts` と `.env.example` の両方を更新
- 数値系のレート（`CONFUSION_RATE` など）は `numberEnv` パターンに従う

## デプロイ（Ubuntu / pm2）

```bash
git pull
npm ci
npm run db:generate
npx prisma migrate deploy
npm run build          # dist/index.js が生成されることを確認
pm2 restart nisei-bot
```

`.env` 変更後は `pm2 restart nisei-bot --update-env`。

`pm2 start` で `Script not found: dist/index.js` になる場合は、**ビルド未実行**が原因。`npm run build` を先に実行する。

## コミット・プッシュ

実装タスクを完了したら、**コミット作成後に必ずリモートへ push する**。コミットだけで作業を終えない。

### 手順

1. `npm test` が通ることを確認する
2. 変更をステージしてコミットする
3. `git push` する（新規ブランチなら `git push -u origin HEAD`）

### コミットメッセージ

リポジトリオーナーの規約に従い、日本語で書く:

```
<type>(<scope>): <概要>

<詳細な説明（任意）>
```

タイプ例: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`

### push 時の注意

- コミット対象の変更がない場合は push 不要
- `main` / `master` への force push は禁止
- push が失敗したら原因を確認し、解決するかユーザーに報告する

## 変更時のチェックリスト

1. `npm test` が通る
2. 意図分類を変えたら `tests/classifier.test.ts` 等を更新
3. DB を触ったら migration と `db:generate` を忘れない
4. スラッシュコマンドを触ったら `deploy:commands` を README に追記するか、PR 説明に明記
5. 本番影響がある変更は README の該当セクション（Setup / pm2）と整合しているか確認
6. 変更範囲は最小限。無関係なリファクタやフォーマット変更を混ぜない
7. コミットしたら **必ず `git push` する**（新規ブランチは `git push -u origin HEAD`）

## 参考

- 人間向けセットアップ手順: [README.md](README.md)
- pm2 設定: [ecosystem.config.cjs](ecosystem.config.cjs)
- Windows 用 DB: [docker-compose.yml](docker-compose.yml)
