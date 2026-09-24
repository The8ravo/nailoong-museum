# 奶龙美术馆 · Nailoong, Reframed

一个保留完整画幅、适配手机和电脑的中文线上展览。

**线上展览：<https://the8ravo.github.io/nailoong-museum/>**  
**展品维护：<https://the8ravo.github.io/nailoong-museum/studio/>**

## 已实现

- 8 件名画重演、6 件风格实验、1 件序厅海报。
- 每件作品有独立静态网址、图像描述、创作解说、参考来源、前后件导航。
- 全屏看图、键盘操作、手机菜单、展区筛选、原生分享/复制链接。
- 风格实验室可切换两个版本进行并排比较。
- 本机展品编辑器：上传图片、编辑文字、保存草稿、导出可直接合并的更新 ZIP。
- 三档 WebP 图片、延迟加载、减少动画偏好、站点地图、分享预览信息。
- 内容 JSON 与页面分离，保留只读 JSON API 和未来后台的接入说明。
- 推送 main 后使用 GitHub Actions 自动发布到 GitHub Pages。

按项目发起人的最新要求，**首版不包含打赏或支付功能**。

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

推荐使用网站底部的 **展品维护** 入口。

1. 点击“添加新展品”，选择 JPG/PNG/WebP 图片（最大 20 MB）。网页会在当前浏览器中生成三档 WebP，不上传到第三方。
2. 填写标题、编号、网址名称、展区、图像描述、作品说明等信息。
3. 保存本机草稿。支持编辑现有作品、更换图片、调整顺序及是否展出。
4. 点击“导出更新包”。解压后把 `content`、`public` 文件夹合并到仓库根目录；原有未改动图片不会重复打包，不能删除。
5. 提交并推送到 `main`，等待 Actions 成功后访问网站。

也可直接修改 `content/artworks.json` 并将图片放到 `public/assets/artworks/`。`order` 数字控制展出顺序，`publish: false` 的记录及未使用图片不会进入生成的网站、公开 JSON API 或 sitemap。

**草稿不是线上后台。** 维护页使用 IndexedDB 保存当前浏览器的草稿，不会凭空同步到 GitHub。请保留导出包；多人编辑前先导入仓库最新的 `content/artworks.json`。不要将 GitHub 密码、访问令牌或支付密钥写入网站。

公开仓库中的源文件依然公开，即使 `publish: false`。真正需要保密的素材请保留在本地，不提交到公开仓库。

## 发布设置

首次在仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**，随后推送或手动运行 `Publish museum`。本项目已按该方式配置。

GitHub Pages 自定义工作流：[官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 目录

```text
content/artworks.json        展品资料
content/settings.json        展览和仓库配置
public/assets/artworks/      网页图片
public/catalog.mjs           数据接口与校验
public/studio.mjs            本机展品维护
public/app.mjs               展览交互
public/styles.css           响应式样式
scripts/build.mjs           静态页面生成器
scripts/serve.mjs           本地预览服务
tests/                      内容、草稿隔离与链接检查
API.md                      接口和后台扩展说明
.github/workflows/pages.yml 自动构建发布
```

## 图像和来源

网站为非官方 AI 二次创作展，与奶龙权利方及相关艺术机构无隶属或背书关系。图像由项目发起人提供，奶龙角色、参考作品与相关图形的权利归各自权利人。网站未声明这些图像可以自由商用。未提供的生成工具、创作日期、原始参考图片和授权记录如实留空或标为未提供。

依据策展分配，来稿《村上隆奶龙》未加入仓库或网站。原始压缩包和完整策展草案仅保留在本地工作目录，不上传。

JSZip 为本机导出更新包使用的第三方组件，许可见 `public/vendor/JSZip-LICENSE.md`。
