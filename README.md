# 株式意思決定支援アプリ（Netlify版）

Netlify 単独構成を前提に、Android スマホでも使いやすいよう再設計した株価分析 Web アプリです。

## できること

- 銘柄コードと市場を指定して分析ジョブを起動
- `上昇確率`、`期待リターン`、`モデル合意度`、`バックテスト精度`、`最終判定` を表示
- `概要`、`バックテスト`、`説明可能性` の3タブ表示
- Netlify Functions / Background Functions / Blobs / Cache API を利用する前提の構成
- PWA としてホーム画面追加、直近結果のオフライン閲覧に対応

## ローカル起動

前提:

- Node.js 24 系
- npm 11 系
- Netlify CLI のグローバル導入は不要
- `npm run dev:netlify` は OneDrive 外の OS 一時領域を優先し、使えない場合は `runtime/` へフォールバックして起動する

手順:

1. `npm install`
2. `npm run dev:netlify`
3. ブラウザで表示された URL を開く

静的フロントだけ確認したい場合:

1. `npm install`
2. `npm run build`
3. `npm run preview`

## 主なコマンド

- `npm run dev`
  Vite フロントのみ起動
- `npm run dev:netlify`
  Netlify Functions / Background Functions を含めたローカル開発
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check`

## 主要ディレクトリ

- `src/`
  React フロントエンド
- `shared/`
  分析ロジック、DTO、バリデーション
- `netlify/functions/`
  Netlify Functions / Background Functions
- `public/`
  manifest, service worker, icons
- `runtime/`
  ローカル運用時の空ディレクトリ

## 配備ガイド

- GitHub と Netlify への設定手順は `GITHUB_NETLIFY_SETUP.md` を参照

## 補足

- Python は使っていません。
- 既存デスクトップ版の完全再現ではなく、Netlify で実行可能な近似モデルへ置き換えています。
- Yahoo Finance のレート制限が発生した場合は日本語エラーを返します。
