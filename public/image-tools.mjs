/** Convert a user-selected image into bounded, proportional WebP variants. */
export async function makeVariants(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 20*1024*1024) throw new Error('请选择 20 MB 以内的 JPG、PNG 或 WebP 图片。');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width*bitmap.height > 60000000 || bitmap.width > 20000 || bitmap.height > 20000) throw new Error('图片尺寸过大，请先缩小到长边 20000 像素以内。');
    const variants = {};
    for (const [kind,size,quality] of [['thumb',640,.82],['display',1600,.88],['full',2800,.92]]) {
      const ratio = Math.min(1,size/Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(bitmap.width*ratio)); canvas.height = Math.max(1,Math.round(bitmap.height*ratio));
      const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      variants[kind] = await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
      if (!variants[kind] || variants[kind].type !== 'image/webp') throw new Error('当前浏览器不支持 WebP 导出，请使用新版 Chrome、Edge 或 Safari。');
    }
    return {variants,width:bitmap.width,height:bitmap.height,filename:file.name};
  } finally { bitmap.close(); }
}
