# 内容接口与扩展

## 现有只读接口

- `GET /nailoong-museum/api/artworks.json`：`{ schemaVersion: 1, artworks: [...] }`，只返回已展出作品。
- `GET /nailoong-museum/api/site.json`：展览标题、作品数量 `artworkCount` 和图像数量 `imageCount`。
- `public/catalog.mjs` 导出 `loadCatalog(base)`、`validateCatalog(data)`、`publishedArtworks(data)`、`artworkImages(art)`。

当前网站为静态展览。没有公开维护页面和写入接口；编辑仓库中的内容与图片后，通过提交触发发布。

`artworkImages(art)` 对单幅作品返回 `[art.image]`，对组图返回按顺序排列的 `panels[].image`。构建器只复制已展出作品实际引用的图片，草稿组图的各幅图片也遵循这一规则。

## 页面地址

- `/`：“奶·龙 / NAILOONG, REFRAMED”展览首页，含画廊入口。
- `/works/`：作品说明，整合全部作品、制作信息与参考来源。
- `/works/:slug/`：单件作品详情。
- `/gallery/`：从第一件作品开始观看。
- `/gallery/:slug/`：完整展示指定作品，同时呈现作品说明与制作信息；组图各幅在同页呈现。
- `/about/`：关于展览。
- `/credits/`：旧地址，重定向到 `/works/`。

GitHub 项目部署时，上述路径统一加上 `/nailoong-museum` 前缀。

所有页面保留公共页眉中的“作品说明”和“关于展览”导航，不设页脚。画廊以带 `data-prev`、`data-next` 的链接切换前后作品，也支持键盘左右键；不设置 Esc 返回动作。首件没有上一件链接，末件没有下一件链接，以禁用状态标记观看边界，首尾不循环。

## 单件展品结构

```json
{
  "id": "NL-021",
  "slug": "a-new-artwork",
  "title": "一件新的展品",
  "titleEn": "A NEW ARTWORK",
  "section": "exhibition",
  "order": 100,
  "tag": "绘画",
  "description": "作品说明；不显示说明时使用空字符串。",
  "descriptionEn": "An English translation of the artwork description.",
  "alt": "准确的图片描述。",
  "notes": "补充说明，也可留空。",
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
    "artist": null,
    "year": null,
    "institution": null,
    "relationship": "图像改写",
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
    "origin": "展览发起人提供",
    "credit": "展览发起人",
    "url": null,
    "rightsStatus": ""
  },
  "publish": true
}
```

新作品的 `section` 使用 `exhibition` 或 `series`；读取旧数据时仍兼容 `lab`、`poster`，这些旧分类不再生成导航栏。`id` 和 `slug` 唯一。保留现有作品的 `slug` 可以维持分享链接。

图片路径限定在 `assets/artworks/` 或 `assets/uploads/`，文件类型为 WebP、PNG 或 JPEG。图片宽高为 1–20000 的整数。参考和来源链接只接受 HTTPS 或空值，不接受脚本协议、带账号密码的链接或目录穿越。所有文本在写入 HTML 时转义。

`creation` 中的未知值使用 `null`。已知日期使用有效的 `YYYY-MM-DD` 格式；`tool`、`modelVersion`、`prompt`、`humanEdits` 为文本。原作作者和年代保存在 `reference`，与生成图像的制作工具及来源分开。

`descriptionEn` 是可选的英文说明，缺少该字段的旧记录仍可读取。设置时必须是最长 10000 字符的字符串，不接受 `null`、数字或对象。普通作品先显示 `description` 中文，再显示非空的 `descriptionEn` 英文，并分别标记 `lang="zh-CN"` 和 `lang="en"`；英文和中文同样进行 HTML 转义。英文为空或仅含空白时不生成额外段落。没有中文说明的作品以及字符方阵不显示英文段落，这两种记录应省略 `descriptionEn`。

## 组图

组图仍是一条作品记录，设置 `section: "series"`，增加 2–50 个 `panels`。每个分图结构如下：

```json
{
  "title": "第一幅",
  "alt": "这幅图像的内容描述。",
  "image": {
    "width": 1200,
    "height": 1600,
    "thumb": "assets/artworks/series-01-thumb.webp",
    "display": "assets/artworks/series-01-display.webp",
    "full": "assets/artworks/series-01-full.webp"
  },
  "creation": { "date": null, "tool": "Gemini" },
  "source": {
    "filename": "第一幅.png",
    "origin": "展览发起人提供",
    "credit": "展览发起人",
    "url": null
  }
}
```

顶层 `image` 的路径和宽高必须与第一幅的 `image` 完全一致，作为作品封面。`panels` 的数组顺序即显示顺序。每一幅均保留各自的制作信息和来源；引用的图像不填写推测的生成工具。现有《组图》含六幅，其中《构成主义奶龙》的 `creation.tool` 为 `null`，来源指向原作者。

组图的图片下不显示各幅小标题。`panels[].title` 仍用于“作品说明”中的来源记录；`alt` 保持准确的图像内容描述。

## 方阵说明

普通作品无需设置 `descriptionFormat`。设置 `descriptionFormat: "matrix"` 后，`description` 按原换行展示为方阵。内容仅使用“奶”“龙”，每行字符数须等于行数，最多 100 行。JSON 中的 `\n` 表示换行；不要写成字面量的 `\\n`。现有《家用厨房粉碎机》为 10 × 10。

## 以后接入真实后台

可让另行建立的管理后台维护相同的数据结构。公开展览继续通过 `loadCatalog(base)` 获取内容，也可改为请求后台的只读接口。可采用以下写入接口：

- `POST /api/uploads`：鉴权后上传图片，校验真实 MIME、尺寸、大小，返回三档图片地址。
- `POST /api/artworks`：使用同一数据校验创建记录，默认草稿。
- `PATCH /api/artworks/:id`：更新记录并检查版本，防止多人覆盖。
- `POST /api/publish`：鉴权后触发静态构建或更新公开数据。

这些写入接口尚未部署。后台完成登录、权限与图片校验后调用；访问令牌放在服务端，公开网页只读取展出内容。
