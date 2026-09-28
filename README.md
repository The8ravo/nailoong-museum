# 奶龙美术馆

**奶·龙 / NAILOONG, REFRAMED**

一个保留完整画幅、适配手机和电脑的中文线上展览。

**线上展览：<https://the8ravo.github.io/nailoong-museum/>**

奶龙即不同<br>
*Nailoong is different.*

## 已实现

- 13 件独立作品、18 幅图像；《组图》的六幅图像作为一件作品呈现。
- 首页设“进入画廊”和展览宣言；点击入口或封面图片后先阅读双语开幕词，再开始观看作品。“作品说明”整合全部作品、制作工具与参考来源。
- 每件作品有独立的详情页和画廊页。画廊每次展出一件作品，同时呈现完整图片、作品说明与制作信息。
- 普通作品说明以中文在前、英文在后的方式呈现，作品说明页、详情页和画廊保持一致；空说明与字符方阵不增加英文段落。首页不列作品清单。
- 画廊分为“命名”“扮演”“瓦解与返回”三章，每页标注所属章节，在各章首件作品处强调章节开始。
- 所有页面保留公共页眉，可前往“作品说明”和“关于展览”。开幕页和画廊支持前后控件及键盘左右键；首件作品可回到开幕词，以《救世主》收尾并进入闭幕页。闭幕后可返回首页或从开幕词重新观看，不自动循环。电脑和手机均保留完整画幅。
- 《组图》六幅图像共同呈现，图像下不设单独标题；各幅的名称与来源保存在“作品说明”中。
- 《家用厨房粉碎机》使用 10 × 10 的“奶”“龙”字符方阵作为说明。
- 三档 WebP 图片、延迟加载、减少动画偏好、站点地图、分享预览信息。
- 内容与页面分离，保留只读 JSON API；图片和展品直接在仓库维护。
- 推送 main 后使用 GitHub Actions 自动发布到 GitHub Pages。

网站不设公开的展品维护页面，也不包含打赏或支付功能。

## 本地运行

需要 Node.js 22 或更新版本。构建、预览和测试无须安装依赖。

```sh
node scripts/build.mjs
node scripts/serve.mjs
```

打开 <http://127.0.0.1:4173/>。修改后重新构建并刷新。

```sh
node --test tests/*.test.mjs
```

GitHub 项目路径由 `BASE_PATH` 控制。发布流程已设为 `/nailoong-museum`。如果仓库更名，请同步修改 `.github/workflows/pages.yml` 的 `BASE_PATH` 和 `content/settings.json` 的网址。

## 添加图片和展品

1. 将网页图片放入 `public/assets/artworks/`。建议沿用 `名称-thumb.webp`、`名称-display.webp`、`名称-full.webp`，分别用于缩略图、常规展示和大图。
2. 编辑 `content/artworks.json`，复制现有单幅作品记录，填写唯一的 `id`、`slug`、标题、中文 `description`、可选英文 `descriptionEn`、图片路径、尺寸和来源信息。没有英文翻译时省略 `descriptionEn` 或使用空字符串，不使用 `null`。
3. 用 `order` 控制展出顺序，`publish: true` 表示展出。修改现有作品时保留 `id` 和 `slug`，使分享链接继续有效。
4. 如为组图，设置 `section: "series"`，按展示顺序填写 `panels`。每幅图像有自己的图片、说明、制作工具和来源；顶层 `image` 与第一幅一致。
5. 调整顺序后检查 `content/settings.json` 的 `chapters`。每章用 `startSlug` 指定首件作品，新作品属于它之前最近开始的章节；章首作品必须保持展出，起点应按展览顺序排列。
6. 构建、预览并运行测试，然后提交到 `main`。发布完成后，网页自动采用新内容。

详细字段和后台扩展方式见 [API.md](API.md)。未知创作日期与工具信息使用 `null`。

开幕词与闭幕词分别在 `content/settings.json` 的 `opening`、`closing` 中维护，包含中英标题与成对的中英段落，分别显示于 `/gallery/` 与 `/closing/`。它们属于展览导言与结语，不计入作品数量。章节标题、中英名称及起点也在同一文件维护；可选的 `moments` 按作品 `slug` 配置中英阶段词，显示在该作品的章节标记旁。

`publish: false` 的整件作品及仅供它使用的图片不会进入生成的网站、公开 JSON API 或站点地图。公开仓库中的源文件仍然公开，这一设置仅控制网站是否展出。

## 发布设置

首次在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，随后推送或手动运行 `Publish museum`。本项目已按该方式配置。

GitHub Pages 自定义工作流：[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 目录

```text
content/artworks.json        展品资料
content/settings.json        展览、开闭幕词、章节与仓库配置
public/assets/artworks/      网页图片
public/catalog.mjs           数据接口与校验
public/app.mjs               展览交互
public/styles.css           响应式样式
scripts/build.mjs           静态页面生成器
scripts/serve.mjs           本地预览服务
tests/                      内容、草稿隔离与链接检查
API.md                      接口和后台扩展说明
.github/workflows/pages.yml 自动构建发布
```

## 图像和来源

作品图像由项目发起人提供。《奥林匹亚》《组图》《大碗岛的星期天下午》《舞蹈》《家用厨房粉碎机》使用 Gemini；其余作品使用 ChatGPT。《组图》的灵感来源为 Simon 的小红书主页，其中《构成主义奶龙》引自 Simon，其余五幅使用 Gemini，来源分别记录在各幅图像的数据中。

参考原作的作者、年代、馆藏或作品记录链接独立保存在 `reference` 中，不作为生成图像的作者署名。详见网站的“作品说明”；旧的 `/credits/` 地址会转向该页。
