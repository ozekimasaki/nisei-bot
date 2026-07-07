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
TALKATIVENESS=normal
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
pm2 restart nisei-bot
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

- `/nisei_help`
- `/nisei_uranai`
- `/nisei_haiku`
- `/nisei_stats`
- `/nisei_poke`
- `/nisei_treasure`
- `/nisei_forget subject`

通常メッセージでも反応します。

- `にせい`
- `りんごは赤いだよ`
- `りんごは？`
- `占って`
- `俳句`
- `じゃんけん` → `ぐー`
- `つんつん`
- `たからもの`

## Development

```bash
npm test
npm run build
```
