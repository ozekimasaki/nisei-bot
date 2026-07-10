# chisei-oss

生成AIを使わず、Discord上で幼稚園児くらいの「アホの子人工知能」っぽく振る舞うbotです。

- `○○は××だよ` をサーバーごとに覚えます。
- 覚えた内容はたまに間違えます。短く、自信満々に違うことも言います。
- `おやすみ` に `おはよう` と返すことがあります。
- じゃんけんはなぜかだいたい勝ちます。
- 占いは運勢、ラッキーカラー、ラッキーアイテムを返します。
- 俳句は雑なモーラ推定で五七五っぽく読みます。
- よく話す人になつきます。
- 間違えた知識を勘違いとして残します。
- 関係ない人を `〇〇もそうだよ` と巻き込みます。
- 気に入った言葉をたからものにします。

## Requirements

- Node.js 20+
- PostgreSQL
- pm2
- Discord bot token

Discord Developer Portalで以下を有効にしてください。

- Server Members Intentは不要
- Message Content Intentは必要

## Setup

```bash
npm ci
cp .env.example .env
```

`.env` を編集します。

```env
DISCORD_TOKEN=your-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-test-guild-id
DATABASE_URL=postgresql://chisei:password@localhost:5432/chisei
BOT_NAMES=にせい,偽性
BOT_DISPLAY_NAME=にせい
TALK_LEVEL=5
# TALKATIVENESS=normal  # 非推奨。TALK_LEVEL 未設定時のフォールバック（quiet→3, normal→5, loud→10）
CONFUSION_RATE=0.2
MEMORY_MIX_RATE=0.15
JANKEN_WIN_RATE=0.95
COOLDOWN_SECONDS=45
WRONG_USER_RATE=0.12
TREASURE_PICK_RATE=0.08
AFFECTION_GAIN_RATE=1
MISUNDERSTANDING_REUSE_RATE=0.15
SILENCE_RATE=0.12
EMOJI_USE_RATE=0.18
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
GEMINI_THINKING_LEVEL=medium
```

PostgreSQLにDBとユーザーを作成してから、migrationを実行します。

```bash
npx prisma migrate deploy
npm run deploy:commands
npm run build
```

開発中は以下で起動できます。

```bash
npm run dev
```

## Windows local test with Podman

Windowsではpm2なしで起動できます。PostgreSQLはPodmanで立てる想定です。

```powershell
npm ci
Copy-Item .env.example .env
```

`.env` の `DISCORD_TOKEN`、`CLIENT_ID`、`GUILD_ID` を編集してください。`DATABASE_URL` は初期値のままでPodmanのDBにつながります。

Podman Machineを起動してからDBを立てます。

```powershell
podman machine start
npm run db:windows:up
```

環境とDB接続の確認:

```powershell
npm run db:generate
npm run check:windows
```

スラッシュコマンドをテストサーバーへ登録して、botを起動します。

```powershell
npm run deploy:commands
npm run dev:windows
```

終了は `Ctrl+C` です。DBも止める場合:

```powershell
npm run db:windows:down
```

## pm2 on Ubuntu

Ubuntuではpm2で常駐させます。Discord Gatewayの重複接続を避けるため、pm2 clusterではなくsingle instanceで起動します。

### 1. Server packages

```bash
sudo apt update
sudo apt install -y git curl postgresql postgresql-contrib
```

Node.js 20+ と pm2 を入れます。すでにNode.jsがある場合はバージョンだけ確認してください。

```bash
node -v
npm -v
sudo npm install -g pm2
```

### 2. PostgreSQL

DBユーザーとDBを作成します。`.env.example` の初期値に合わせる場合は以下です。

```bash
sudo -u postgres psql
```

```sql
CREATE USER chisei WITH PASSWORD 'password';
CREATE DATABASE chisei OWNER chisei;
\q
```

接続確認:

```bash
psql "postgresql://chisei:password@localhost:5432/chisei" -c "select 1;"
```

### 3. App setup

リポジトリを配置して依存関係を入れます。

```bash
git clone <repo-url> chisei-oss
cd chisei-oss
npm ci
cp .env.example .env
```

`.env` を編集します。最低限、以下は本番値にしてください。

```env
DISCORD_TOKEN=your-token
CLIENT_ID=your-application-client-id
GUILD_ID=your-guild-id
DATABASE_URL=postgresql://chisei:password@localhost:5432/chisei
BOT_NAMES=にせい,偽性
BOT_DISPLAY_NAME=にせい
```

### 4. Migration and commands

```bash
npm run db:generate
npx prisma migrate deploy
npm run deploy:commands
npm run build
```

