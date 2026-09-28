# 内容接口与扩展

## 现有只读接口

- `GET /nailoong-museum/api/artworks.json`：`{ schemaVersion: 1, artworks: [...] }`，只返回已展出作品。
- `GET /nailoong-museum/api/site.json`：展览标题、作品数量 `artworkCount` 和图像数量 `imageCount`。
- `public/catalog.mjs` 导出 `loadCatalog(base)`、`validateCatalog(data)`、`publishedArtworks(data)`、`artworkImages(art)`。

当前网站为静态展览。没有公开维护页面和写入接口；编辑仓库中的内容与图片后，通过提交触发发布。

`artworkImages(art)` 对单幅作品返回 `[art.image]`，对组图返回按顺序排列的 `panels[].image`。构建器只复制已展出作品实际引用的图片，草稿组图的各幅图片也遵循这一规则。

## 页面地址

- `/`：“奶·龙 / NAILOONG, REFRAMED”展览首页，含画廊入口与展览宣言，不列作品清单或开幕词；所有画廊入口和封面图片链接均指向 `/gallery/`。
- `/works/`：作品说明，整合全部作品、制作信息与参考来源。
- `/works/:slug/`：单件作品详情。
- `/gallery/`：独立双语开幕页，选择“开始观看”后进入首件作品。
- `/gallery/:slug/`：完整展示指定作品，同时呈现所属章节、作品说明与制作信息；点击图片可打开大图，组图各幅在同页呈现且可独立打开。
- `/closing/`：双语闭幕词，可返回首页或重新观看，不计作展品。
- `/about/`：关于展览。
- `/credits/`：旧地址，重定向到 `/works/`。

GitHub 项目部署时，上述路径统一加上 `/nailoong-museum` 前缀。

所有页面保留公共页眉中的“作品说明”和“关于展览”导航，不设页脚。开幕页和画廊以带 `data-prev`、`data-next` 的链接前后切换，也支持键盘左右键；不设置 Esc 返回上一页动作。开幕页带 `.opening-page` 和 `data-gallery`，前一项回到首页，后一项“开始观看”进入首件作品的 `/gallery/:slug/`。首件作品的前一项“开幕词”回到 `/gallery/`，末件《救世主》的 `data-next` 指向 `/closing/`。闭幕页不设置 `data-gallery`，不启用画廊键盘导航；“重新观看”回到开幕页 `/gallery/`，不自动循环。

## 画廊大图查看

大图查看仅用于 `/gallery/:slug/`。每幅图片放在 `a.image-zoom[data-image-zoom][data-title]` 中，`href` 指向该幅的 `image.full`；组图的每幅分别生成链接。JavaScript 可用且浏览器支持模态对话框时打开 `dialog#artwork-viewer`；否则链接仍可直接打开高清图片。`/works/` 与 `/works/:slug/` 的图片继续链接对应画廊页面。

查看器包含 `[data-viewer-image]`、`[data-viewer-title]`、`[data-viewer-stage]`、`[data-viewer-status]`，以及 `button[data-viewer-close]` 与 `button[data-viewer-zoom]`。这些标记供 `public/app.mjs` 绑定图片、标题、查看状态和关闭、缩放控件；图片及标题仍来自现有作品或分图数据，无须增加内容字段。

点击查看框外、“返回作品”或按 Esc 关闭大图，回到当前作品的原有位置，不跳转页面。框内点击、从框内拖动到框外均不会关闭。查看大图期间暂停画廊的左右键切换；关闭后恢复，并将键盘焦点交还给打开大图的链接。

## 开闭幕词与章节配置

`content/settings.json` 保留站点标题与网址等设置，并增加以下内容字段：

