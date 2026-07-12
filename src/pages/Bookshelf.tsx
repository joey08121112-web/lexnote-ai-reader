import { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Upload,
  Grid,
  List,
  Settings,
  NotebookPen,
  Sparkles,
  Search,
  Folder as FolderIcon,
  FolderPlus,
  Star,
  Clock,
  MoreVertical,
  Trash2,
  FolderInput,
  X,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useBookStore } from '@/stores/bookStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { cn } from '@/lib/utils';
import { processFile } from '@/lib/fileProcessor';
import type { Book, Folder } from '@/types/book';

type ViewSection = 'all' | 'recent' | 'favorite' | 'folder';

interface BookFilter {
  section: ViewSection;
  folderId?: string | null;
  query?: string;
}

export default function Bookshelf() {
  const navigate = useNavigate();
  const { books, folders, toggleFavorite, moveBookToFolder, removeBook, updateLastOpened } = useBookStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showImportModal, setShowImportModal] = useState(false);
  const [filter, setFilter] = useState<BookFilter>({ section: 'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    bookId: string;
    x: number;
    y: number;
  } | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);

  // 过滤书籍
  const filteredBooks = useMemo(() => {
    let list = [...books];
    // 搜索过滤
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.author && b.author.toLowerCase().includes(q)),
      );
    }
    // section 过滤
    if (filter.section === 'recent') {
      list = list
        .filter((b) => b.lastOpenedAt)
        .sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''))
        .slice(0, 20);
    } else if (filter.section === 'favorite') {
      list = list.filter((b) => b.isFavorite);
    } else if (filter.section === 'folder' && filter.folderId != null) {
      list = list.filter((b) => b.folderId === filter.folderId);
    } else if (filter.section === 'all') {
      // 全部文档：不按文件夹过滤（显示所有书）
    }
    return list;
  }, [books, filter, searchQuery]);

  // 构建文件夹树
  const folderTree = useMemo<FolderTreeNode[]>(() => {
    const buildTree = (parentId: string | null): FolderTreeNode[] => {
      return folders
        .filter((f) => f.parentId === parentId)
        .map((f) => ({ ...f, children: buildTree(f.id) }));
    };
    return buildTree(null);
  }, [folders]);

  const handleOpenBook = (bookId: string) => {
    updateLastOpened(bookId);
    navigate(`/reader/${bookId}`);
  };

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, bookId: string) => {
    e.preventDefault();
    setContextMenu({ bookId, x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  return (
    <div className="min-h-screen bg-[#FAF8F5]" onClick={closeContextMenu}>
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-[#E8E4DE]">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-[#D4A574]" />
            <h1 className="text-2xl font-bold text-[#4A3F35]">Lexnote</h1>
          </div>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/solver')} className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              AI 解题
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/vocabulary')} className="flex items-center gap-2">
              <NotebookPen className="w-4 h-4" />
              生词本
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/settings')} className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              设置
            </Button>
          </nav>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 flex gap-6">
        {/* 左侧侧栏 */}
        <aside className="w-56 flex-shrink-0">
          <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DE] p-3 sticky top-24">
            {/* 搜索框 */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9B8E84]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索书籍..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#FAF8F5] text-sm text-[#4A3F35] focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#D4A574]"
              />
            </div>

            {/* 视图切换 */}
            <nav className="space-y-1 mb-4">
              <SidebarItem
                icon={<BookOpen className="w-4 h-4" />}
                label="全部文档"
                active={filter.section === 'all'}
                onClick={() => setFilter({ section: 'all' })}
              />
              <SidebarItem
                icon={<Clock className="w-4 h-4" />}
                label="最近"
                active={filter.section === 'recent'}
                onClick={() => setFilter({ section: 'recent' })}
              />
              <SidebarItem
                icon={<Star className="w-4 h-4" />}
                label="收藏"
                active={filter.section === 'favorite'}
                onClick={() => setFilter({ section: 'favorite' })}
              />
            </nav>

            {/* 文件夹区 */}
            <div className="pt-3 border-t border-[#E8E4DE]">
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-medium text-[#9B8E84] uppercase tracking-wider">文件夹</span>
                <button
                  onClick={() => setShowFolderModal(true)}
                  className="text-[#9B8E84] hover:text-[#4A3F35]"
                  title="新建文件夹"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-0.5">
                {folderTree.length === 0 ? (
                  <p className="text-xs text-[#9B8E84] px-2 py-1">暂无文件夹</p>
                ) : (
                  folderTree.map((folder) => (
                    <FolderTreeItem
                      key={folder.id}
                      folder={folder}
                      depth={0}
                      collapsed={collapsedFolders}
                      onToggle={toggleFolder}
                      activeFolderId={filter.section === 'folder' ? filter.folderId : null}
                      onSelect={(id) => setFilter({ section: 'folder', folderId: id })}
                      onRename={(f) => setRenamingFolder(f)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 min-w-0">
          {/* 操作栏 */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-[#4A3F35]">
              {filter.section === 'all' && '全部文档'}
              {filter.section === 'recent' && '最近打开'}
              {filter.section === 'favorite' && '收藏'}
              {filter.section === 'folder' && folders.find((f) => f.id === filter.folderId)?.name}
              <span className="ml-2 text-sm text-[#9B8E84] font-normal">{filteredBooks.length} 本</span>
            </h2>
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={() => setShowImportModal(true)} className="flex items-center gap-2">
                <Upload className="w-4 h-4" />
                导入
              </Button>
              <div className="flex items-center gap-2 bg-[#E8E4DE] rounded-xl p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn('p-2 rounded-lg transition-colors', viewMode === 'grid' ? 'bg-[#D4A574] text-white' : 'text-[#6B5E54]')}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn('p-2 rounded-lg transition-colors', viewMode === 'list' ? 'bg-[#D4A574] text-white' : 'text-[#6B5E54]')}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 书籍展示 */}
          {filteredBooks.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DE] py-16 text-center">
              <BookOpen className="w-12 h-12 text-[#9B8E84] mx-auto mb-3 opacity-50" />
              <p className="text-[#9B8E84]">
                {searchQuery ? '没有找到匹配的书籍' : '这里还没有书籍'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {filteredBooks.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onClick={() => handleOpenBook(book.id)}
                  onContextMenu={(e) => handleContextMenu(e, book.id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBooks.map((book) => (
                <BookListItem
                  key={book.id}
                  book={book}
                  onClick={() => handleOpenBook(book.id)}
                  onContextMenu={(e) => handleContextMenu(e, book.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <BookContextMenu
          bookId={contextMenu.bookId}
          x={contextMenu.x}
          y={contextMenu.y}
          folders={folders}
          onToggleFavorite={(id) => {
            toggleFavorite(id);
            closeContextMenu();
          }}
          onMoveToFolder={(id, folderId) => {
            moveBookToFolder(id, folderId);
            closeContextMenu();
          }}
          onDelete={(id) => {
            if (confirm('确定删除这本书？该操作不可恢复。')) {
              removeBook(id);
            }
            closeContextMenu();
          }}
          onClose={closeContextMenu}
        />
      )}

      {/* 导入弹窗 */}
      <ImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />

      {/* 新建/重命名文件夹弹窗 */}
      <FolderModal
        isOpen={showFolderModal || renamingFolder !== null}
        folder={renamingFolder}
        onClose={() => {
          setShowFolderModal(false);
          setRenamingFolder(null);
        }}
      />
    </div>
  );
}

// ==== 侧栏子组件 ====
function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
        active ? 'bg-[#D4A574]/10 text-[#D4A574] font-medium' : 'text-[#6B5E54] hover:bg-[#FAF8F5]'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

type FolderTreeNode = Folder & { children: FolderTreeNode[] };

function FolderTreeItem({
  folder,
  depth,
  collapsed,
  onToggle,
  activeFolderId,
  onSelect,
  onRename,
}: {
  folder: FolderTreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  activeFolderId: string | null;
  onSelect: (id: string) => void;
  onRename: (folder: Folder) => void;
}) {
  const isCollapsed = collapsed.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const isActive = activeFolderId === folder.id;
  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer text-sm',
          isActive ? 'bg-[#D4A574]/10 text-[#D4A574]' : 'text-[#6B5E54] hover:bg-[#FAF8F5]'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(folder.id)}
        onDoubleClick={() => onRename(folder)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(folder.id);
            }}
            className="p-0.5 hover:bg-[#E8E4DE] rounded"
          >
            {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <FolderIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate flex-1">{folder.name}</span>
      </div>
      {!isCollapsed &&
        folder.children.map((child) => (
          <FolderTreeItem
            key={child.id}
            folder={child}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            activeFolderId={activeFolderId}
            onSelect={onSelect}
            onRename={onRename}
          />
        ))}
    </div>
  );
}

// ==== 书籍卡片 ====
function BookCard({
  book,
  onClick,
  onContextMenu,
}: {
  book: Book;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const progress = book.totalPages ? (book.lastReadPage / book.totalPages) * 100 : 0;
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="group cursor-pointer bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden relative"
    >
      {book.isFavorite && (
        <Star className="absolute top-2 right-2 w-4 h-4 text-[#D4A574] fill-[#D4A574] z-10" />
      )}
      <div className="relative aspect-[3/4] overflow-hidden">
        {book.coverImage ? (
          <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full bg-[#E8E4DE] flex items-center justify-center">
            <BookOpen className="w-16 h-16 text-[#6B5E54]" />
          </div>
        )}
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#E8E4DE]">
            <div className="h-full bg-[#D4A574]" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-[#4A3F35] truncate">{book.title}</h3>
        {book.author && <p className="text-sm text-[#6B5E54] truncate">{book.author}</p>}
        <p className="text-xs text-[#9B8E84] mt-1">
          {book.fileType.toUpperCase()} · {book.totalPages ? `${book.lastReadPage}/${book.totalPages}页` : `${book.lastReadPage}页`}
        </p>
      </div>
    </div>
  );
}

function BookListItem({
  book,
  onClick,
  onContextMenu,
}: {
  book: Book;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const progress = book.totalPages ? (book.lastReadPage / book.totalPages) * 100 : 0;
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="group cursor-pointer bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-4 flex items-center gap-4"
    >
      <div className="w-16 h-20 rounded-lg overflow-hidden flex-shrink-0">
        {book.coverImage ? (
          <img src={book.coverImage} alt={book.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#E8E4DE] flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-[#6B5E54]" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-[#4A3F35] truncate">{book.title}</h3>
          {book.isFavorite && <Star className="w-3.5 h-3.5 text-[#D4A574] fill-[#D4A574] flex-shrink-0" />}
        </div>
        {book.author && <p className="text-sm text-[#6B5E54] truncate">{book.author}</p>}
        <div className="flex items-center gap-4 mt-2">
          <span className="text-xs text-[#9B8E84]">{book.fileType.toUpperCase()}</span>
          <div className="flex-1 h-1 bg-[#E8E4DE] rounded-full max-w-[200px]">
            <div className="h-full bg-[#D4A574] rounded-full" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-[#9B8E84]">
            {book.totalPages ? `${book.lastReadPage}/${book.totalPages}` : `${book.lastReadPage}页`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ==== 右键菜单 ====
function BookContextMenu({
  bookId,
  x,
  y,
  folders,
  onToggleFavorite,
  onMoveToFolder,
  onDelete,
  onClose,
}: {
  bookId: string;
  x: number;
  y: number;
  folders: Folder[];
  onToggleFavorite: (id: string) => void;
  onMoveToFolder: (id: string, folderId: string | null) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const { books } = useBookStore();
  const book = books.find((b) => b.id === bookId);
  const [showFolderMenu, setShowFolderMenu] = useState(false);
  if (!book) return null;

  // 防止超出视口
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 240);

  return (
    <>
      <div className="fixed inset-0 z-[80]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="fixed z-[81] bg-white rounded-xl shadow-2xl border border-[#E8E4DE] py-1 min-w-[200px]"
        style={{ left: adjustedX, top: adjustedY }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onToggleFavorite(bookId)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#4A3F35] hover:bg-[#FAF8F5]"
        >
          <Star className={cn('w-4 h-4', book.isFavorite && 'fill-[#D4A574] text-[#D4A574]')} />
          {book.isFavorite ? '取消收藏' : '收藏'}
        </button>

        {/* 移动到文件夹 */}
        <div className="relative" onMouseEnter={() => setShowFolderMenu(true)} onMouseLeave={() => setShowFolderMenu(false)}>
          <button className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-[#4A3F35] hover:bg-[#FAF8F5]">
            <span className="flex items-center gap-2">
              <FolderInput className="w-4 h-4" />
              移动到...
            </span>
            <ChevronRight className="w-3 h-3" />
          </button>
          {showFolderMenu && (
            <div className="absolute left-full top-0 ml-1 bg-white rounded-xl shadow-2xl border border-[#E8E4DE] py-1 min-w-[180px]">
              <button
                onClick={() => onMoveToFolder(bookId, null)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#FAF8F5]',
                  !book.folderId ? 'text-[#D4A574] font-medium' : 'text-[#4A3F35]'
                )}
              >
                <BookOpen className="w-4 h-4" />
                根目录
              </button>
              {folders.length === 0 ? (
                <p className="px-3 py-2 text-xs text-[#9B8E84]">暂无文件夹</p>
              ) : (
                folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onMoveToFolder(bookId, f.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-[#FAF8F5]',
                      book.folderId === f.id ? 'text-[#D4A574] font-medium' : 'text-[#4A3F35]'
                    )}
                  >
                    <FolderIcon className="w-4 h-4" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="my-1 border-t border-[#E8E4DE]" />
        <button
          onClick={() => onDelete(bookId)}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#E85D75] hover:bg-[#FEF2F2]"
        >
          <Trash2 className="w-4 h-4" />
          删除
        </button>
      </div>
    </>
  );
}

// ==== 文件夹新建/重命名弹窗 ====
function FolderModal({
  isOpen,
  folder,
  onClose,
}: {
  isOpen: boolean;
  folder: Folder | null;
  onClose: () => void;
}) {
  const { addFolder, renameFolder, deleteFolder } = useBookStore();
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次打开重置
  useMemo(() => {
    if (isOpen) {
      setName(folder?.name || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, folder]);

  if (!isOpen) return null;

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (folder) {
      renameFolder(folder.id, trimmed);
    } else {
      addFolder(trimmed);
    }
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={folder ? '重命名文件夹' : '新建文件夹'} className="max-w-sm">
      <div className="space-y-3">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="文件夹名称"
          className="w-full px-3 py-2 rounded-lg border border-[#E8E4DE] focus:outline-none focus:border-[#D4A574] text-sm"
        />
        {folder && (
          <button
            onClick={() => {
              if (confirm('删除此文件夹？文件夹内的书籍将移到根目录。')) {
                deleteFolder(folder.id);
                onClose();
              }
            }}
            className="text-sm text-[#E85D75] hover:underline"
          >
            删除此文件夹
          </button>
        )}
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          取消
        </Button>
        <Button className="flex-1" onClick={handleSubmit} disabled={!name.trim()}>
          {folder ? '保存' : '创建'}
        </Button>
      </div>
    </Modal>
  );
}

// ==== 导入弹窗（保持原逻辑） ====
function ImportModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [dragActive, setDragActive] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [statusText, setStatusText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addBook } = useBookStore();
  const navigate = useNavigate();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleFile = async (file: File) => {
    setError('');
    setImporting(true);
    setStatusText('');

    const ext = file.name.split('.').pop()?.toLowerCase();
    const supportedExts = ['txt', 'pdf', 'epub', 'docx', 'doc', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'];
    if (!supportedExts.includes(ext || '')) {
      setError('不支持的格式，请上传 TXT/PDF/EPUB/Word/PPT/图片');
      setImporting(false);
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setError('文件大小超过 100MB 限制');
      setImporting(false);
      return;
    }

    try {
      if (ext === 'docx' || ext === 'doc') setStatusText('正在转换 Word 为 PDF...');
      else if (ext === 'ppt' || ext === 'pptx') setStatusText('正在转换 PPT 为 PDF...');
      else if (ext === 'pdf') setStatusText('正在解析 PDF...');
      else if (ext === 'epub') setStatusText('正在解析 EPUB...');
      else if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(ext || '')) setStatusText('正在导入图片...');
      else setStatusText('正在转换为 PDF...');

      const result = await processFile(file);
      if (result.error || !result.book) {
        setError(result.error || '导入失败');
        setImporting(false);
        setStatusText('');
        return;
      }
      addBook(result.book);
      setImporting(false);
      setStatusText('');
      onClose();
      navigate(`/reader/${result.book.id}`);
    } catch (e) {
      setError('导入失败: ' + (e as Error).message);
      setImporting(false);
      setStatusText('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleFile(files[0]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="导入书籍" className="max-w-md">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.pdf,.epub,.docx,.doc,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.bmp,.webp"
        onChange={handleFileSelect}
        className="hidden"
      />
      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => !importing && fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
          dragActive ? 'border-[#D4A574] bg-[#D4A574]/10' : 'border-[#E8E4DE] hover:border-[#D4A574]/50',
          importing && 'opacity-50 pointer-events-none'
        )}
      >
        <Upload className="w-12 h-12 text-[#6B5E54] mx-auto mb-4" />
        {importing ? (
          <p className="text-[#D4A574] mb-2 animate-pulse">{statusText || '正在导入...'}</p>
        ) : (
          <p className="text-[#4A3F35] mb-2">拖拽文件到这里，或点击选择</p>
        )}
        <p className="text-sm text-[#9B8E84]">支持 PDF、EPUB、TXT、Word、PPT、图片</p>
      </div>
      {error && <p className="text-sm text-[#E85D75] mt-3 text-center">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          选择本地文件
        </Button>
        <Button variant="secondary" className="flex-1 opacity-50 cursor-not-allowed" disabled>
          从云盘导入
        </Button>
      </div>
      <p className="text-xs text-[#9B8E84] mt-4 text-center">
        最大 100MB · Word/PPT 需后端转换服务（否则 Word 降级为文本提取）
      </p>
    </Modal>
  );
}
