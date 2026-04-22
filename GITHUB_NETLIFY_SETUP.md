# GitHub と Netlify のやさしい設定手順

この手順は、2026年4月18日 JST 時点のものです。

目的:
- このアプリを GitHub に置く
- Netlify で公開する
- Android スマホのホーム画面から開けるようにする

この手順では、できるだけ PowerShell を使いません。
おすすめは `GitHub Desktop` を使う方法です。

## 事前に用意するもの

- GitHub アカウント
- Netlify アカウント
- GitHub Desktop

## 使うフォルダ

このフォルダを使います。

`deliverables/stock-analysis-netlify-YYYYMMDD-HHMMSS/`

配布パッケージが複数ある場合は、一番新しい日時のフォルダを使ってください。

## 手順 1: GitHub に空の箱を作る

1. GitHub を開く
2. `New repository` を押す
3. Repository name に、たとえば `stock-analysis-netlify-app` と入れる
4. `Public` か `Private` を選ぶ
5. `Create repository` を押す

## 手順 2: GitHub Desktop でこのアプリを登録する

1. GitHub Desktop を開く
2. 上のメニューから `File` -> `Add local repository...` を押す
3. 使うフォルダに、配布パッケージのフォルダを選ぶ
4. `not a repository yet` の表示が出たら、`create a repository` を押す
5. 名前は GitHub で作ったものと同じにする
6. `Create repository` を押す

補足:
- このフォルダでは、`out/` や `runtime/` などの一時ファイルは GitHub に入らないようにしてあります

## 手順 3: GitHub に送る

1. GitHub Desktop の画面で、変更一覧が出ることを確認する
2. 左下の説明欄に `Initial Netlify deploy` と入れる
3. `Commit to main` を押す
4. 上の `Publish repository` を押す
5. GitHub 上の公開先が正しければ、そのまま完了する

## 手順 4: Netlify に読み込ませる

1. Netlify にログインする
2. `Add new project` を押す
3. `Import an existing project` を押す
4. `GitHub` を選ぶ
5. さきほど作った `stock-analysis-netlify-app` を選ぶ

## 手順 5: Netlify 側の設定を入れる

多くは自動で入ります。もし空欄なら、次のように入れてください。

- Base directory: 空欄
- Build command: `npm run build`
- Publish directory: `dist`

環境変数も 2 つ入れてください。

- `NODE_VERSION` = `24`
- `NPM_VERSION` = `11`

## 手順 6: 公開する

1. `Deploy` を押す
2. 数分待つ
3. 公開 URL が出たら開く

## 手順 7: 動作確認する

次の順で見ると分かりやすいです。

1. `https://あなたのURL/api/healthz` を開く
2. `ok` が見えることを確認する
3. トップ画面を開く
4. 例として `7203` や `AAPL` を入れて分析を実行する

## 手順 8: スマホで使えるようにする

1. Android スマホで Chrome を開く
2. 公開 URL を開く
3. 右上のメニューから `ホーム画面に追加` か `アプリをインストール` を押す
4. ホーム画面のアイコンから起動する

## うまくいかないとき

### GitHub Desktop で登録できない

- フォルダの場所が違うことが多いです
- `deliverables/` の中の、一番新しい `stock-analysis-netlify-...` フォルダを選んでください

### Netlify でアプリが動かない

- `Build command` が `npm run build` になっているか確認してください
- `Publish directory` が `dist` になっているか確認してください
- `NODE_VERSION=24` と `NPM_VERSION=11` を入れたか確認してください

### スマホでホーム画面追加が出ない

- 一度 URL を開き直してください
- 公開直後は少し待ってから再読み込みしてください

