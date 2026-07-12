export interface Book {
  id: string;
  title: string;
  author?: string;
  fileType: 'pdf' | 'epub' | 'txt' | 'docx' | 'pptx' | 'image';
  storageType: 'text' | 'pdf-blob' | 'epub-blob';
  coverImage?: string;
  content?: string;
  addedDate: Date;
  lastReadPage: number;
  totalPages?: number;
  // C3 文档管理新增字段
  /** 所属文件夹 ID（null 或 undefined = 根目录） */
  folderId?: string | null;
  /** 是否收藏 */
  isFavorite?: boolean;
  /** 最近打开时间（ISO 字符串），用于「最近」列表排序 */
  lastOpenedAt?: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink';
  pageNumber: number;
  note?: string;
  createdAt: Date;
}

export interface Bookmark {
  id: string;
  bookId: string;
  pageNumber: number;
  title: string;
  createdAt: Date;
}

/** C3 文档管理：文件夹 */
export interface Folder {
  id: string;
  name: string;
  /** 父文件夹 ID（null = 根目录） */
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}