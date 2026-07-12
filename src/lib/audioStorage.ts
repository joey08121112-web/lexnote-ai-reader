import { get, set, del, keys, createStore } from 'idb-keyval';
import type { AudioNote } from './audioNotes';

// 录音数据独立 store（独立 dbName，避免 idb-keyval 共享 db 时 schema 锁死）
const audioStore = createStore('lexnote-audio-notes', 'kv');

interface StoredAudioNote extends Omit<AudioNote, 'blobUrl'> {
  /** IndexedDB 中不存 blobUrl（每次加载时重新创建 URL） */
  blobUrl: '';
  /** 实际的录音 blob */
  blob: Blob;
}

/**
 * 保存录音笔记到 IndexedDB
 * （blobUrl 是 Memory URL，需要先 fetch 回 blob 再持久化）
 */
export async function saveAudioNote(note: AudioNote): Promise<void> {
  try {
    const resp = await fetch(note.blobUrl);
    const blob = await resp.blob();
    const stored: StoredAudioNote = {
      ...note,
      blobUrl: '',
      blob,
    };
    await set(note.id, stored, audioStore);
  } catch (e) {
    console.warn('[audioStorage] saveAudioNote failed:', e);
    throw e;
  }
}

/**
 * 加载某书某页的所有录音笔记（按时间倒序）
 * 返回的 blobUrl 是新创建的 Memory URL，调用方负责在卸载时 revoke
 */
export async function loadAudioNotes(
  bookId: string,
  pageNumber: number,
): Promise<AudioNote[]> {
  const allKeys = await keys(audioStore);
  const results: AudioNote[] = [];
  for (const k of allKeys) {
    const raw = (await get(k as string, audioStore)) as StoredAudioNote | undefined;
    if (raw && raw.bookId === bookId && raw.pageNumber === pageNumber) {
      const blobUrl = URL.createObjectURL(raw.blob);
      results.push({
        id: raw.id,
        bookId: raw.bookId,
        pageNumber: raw.pageNumber,
        blobUrl,
        duration: raw.duration,
        createdAt: raw.createdAt,
        strokes: raw.strokes || [],
        transcript: raw.transcript,
      });
    }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 删除录音笔记（同时清空 blob） */
export async function deleteAudioNote(id: string): Promise<void> {
  await del(id, audioStore);
}

/** 释放录音 blob URL（避免内存泄漏） */
export function revokeAudioNoteUrl(note: AudioNote): void {
  if (note.blobUrl) {
    try {
      URL.revokeObjectURL(note.blobUrl);
    } catch {
      /* ignore */
    }
  }
}
