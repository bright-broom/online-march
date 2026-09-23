# icons

README / docs で使うアイコン。外部サービスに依存しないよう、SVG をそのまま置いている。

| フォルダ | 色 | 用途 |
| --- | --- | --- |
| `accent/` | `#2da44e` | 見出し |
| `muted/` | `#6e7781` | 本文・表（ライト／ダークどちらでも読める中間色） |

- 出典: [lucide-static](https://lucide.dev) v1.47.0（ISC。アプリの `lucide-react` と同じ版）、
  ブランドロゴのみ [simple-icons](https://simpleicons.org) v16.32.0（CC0）
- GitHub は `<img>` の SVG に `currentColor` を効かせないので、色を焼き込んでいる
- 追加するときは同じパッケージから取り、`stroke="currentColor"`（ロゴは `fill`）を上の色に置き換える
- 参照切れは `test/docs.test.ts` が CI で検知する