`npm run deploy:commands` が `Missing Access` になる場合は、`CLIENT_ID` のbotが `GUILD_ID` のサーバーへ招待されているか確認してください。

`GUILD_ID` を設定している場合、ギルドコマンドを登録しつつグローバルコマンドを空にして二重表示を防ぎます。以前グローバル登録したことがあるサーバーでは、`npm run deploy:commands` を再実行すると解消します（グローバル側の反映に最大1時間かかることがあります）。

### 5. Start with pm2

```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` が表示する `sudo env ...` コマンドをコピーして実行してください。これでサーバー再起動後もpm2が復元されます。

### 6. Check status and logs

```bash
pm2 logs nisei-bot
pm2 status
```

### 7. Update deployment

```bash
git pull
npm ci
npm run db:generate
npx prisma migrate deploy
npm run build
npm run db:normalize-memories
npm run db:normalize-memories:apply
pm2 restart nisei-bot
```

単語記憶のルール更新後は、既存 DB に長文が残っている場合があります。本番反映前に `npm run db:normalize-memories` で dry-run 確認し、問題なければ `npm run db:normalize-memories:apply` を実行してください。破壊的変更になりうるため、可能なら `pg_dump` でバックアップを取ってから apply してください。

guild 単位で試す例:

```bash
npm run db:normalize-memories -- --guild YOUR_GUILD_ID --verbose
```

### 8. Stop / restart

```bash
pm2 restart nisei-bot
pm2 stop nisei-bot
pm2 delete nisei-bot
```

`.env` を変更した後は必ず再起動してください。

```bash
pm2 restart nisei-bot --update-env
```

## Commands

### スラッシュコマンド

- `/nisei_help` … 使い方を表示
- `/nisei_uranai` … 占い
- `/nisei_haiku` … 俳句
- `/nisei_stats` … 覚えた量の統計
- `/nisei_poke` … つんつん
- `/nisei_treasure` … たからもの
- `/nisei_forget subject:...` … 覚えた言葉を忘れる
- `/nisei_wiki query:...` … ウィキペディア検索
- `/nisei_kanchigai` … かんちがい図鑑
- `/nisei_album` … たからものアルバム
- `/nisei_quiz` … 記憶クイズ
- `/nisei_janken` … じゃんけん開始
- `/nisei_shizuka on:true/false` … このチャンネルを静かにする / 戻す
- `/nisei_hatsugen level:0-10` … サーバー全体の発言レベル（0=黙る、5=ふつう、10=多め）
- `/nisei_hatsugen level:5 reset:true` … 発言レベルを env デフォルトに戻す
- `/nisei_summary channel:#...` … 指定チャンネルの直近24時間を Gemini でにせい口調でまとめる（Embed 1つ）

`/nisei_summary` を使うには `.env` に `GEMINI_API_KEY` が必要です。モデルは `GEMINI_MODEL`（初期値 `gemini-3.5-flash`）、thinking は `GEMINI_THINKING_LEVEL`（初期値 `medium`）で変更できます。直近24時間のテキストに加え、チャンネル内の画像添付（最大12枚・各4MBまで）も Gemini に渡して要約します。長いときは「つづきみる？」ボタンで続きを同じメッセージ内に表示します（区切りは Gemini、失敗時は機械分割）。コマンド追加・変更後は `npm run deploy:commands` を実行してください。

### 反応するワード・パターン

通常メッセージでも、以下のパターンに当てはまると反応します。`BOT_NAMES`（初期値: `にせい`, `偽性`）や `@メンション` はどの文脈でも呼びかけとして扱われます。

#### 呼びかけ

- `にせい` / `偽性`（`BOT_NAMES` で変更可）
- `@にせい` などのメンション

#### おぼえる・訂正する

| パターン | 例 |
|---|---|
| `○○は××だよ` など | `りんごは赤いだよ` / `りんごは赤いです` / `りんごは赤い` / `りんごは赤いなの` / `りんごは赤いやで` / `りんごは赤いだね` |
| `○○は××じゃない` | `りんごは赤いじゃない` / `りんごは赤いじゃないよ` |

#### 質問

| パターン | 例 |
|---|---|
| `○○は？` / `○○って？` | `りんごは？` / `りんごって？` |
| `○○はなに？` / `○○は何？` | `りんごは何？` |
| `○○なんだっけ？` / `○○何だっけ？` | `りんごなんだっけ？` |
| `なに？` / `何？` など単独 | `何？` |

`マジで？` や `どう思う？` のような普通の疑問文は対象外です。呼ばれていないときは確率でだけ反応します。

#### ウィキペディア検索

| パターン | 例 |
|---|---|
| `○○調べて` / `○○を調べて` / `○○しらべて` | `りんご調べて` |
| `○○wiki` / `○○ウィキ` / `○○ウィキペディア` | `りんごwiki` |
| `wiki ○○` / `ウィキ ○○` | `wiki りんご` |

