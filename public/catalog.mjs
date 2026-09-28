export const SECTIONS = { exhibition: '作品', series: '组图', lab: '作品', poster: '作品' };
export const safeAsset = value => typeof value === 'string' && /^assets\/(?:artworks|uploads)\/[a-z0-9][a-z0-9._/-]*\.(?:webp|png|jpe?g)$/i.test(value) && !value.split('/').includes('..');
export function safeUrl(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 4096) return false;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textValue = (value, required = false) => typeof value === 'string' && value.length <= 10000 && (!required || value.trim().length > 0);
function validateImage(image, label) {
  if (!record(image) || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 20000 || image.height > 20000) throw new Error(`${label} 的图片尺寸无效。`);
  for (const key of ['thumb','display','full']) if (!safeAsset(image[key])) throw new Error(`${label} 的图片路径无效。`);
}
function validateSource(source, label) {
  if (!record(source) || !textValue(source.filename) || !textValue(source.origin) || (source.rightsStatus !== undefined && !textValue(source.rightsStatus)) || (source.credit !== undefined && !textValue(source.credit)) || !safeUrl(source.url)) throw new Error(`${label} 的来源信息无效。`);
}
function validateCreation(creation, label) {
  if (!record(creation)) throw new Error(`${label} 的创作信息无效。`);
  for (const key of ['date','tool','modelVersion','prompt','humanEdits']) {
    if (creation[key] !== undefined && creation[key] !== null && !textValue(creation[key])) throw new Error(`${label} 的创作信息无效。`);
  }
  if (creation.date && (!/^\d{4}-\d{2}-\d{2}$/.test(creation.date) || !Number.isFinite(Date.parse(creation.date)) || new Date(creation.date).toISOString().slice(0,10) !== creation.date)) throw new Error(`${label} 的创作日期无效。`);
}
export function artworkImages(art) { return art.panels?.length ? art.panels.map(panel => panel.image) : [art.image]; }
export function validateCatalog(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.artworks)) throw new Error('展品文件格式不正确，需要 schemaVersion: 1 和 artworks 列表。');
  const ids = new Set(), slugs = new Set();
  for (const art of data.artworks) {
    if (!record(art)) throw new Error('展品记录必须是对象。');
    if (!/^[A-Z0-9][A-Z0-9-]{1,49}$/.test(art.id || '') || ids.has(art.id)) throw new Error(`展品编号无效或重复：${art.id}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(art.slug || '') || art.slug.length > 80 || slugs.has(art.slug)) throw new Error(`网址名称无效或重复：${art.slug}`);
    ids.add(art.id); slugs.add(art.slug);
    for (const key of ['title','titleEn','description','alt','notes','medium','tag']) {
      if (!textValue(art[key], ['title','alt'].includes(key))) throw new Error(`${art.id} 的 ${key} 无效。`);
    }
    if (art.descriptionEn !== undefined && !textValue(art.descriptionEn)) throw new Error(`${art.id} 的 descriptionEn 无效。`);
    if (!Object.hasOwn(SECTIONS, art.section) || !Number.isFinite(art.order) || typeof art.publish !== 'boolean') throw new Error(`${art.id} 的展区、顺序或发布状态无效。`);
    validateImage(art.image, art.id);
    if (!record(art.reference) || !textValue(art.reference.title) || !safeUrl(art.reference.url) || !textValue(art.reference.note)) throw new Error(`${art.id} 的参考作品信息无效。`);
    for (const key of ['artist','year','institution','relationship']) if (art.reference[key] !== undefined && art.reference[key] !== null && !textValue(art.reference[key])) throw new Error(`${art.id} 的参考作品信息无效。`);
    validateSource(art.source, art.id);
    validateCreation(art.creation, art.id);
    if (art.descriptionFormat !== undefined && !['text','matrix'].includes(art.descriptionFormat)) throw new Error(`${art.id} 的描述格式无效。`);
    if (art.descriptionFormat === 'matrix') {
      const rows = art.description.split('\n');
      if (rows.length > 100 || !rows.every(row => /^[奶龙]+$/.test(row) && [...row].length === rows.length)) throw new Error(`${art.id} 的方阵描述无效。`);
    }
    if (art.panels !== undefined) {
      if (!Array.isArray(art.panels) || art.panels.length < 2 || art.panels.length > 50) throw new Error(`${art.id} 的组图数量无效。`);
      for (const [index, panel] of art.panels.entries()) {
        const label = `${art.id} 第 ${index + 1} 幅`;
        if (!record(panel) || !textValue(panel.title, true) || !textValue(panel.alt, true)) throw new Error(`${label} 的组图说明无效。`);
        validateImage(panel.image, label);
        validateSource(panel.source, label);
        validateCreation(panel.creation, label);
      }
      for (const key of ['thumb','display','full','width','height']) if (art.image[key] !== art.panels[0].image[key]) throw new Error(`${art.id} 的组图封面须使用第一幅图片。`);
    }
    if (art.section === 'series' && !art.panels) throw new Error(`${art.id} 缺少组图。`);
  }
  return data;
}
export function publishedArtworks(data) { return validateCatalog(data).artworks.filter(a => a.publish).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id)); }
export async function loadCatalog(base = './') {
  const response = await fetch(`${base}api/artworks.json`);
  if (!response.ok) throw new Error('展品资料暂时无法载入，请刷新后重试。');
  return validateCatalog(await response.json());
}
