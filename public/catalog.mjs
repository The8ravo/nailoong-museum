export const SECTIONS = { exhibition: '名画重演', lab: '风格实验室', poster: '序厅海报' };
export const safeAsset = value => typeof value === 'string' && /^assets\/(?:artworks|uploads)\/[a-z0-9][a-z0-9._/-]*\.(?:webp|png|jpe?g)$/i.test(value) && !value.split('/').includes('..');
export function safeUrl(value) {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function validateCatalog(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.artworks)) throw new Error('展品文件格式不正确，需要 schemaVersion: 1 和 artworks 列表。');
  const ids = new Set(), slugs = new Set();
  for (const art of data.artworks) {
    if (!art || typeof art !== 'object') throw new Error('展品记录必须是对象。');
    if (!/^[A-Z0-9][A-Z0-9-]{1,49}$/.test(art.id || '') || ids.has(art.id)) throw new Error(`展品编号无效或重复：${art.id}`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(art.slug || '') || art.slug.length > 80 || slugs.has(art.slug)) throw new Error(`网址名称无效或重复：${art.slug}`);
    ids.add(art.id); slugs.add(art.slug);
    for (const key of ['title','titleEn','description','alt','notes','medium','tag']) {
      if (typeof art[key] !== 'string' || (['title','description','alt'].includes(key) && !art[key].trim()) || art[key].length > 10000) throw new Error(`${art.id} 的 ${key} 无效。`);
    }
    if (!Object.hasOwn(SECTIONS, art.section) || !Number.isFinite(art.order) || typeof art.publish !== 'boolean') throw new Error(`${art.id} 的展区、顺序或发布状态无效。`);
    if (!art.image || !Number.isInteger(art.image.width) || !Number.isInteger(art.image.height) || art.image.width < 1 || art.image.height < 1 || art.image.width > 20000 || art.image.height > 20000) throw new Error(`${art.id} 的图片尺寸无效。`);
    for (const key of ['thumb','display','full']) if (!safeAsset(art.image[key])) throw new Error(`${art.id} 的图片路径无效。`);
    if (!art.reference || typeof art.reference.title !== 'string' || !safeUrl(art.reference.url) || typeof art.reference.note !== 'string') throw new Error(`${art.id} 的参考作品信息无效。`);
    if (!art.source || typeof art.source.filename !== 'string' || typeof art.source.origin !== 'string' || typeof art.source.rightsStatus !== 'string') throw new Error(`${art.id} 的来源信息无效。`);
  }
  return data;
}
export function publishedArtworks(data) { return validateCatalog(data).artworks.filter(a => a.publish).sort((a,b) => a.order - b.order || a.id.localeCompare(b.id)); }
export async function loadCatalog(base = './') {
  const response = await fetch(`${base}api/artworks.json`);
  if (!response.ok) throw new Error('展品资料暂时无法载入，请刷新后重试。');
  return validateCatalog(await response.json());
}
