// D4.4 贴纸库：内置 SVG 贴纸，点击插入到 tldraw 画布
import { useState } from 'react';
import { X, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Editor } from 'tldraw';
import { createShapesForAssets } from 'tldraw';

interface StickerLibraryProps {
  editor: Editor;
  onClose: () => void;
}

interface Sticker {
  id: string;
  name: string;
  category: '常用' | '表情' | '箭头' | '序号' | '符号';
  svg: string;
}

// 内联 SVG 贴纸（不依赖外部资源）
const STICKERS: Sticker[] = [
  // 常用
  { id: 'star', name: '星标', category: '常用', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F1C40F"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' },
  { id: 'heart', name: '心', category: '常用', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#E85D75"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' },
  { id: 'flag', name: '旗帜', category: '常用', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C0392B"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>' },
  // 表情
  { id: 'smile', name: '微笑', category: '表情', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#F1C40F"><circle cx="12" cy="12" r="10"/><circle cx="9" cy="10" r="1.5" fill="#4A3F35"/><circle cx="15" cy="10" r="1.5" fill="#4A3F35"/><path d="M8 14c1 1.5 2.5 2 4 2s3-.5 4-2" stroke="#4A3F35" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>' },
  { id: 'thumb', name: '赞', category: '表情', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2980B9"><path d="M7 22V11h-4v11h4zm14-13c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L12.17 1 6.59 9.59C6.22 9.96 6 10.46 6 11v9c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73V9z"/></svg>' },
  // 箭头
  { id: 'arrow-right', name: '右箭头', category: '箭头', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4A3F35"><path d="M4 11h12.17l-5.59-5.59L12 4l8 8-8 8-1.41-1.41L16.17 13H4z"/></svg>' },
  { id: 'arrow-curve', name: '曲箭头', category: '箭头', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4A3F35"><path d="M14 5l5 5-5 5v-3c-3 0-5 1-6 3-1-4 2-7 6-7V5z"/></svg>' },
  // 序号
  { id: 'no-1', name: '①', category: '序号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#D4A574"/><text x="12" y="16" text-anchor="middle" font-size="14" fill="white" font-weight="bold">1</text></svg>' },
  { id: 'no-2', name: '②', category: '序号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#D4A574"/><text x="12" y="16" text-anchor="middle" font-size="14" fill="white" font-weight="bold">2</text></svg>' },
  { id: 'no-3', name: '③', category: '序号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#D4A574"/><text x="12" y="16" text-anchor="middle" font-size="14" fill="white" font-weight="bold">3</text></svg>' },
  // 符号
  { id: 'check', name: '对号', category: '符号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#27AE60"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' },
  { id: 'cross', name: '叉号', category: '符号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C0392B"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>' },
  { id: 'question', name: '问号', category: '符号', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2980B9"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>' },
];

const CATEGORIES: Sticker['category'][] = ['常用', '表情', '箭头', '序号', '符号'];

/** SVG 字符串 → data URL（用于插入 tldraw 作为图片 asset） */
function svgToDataUrl(svg: string): string {
  // encodeURIComponent 处理 # 等特殊字符
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** 插入贴纸到画布中心 */
async function insertSticker(editor: Editor, sticker: Sticker) {
  try {
    const dataUrl = svgToDataUrl(sticker.svg);
    // 通过 fetch data URL 获取 Blob，再用 getAssetForExternalContent 创建 asset
    const resp = await fetch(dataUrl);
    const blob = await resp.blob();
    const file = new File([blob], `${sticker.id}.svg`, { type: 'image/svg+xml' });
    const asset = await editor.getAssetForExternalContent({ type: 'file', file });
    if (asset) {
      const center = editor.getViewportPageBounds().center;
      await createShapesForAssets(editor, [asset], center);
    }
  } catch (e) {
    console.warn('[StickerLibrary] insert failed:', e);
    alert('插入贴纸失败：' + (e as Error).message);
  }
}

export default function StickerLibrary({ editor, onClose }: StickerLibraryProps) {
  const [activeCategory, setActiveCategory] = useState<Sticker['category']>('常用');
  const [search, setSearch] = useState('');

  const filtered = STICKERS.filter((s) => {
    const matchCat = search ? true : s.category === activeCategory;
    const matchSearch = !search || s.name.includes(search) || s.id.includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 w-80 bg-white rounded-xl shadow-2xl border border-[#E8E4DE] overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#E8E4DE] bg-[#FAF8F5]">
        <h3 className="text-sm font-medium text-[#4A3F35]">贴纸库</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-[#E8E4DE]">
          <X className="w-4 h-4 text-[#6B5E54]" />
        </button>
      </div>
      {/* 搜索 */}
      <div className="px-3 py-2 border-b border-[#E8E4DE]">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9B8E84]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索贴纸..."
            className="w-full pl-7 pr-2 py-1 text-sm rounded border border-[#E8E4DE] focus:outline-none focus:border-[#D4A574]"
          />
        </div>
      </div>
      {/* 分类 tab */}
      {!search && (
        <div className="flex border-b border-[#E8E4DE]">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'flex-1 py-2 text-xs',
                activeCategory === cat
                  ? 'text-[#D4A574] border-b-2 border-[#D4A574] font-medium'
                  : 'text-[#6B5E54] hover:bg-[#FAF8F5]',
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
      {/* 贴纸网格 */}
      <div className="p-3 grid grid-cols-5 gap-2 max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="col-span-5 text-center py-6 text-xs text-[#9B8E84]">
            未找到贴纸
          </div>
        ) : (
          filtered.map((sticker) => (
            <button
              key={sticker.id}
              onClick={() => insertSticker(editor, sticker)}
              title={sticker.name}
              className="aspect-square flex items-center justify-center rounded-lg border border-[#E8E4DE] hover:border-[#D4A574] hover:bg-[#FAF8F5] transition-colors"
              dangerouslySetInnerHTML={{
                __html: sticker.svg.replace('<svg ', '<svg width="32" height="32" '),
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}