#### 占い

- `占い` / `占って` / `占う` / `うらない` / `運勢`

#### 俳句

- `俳句` / `一句` / `575` / `五七五`
- `1`〜`99` の数字だけのメッセージ（数字俳句）

#### じゃんけん

| 段階 | ワード |
|---|---|
| 開始 | `じゃんけん` / `ジャンケン` / `janken` |
| もう一回 | `もう一回` / `もういっかい` / `まだ` |
| 手 | `ぐー` `グー` `ぐう` `✊` / `ちょき` `チョキ` `ちょきー` `✌` `✌️` / `ぱー` `パー` `ぱあ` `✋` |

じゃんけん中でなければ、手だけ送っても反応しません（呼びかけが必要です）。

#### つんつん

- `つんつん` / `つっつ` / `poke` / `にせいつん`

#### たからもの・図鑑

| 内容 | 含まれる語 |
|---|---|
| たからもの | `たからもの` / `宝物` / `宝もの` / `treasure` |
| かんちがい図鑑 | `かんちがい` / `勘違い` |
| たからものアルバム | `図鑑` / `アルバム` |

#### クイズ

- `クイズ` / `クイズして` / `クイズやって` / `クイズ出して` / `quiz`

#### 挨拶（たまに間違える）

| 種類 | ワード |
|---|---|
| 朝 | `おはよ` / `お早う` / `good morning` |
| 夜 | `おやすみ` / `寝る` / `ねる` / `good night` |
| 帰宅 | `ただいま` |
| その他 | `こんにちは` / `こんばんは` / `やあ` / `hello` / `hi` |

#### 静かモード（チャンネル単位）

文中に含まれていても反応します（`やめて` は `静かに` より優先）。

| 操作 | ワード |
|---|---|
| 静かにする | `静かに` / `しずかに`（`して` `しといて` `で` 付き可） |
| 戻す | `静かにやめて` / `しずかにやめて` / `出てきて` / `また話して` / `戻ってきて` / `もういいよ` |

例: `今から静かにして` / `にせい、出てきて`

静かモード中は `にせい` や `@メンション` で呼ばれたときだけ出ます。

#### 発言レベル（サーバー単位）

`/nisei_hatsugen level:N` で、呼ばれていないときの雑談介入確率をサーバーごとに変えられます。

| レベル | 目安 |
|---|---|
| 0 | 完全黙り（呼ばれたら出る） |
| 5 | ふつう（デフォルト、約10%） |
| 10 | 多め（約20%） |

`reset:true` で env の `TALK_LEVEL`（未設定時は `TALKATIVENESS`）に戻します。`/nisei_stats` に現在のレベルが表示されます。

#### ツッコミ（直前ににせいが話したあと）

| パターン | 例 |
|---|---|
| 訂正 | `ちがう` / `違う` / `じゃない` / `ちがいます` / `違います` |
| 疑い | `ほんと` / `本当` / `マジ` / `まじ`（単独） |
| 嘘呼び | `うそ`（単独） |

#### 画像・GIF

- 画像または GIF を添付したメッセージ

#### 雑談への割り込み

上記のどれにも当てはまらない普通の会話、および**呼ばれていないときの**挨拶・占い・俳句・つんつん・たからもの・図鑑・クイズ・画像・質問反応は、確率でだけ反応します（`TALK_LEVEL`（0〜10、デフォルト 5）や `CHATTER_CHANCE_CAP` で調整。サーバーごとは `/nisei_hatsugen` でも変更可）。`にせい` や `@メンション` で呼ばれたときは、これらは通常どおり反応します。

`○○は××だよ` は呼びかけなしでも毎回反応します。`○○は？` のような質問は、`マジで？` のような普通の疑問文とは区別し、呼ばれていないときは確率でだけ反応します。

#### 文中マッチと文全体マッチ

| 文中に含まれていれば反応 | 文全体（または決まった形）のみ |
|---|---|
| 占い・俳句・つんつん・たからもの・かんちがい・図鑑・挨拶・静かモード・質問（`○○は？` など） | `○○は××だよ`（教える） |
| 呼びかけ（`にせい` など） | `○○調べて`（Wiki） |
| | `じゃんけん` / `クイズ`（文頭） |
| | `ぐー` などの手（メッセージ全体） |
| | `ちがう` などのツッコミ（文頭） |
| | `1`〜`99` だけの数字俳句 |

#### 反応しない例

- ボット自身のメッセージ
- 静かモード中の呼びかけ以外
- クールダウン中の雑談割り込み

## Development

```bash
npm test
npm run build
```
