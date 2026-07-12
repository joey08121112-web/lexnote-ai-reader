/**
 * D3.1 PDF 大纲（书签目录）提取
 *
 * 用 pdfjsLib.getDocument().getOutline() 提取目录树，
 * 递归解析每个节点的 dest 为页码。
 */
import * as pdfjsLib from 'pdfjs-dist';

export interface OutlineNode {
  title: string;
  pageNumber: number;
  children: OutlineNode[];
}

/** pdfjs getOutline 返回的原始节点结构 */
interface RawOutlineItem {
  title: string;
  dest: string | Array<unknown> | null;
  items: RawOutlineItem[];
}

/** 提取 PDF 大纲（书签目录），无大纲返回空数组 */
export async function getPdfOutline(pdfBlob: Blob): Promise<OutlineNode[]> {
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const rawOutline = (await pdf.getOutline()) as RawOutlineItem[] | null;
  if (!rawOutline || rawOutline.length === 0) {
    await loadingTask.destroy();
    return [];
  }

  const resolveNode = async (item: RawOutlineItem): Promise<OutlineNode> => {
    let pageNumber = 1;
    try {
      const dest = item.dest;
      let resolvedDest: Array<unknown> | null = null;
      if (typeof dest === 'string') {
        // named dest，需解析为 ref 数组
        resolvedDest = await pdf.getDestination(dest);
      } else if (Array.isArray(dest)) {
        resolvedDest = dest;
      }
      if (resolvedDest && resolvedDest[0]) {
        // dest[0] 是页面 ref（{ num, gen }）
        const ref = resolvedDest[0] as { num: number; gen: number };
        const pageIndex = await pdf.getPageIndex(ref);
        pageNumber = pageIndex + 1;
      }
    } catch {
      // dest 解析失败，默认第 1 页
    }
    const children: OutlineNode[] = [];
    if (item.items && item.items.length > 0) {
      for (const child of item.items) {
        children.push(await resolveNode(child));
      }
    }
    return { title: item.title || '(无标题)', pageNumber, children };
  };

  const nodes: OutlineNode[] = [];
  for (const item of rawOutline) {
    nodes.push(await resolveNode(item));
  }
  await loadingTask.destroy();
  return nodes;
}