```json
{
  "opening": {
    "title": "开幕词",
    "titleEn": "Opening",
    "paragraphs": [{ "zh": "中文开幕词。", "en": "English opening text." }]
  },
  "closing": {
    "title": "闭幕词",
    "titleEn": "Closing",
    "paragraphs": [{ "zh": "中文闭幕词。", "en": "English closing text." }]
  },
  "chapters": [
    { "id": "naming", "title": "命名", "titleEn": "Naming", "startSlug": "this-is-not-nailoong" },
    { "id": "performing", "title": "扮演", "titleEn": "Playing a Role", "startSlug": "the-fifer" },
    { "id": "dissolution-return", "title": "瓦解与返回", "titleEn": "Dissolution and Return", "startSlug": "paint-pot-angel" }
  ]
}
```

开闭幕词的 `paragraphs` 按数组顺序显示，每段先中文 `zh`、后英文 `en`，并对文本进行 HTML 转义。当前开幕词和闭幕词各保留一对中英段落，数组结构允许日后增加段落。开幕词显示在进入画廊后的 `/gallery/`，闭幕词显示在 `/closing/`。它们不进入展品 JSON，也不影响 `artworkCount` 或 `imageCount`；两个页面都会进入站点地图。

章节按 `chapters` 数组顺序定义。`id` 应唯一且稳定；`startSlug` 必须对应已展出的作品，章首应按展览顺序递增，第一章从首件作品开始。每件作品归属它之前最近开始的章节，直到下一章开始。新增或调整作品时，维护 `order` 并复核这些起点；不要将章首作品设为草稿而保留悬空的 `startSlug`。

画廊每页的 `.chapter-marker` 通过 `data-chapter` 提供章节 ID，只有章首作品的同一标记带 `.chapter-start`。章节不增加展品数量，也不额外插入画廊作品。

可选的 `moments` 对象以作品 `slug` 为键，值为 `{ "zh": "重复", "en": "Repetition" }`，在该作品的章节标记旁显示阶段词。当前 `series`、`almost-disappearing`、`salvator` 分别标记“重复”“瓦解”“返回”；阶段词不改变章节归属。

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

顶层 `image` 的路径和宽高必须与第一幅的 `image` 完全一致，作为作品封面。`panels` 的数组顺序即显示顺序。每一幅均保留各自的制作信息和来源；引用的图像不填写推测的生成工具。现有《组图》含六幅，其中《构成主义奶龙》的 `creation.tool` 为 `null`，署名 Simon，来源指向其小红书主页；顶层作品来源与灵感链接使用同一主页地址。

作品说明页、详情页和画廊的组图制作信息均由 `panels` 动态汇总：`creation.tool` 非空的分图按工具统计，显示在“生成工具”项；没有工具的引用分图按 `source.credit` 统计，显示在“引用作者”项，并使用 `source.url` 链接作者来源。当前分别为 Gemini（5 幅）与 Simon（1 幅）。各幅来源列表使用“生成工具：”或“作者：”前缀，避免将引用作者写成生成工具。

现有六幅组图保持三列两行，图片下不显示各幅小标题。`panels[].title` 仍用于“作品说明”中的来源记录和画廊大图查看器的标题；`alt` 保持准确的图像内容描述。新增分图后，每幅均沿用自己的 `image.full` 打开大图。

## 方阵说明

普通作品无需设置 `descriptionFormat`。设置 `descriptionFormat: "matrix"` 后，`description` 按原换行展示为方阵。内容仅使用“奶”“龙”，每行字符数须等于行数，最多 100 行。JSON 中的 `\n` 表示换行；不要写成字面量的 `\\n`。现有《家用厨房粉碎机》为 10 × 10。

## 以后接入真实后台

可让另行建立的管理后台维护相同的数据结构。公开展览继续通过 `loadCatalog(base)` 获取内容，也可改为请求后台的只读接口。可采用以下写入接口：

- `POST /api/uploads`：鉴权后上传图片，校验真实 MIME、尺寸、大小，返回三档图片地址。
- `POST /api/artworks`：使用同一数据校验创建记录，默认草稿。
- `PATCH /api/artworks/:id`：更新记录并检查版本，防止多人覆盖。
- `POST /api/publish`：鉴权后触发静态构建或更新公开数据。

这些写入接口尚未部署。后台完成登录、权限与图片校验后调用；访问令牌放在服务端，公开网页只读取展出内容。
