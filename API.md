# 内容接口与扩展

## 现有只读接口

- `GET /nailoong-museum/api/artworks.json`：`{ schemaVersion: 1, artworks: [...] }`，只返回已展出作品。
- `GET /nailoong-museum/api/site.json`：展览标题、展品数量和展区。
- `public/catalog.mjs` 导出 `loadCatalog(base)`、`validateCatalog(data)`、`publishedArtworks(data)`。

没有伪装成后台的 POST 接口：GitHub Pages 只能托管静态文件。维护页将图片转换、草稿保存、更新包导出都放在当前浏览器完成。正式更新由仓库提交触发。

## 单件展品结构

```json
{
  "id": "NL-017",
  "slug": "a-new-artwork",
  "title": "一件新的展品",
  "titleEn": "A NEW ARTWORK",
  "section": "lab",
  "order": 100,
  "tag": "色彩实验",
  "description": "画面中可见的细节与观看提示。",
  "alt": "准确的图片描述。",
  "notes": "展开后阅读的创作解说。",
  "medium": "AI 辅助创作的数字图像",
  "image": {
    "width": 1200,
    "height": 1600,
    "thumb": "assets/artworks/a-new-artwork-thumb.webp",
    "display": "assets/artworks/a-new-artwork-display.webp",
    "full": "assets/artworks/a-new-artwork-full.webp"
  },
  "reference": {
    "title": "灵感作品或视觉语汇",
    "url": null,
    "relationship": "风格实验",
    "note": "如实记录参考关系。"
  },
  "creation": {
    "date": null,
    "tool": null,
    "modelVersion": null,
    "prompt": null,
    "humanEdits": null
  },
  "source": {
    "filename": "原文件名.png",
    "origin": "维护者提供",
    "rightsStatus": "如实填写素材来源及使用说明"
  },
  "publish": true
}
```

`section` 支持 `exhibition`、`lab`、`poster`。`id` 和 `slug` 唯一，现有作品网址不可在编辑器中随意变更以避免分享链接失效。图片路径限定在 `assets/artworks/` 或 `assets/uploads/`，不接受外部脚本协议或目录穿越。所有用户文本输出到 HTML 时转义。

## 以后接入真实后台

可将 `loadCatalog(base)` 换成 API 客户端，并为维护页增加登录和保存动作。建议后端提供：

- `POST /api/uploads`：鉴权后上传图片，校验真实 MIME、尺寸、大小，返回三档图片地址。
- `POST /api/artworks`：使用同一数据校验创建记录，默认草稿。
- `PATCH /api/artworks/:id`：更新记录并检查版本，防止多人覆盖。
- `POST /api/publish`：鉴权后触发静态构建或更新公开数据。

这是未来接口约定，**这些写接口目前没有部署**。不应在公共前端存放 GitHub 管理令牌。接入后台时再实现登录、权限、CSRF 防护、上传校验和审计记录。

## 更新包

ZIP 包包含完整 `content/artworks.json` 及当前浏览器中新增/替换过的图片。未修改的已上线图片不重复打包。保存使用 IndexedDB 事务，失败时显示错误；导出前也会再次校验资料。
