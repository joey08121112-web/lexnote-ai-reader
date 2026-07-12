import { create } from 'zustand';
import { Book, Highlight, Bookmark, Folder } from '@/types/book';
import { deleteBookData } from '@/lib/storage';

interface BookState {
  books: Book[];
  highlights: Highlight[];
  bookmarks: Bookmark[];
  currentBook: Book | null;
  folders: Folder[];
  addBook: (book: Book) => void;
  removeBook: (id: string) => void;
  setCurrentBook: (book: Book | null) => void;
  addHighlight: (highlight: Highlight) => void;
  removeHighlight: (id: string) => void;
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (id: string) => void;
  updateLastReadPage: (bookId: string, page: number) => void;
  // C3 文档管理 actions
  addFolder: (name: string, parentId?: string | null) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  moveBookToFolder: (bookId: string, folderId: string | null) => void;
  toggleFavorite: (bookId: string) => void;
  updateLastOpened: (bookId: string) => void;
}

// 每页段落数（与 Reader.tsx BookContent 的 parasPerPage 保持一致）
const PARAS_PER_PAGE = 8;

/** 根据内容计算真实总页数 */
function calcTotalPages(content: string): number {
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());
  return Math.max(1, Math.ceil(paragraphs.length / PARAS_PER_PAGE));
}

// 示例书籍内容（真实的英文原文，可点词翻译）
const csappContent = `A Tour of Computer Systems

A computer system consists of hardware and systems software that work together to run application programs. Information is bits plus context. All information in a system is represented as bits, including disk files, memory programs, and data transmitted over networks.

Programmers need to understand how computer systems work because it helps them write more efficient and reliable programs. For example, understanding the memory hierarchy can help programmers optimize data access patterns, thereby improving program performance.

A system is more than just hardware. It includes the operating system, compilers, linkers, and other software components. These components together form a complete computing environment that provides runtime support for applications. Understanding how these components work can help programmers debug programs, optimize performance, and handle security issues.

Concurrency and parallelism have become important themes in modern computer systems. Multicore processors make parallel computing possible, while the process and thread mechanisms provided by the operating system support concurrent execution. Programmers need to understand these concepts to write correct and efficient multithreaded programs.

Network communication is another important aspect of modern computer systems. The Internet connects computers around the world, allowing information to be transmitted instantly. Understanding how network protocols such as TCP and IP work can help programmers develop distributed systems and network applications.

Memory hierarchy is a fundamental concept that every programmer should understand. Modern computer systems use multiple levels of storage, from fast but small CPU registers to slow but large disk drives. Cache memory sits between the CPU and main memory, providing faster access to frequently used data.

The operating system acts as a bridge between hardware and applications. It manages memory allocation, process scheduling, and file systems. When a program runs, the operating system loads it into memory, allocates a process ID, and schedules CPU time for its execution.

Virtual memory is a powerful abstraction that allows programs to use more memory than is physically available. The operating system maps virtual addresses to physical addresses through page tables, enabling efficient memory utilization and process isolation.

Compilers translate high-level programming languages into machine code that the processor can execute directly. Understanding how compilers work, including lexical analysis, parsing, and code optimization, helps programmers write code that performs better.

Linkers combine multiple object files into a single executable program. They resolve symbolic references between modules, relocate code and data sections, and produce the final binary that can be loaded into memory and executed.`;

const sapiensContent = `An Animal of No Significance

About 13.5 billion years ago, matter, energy, time, and space came into being in what is known as the Big Bang. The story of these fundamental features of our universe is called physics. About 300,000 years after they appeared, matter and energy started to coalesce into complex structures, called atoms, which then combined into molecules.

Some 70,000 years ago, organisms belonging to the species Homo sapiens started to form even more elaborate structures called cultures. The subsequent development of these human cultures is what we call history.

Three important revolutions shaped the course of history. The Cognitive Revolution kicked off history about 70,000 years ago. The Agricultural Revolution sped it up about 12,000 years ago. The Scientific Revolution, which got under way only 500 years ago, may well end history and start something completely different.

Humans were an insignificant animal with a small footprint on the African savanna. They were not particularly strong, fast, or agile. They did not have particularly sharp teeth or claws. But they had a unique ability to cooperate flexibly in large numbers.

The appearance of new species and the extinction of old ones is a common phenomenon in the history of life. Humans have driven numerous species to extinction, sometimes intentionally and sometimes as a side effect of our expansion.

The Agricultural Revolution was history's biggest fraud. Wheat domesticated humans rather than the other way around. The lives of farmers were generally harder and less fulfilling than those of foragers, yet the population grew because farming could support more people per square kilometer.

The Scientific Revolution gave humankind unprecedented power. Ignoramus, meaning we do not know, became the driving force behind modern science. The admission of ignorance led to systematic investigation, which in turn led to discoveries that transformed the world.

Capitalism and science are intertwined. The belief in growth, fueled by credit and investment, has driven both economic expansion and scientific discovery. This combination has given modern humans power that previous generations could only dream of.

The unification of humankind has been a gradual process. Over the centuries, disparate cultures have merged into larger and larger political entities. Today, we live in a global civilization where information, goods, and people move freely across borders.

Biology enables, culture forbids. Biology determines what is possible for humans, but culture determines what is acceptable. The norms and values that societies adopt shape the behavior of individuals and the trajectory of entire civilizations.`;

const englishReadingContent = `The Importance of Reading Habits

Reading is one of the most valuable habits a person can develop. It opens doors to new worlds, expands our knowledge, and sharpens our critical thinking skills. In an age dominated by short videos and social media, the practice of reading has become more important than ever.

Research shows that regular reading improves vocabulary, enhances empathy, and even reduces stress. When we read a novel, we step into the shoes of characters from different backgrounds, which helps us understand perspectives we might never encounter in our daily lives.

Many successful people attribute their achievements to a lifelong reading habit. Bill Gates reads about fifty books a year, while Mark Zuckerberg sets a personal goal to read a book every two weeks. These leaders understand that books are condensed wisdom from the brightest minds.

To build a reading habit, start small. Read for just fifteen minutes a day, preferably in the morning when your mind is fresh. Choose topics that genuinely interest you, whether it is science fiction, biography, or self-improvement. Over time, you will find yourself looking forward to these quiet moments with a book.

Active reading is more effective than passive reading. This means engaging with the text by asking questions, making notes, and summarizing key points in your own words. Active readers retain more information and develop deeper understanding of the material.

Reading widely across genres broadens your perspective. Non-fiction books provide factual knowledge about the world, while fiction develops emotional intelligence and creativity. Poetry teaches precision of language, and biographies offer role models and life lessons.

The benefits of reading extend beyond knowledge. Studies have shown that reading can slow cognitive decline in older adults, improve sleep quality, and increase emotional stability. A good book can transport you to another world, providing a mental break from daily stress.

In the digital age, the way we read is changing. E-books and audiobooks make literature more accessible than ever. However, research suggests that reading on screens may reduce comprehension and retention compared to reading physical books. The tactile experience of turning pages also helps with memory formation.

Speed reading techniques, such as chunking words and reducing subvocalization, can help you read faster. However, speed should not come at the expense of understanding. The goal of reading is not just to finish the book, but to absorb and reflect on its ideas.

Making reading a social activity can boost motivation. Join a book club, share recommendations with friends, or participate in online reading communities. Discussing what you read helps solidify your understanding and exposes you to different interpretations.`;

const algorithmsContent = `The Role of Algorithms in Computing

An algorithm is any well-defined computational procedure that takes some value, or set of values, as input and produces some value, or set of values, as output. An algorithm is thus a sequence of computational steps that transform the input into the output.

Algorithms are the heart of computer science. The term algorithm is derived from the name of the Persian mathematician Al-Khwarizmi, who wrote a treatise on calculations in the ninth century. His work laid the foundation for modern algebra and introduced systematic methods for solving equations.

Sorting is one of the most fundamental problems in computer science. Given a sequence of n numbers, the sorting problem is to find a permutation of the input sequence such that the numbers appear in non-decreasing order. Many algorithms have been developed for sorting, including insertion sort, merge sort, and quicksort.

The efficiency of an algorithm is typically measured by its time complexity, which describes how the running time grows as the input size increases. An algorithm with linear time complexity runs in time proportional to the input size, while an algorithm with quadratic time complexity runs in time proportional to the square of the input size. Understanding these differences is crucial for designing efficient software.

Insertion sort works by building a sorted portion of the array one element at a time. For each new element, it finds the correct position in the sorted portion and inserts it there. While simple to implement, insertion sort has quadratic time complexity in the worst case, making it inefficient for large datasets.

Merge sort uses a divide-and-conquer strategy. It recursively divides the array into two halves, sorts each half, and then merges the sorted halves back together. Merge sort guarantees a time complexity of O(n log n) in all cases, making it reliable for large datasets.

Quicksort is another divide-and-conquer algorithm, but it partitions the array around a pivot element. Elements smaller than the pivot go to the left, and elements larger go to the right. The average time complexity is O(n log n), but the worst case is quadratic if the pivot is poorly chosen.

Binary search is an efficient algorithm for finding an element in a sorted array. It works by repeatedly dividing the search interval in half. If the target value is less than the middle element, the search continues in the left half. This gives a time complexity of O(log n).

Graph algorithms solve problems involving networks of connected nodes. Breadth-first search explores all neighbors at the current depth before moving to the next level. Depth-first search explores as far as possible along each branch before backtracking. Both have time complexity of O(V + E).

Dynamic programming solves problems by breaking them into overlapping subproblems and storing the results to avoid redundant computation. It is particularly useful for optimization problems, such as finding the shortest path in a graph or the longest common subsequence between two strings.`;

// 示例书籍数据（用户导入的书籍会追加在这些之后）
const sampleBooks: Book[] = [
  {
    id: '1',
    title: '深入理解计算机系统',
    author: 'Randal E. Bryant',
    fileType: 'pdf',
    storageType: 'text',
    content: csappContent,
    coverImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=A%20technical%20computer%20science%20book%20cover%20with%20blue%20circuits%20and%20binary%20code%20patterns%2C%20modern%20design%2C%20professional%20academic%20style&image_size=square',
    addedDate: new Date('2024-01-01'),
    lastReadPage: 1,
    totalPages: calcTotalPages(csappContent),
  },
  {
    id: '2',
    title: '人类简史',
    author: '尤瓦尔·赫拉利',
    fileType: 'epub',
    storageType: 'text',
    content: sapiensContent,
    coverImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=A%20history%20book%20cover%20with%20ancient%20cave%20paintings%20and%20modern%20city%20silhouette%2C%20warm%20earth%20tones%2C%20thoughtful%20design&image_size=square',
    addedDate: new Date('2024-02-15'),
    lastReadPage: 1,
    totalPages: calcTotalPages(sapiensContent),
  },
  {
    id: '3',
    title: '英语阅读理解精选',
    author: '考研英语组',
    fileType: 'pdf',
    storageType: 'text',
    content: englishReadingContent,
    coverImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=An%20English%20learning%20book%20cover%20with%20British%20flag%20colors%20and%20text%20elements%2C%20educational%20style%2C%20clean%20design&image_size=square',
    addedDate: new Date('2024-03-01'),
    lastReadPage: 1,
    totalPages: calcTotalPages(englishReadingContent),
  },
  {
    id: '4',
    title: '算法导论',
    author: 'Thomas H. Cormen',
    fileType: 'pdf',
    storageType: 'text',
    content: algorithmsContent,
    coverImage: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=An%20algorithms%20book%20cover%20with%20geometric%20patterns%20and%20flowchart%20diagrams%2C%20technical%20blue%20theme%2C%20academic%20style&image_size=square',
    addedDate: new Date('2024-01-20'),
    lastReadPage: 1,
    totalPages: calcTotalPages(algorithmsContent),
  },
];

// localStorage 持久化：仅存用户导入书籍的元数据（不含 content/blob，那些在 IndexedDB）
const STORAGE_KEY = 'lexnote-user-books';
const FOLDERS_STORAGE_KEY = 'lexnote-folders';

function loadUserBooks(): Book[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((b: Record<string, unknown>) => ({
      ...b,
      addedDate: new Date(b.addedDate as string),
    })) as Book[];
  } catch {
    return [];
  }
}

function saveUserBooks(books: Book[]) {
  try {
    // 只持久化用户导入的书籍（id 以 'user-' 开头），且不存 content 字段
    const userBooks = books
      .filter((b) => b.id.startsWith('user-'))
      .map(({ content, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userBooks));
  } catch (e) {
    console.error('Failed to save books:', e);
  }
}

function loadFolders(): Folder[] {
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Folder[];
  } catch {
    return [];
  }
}

function saveFolders(folders: Folder[]) {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  } catch (e) {
    console.error('Failed to save folders:', e);
  }
}

// D3.2 书签持久化到 localStorage（数据量小，不必进 IndexedDB）
const BOOKMARKS_STORAGE_KEY = 'lexnote-bookmarks';

function loadBookmarks(): Bookmark[] {
  try {
    const raw = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Bookmark[];
  } catch {
    return [];
  }
}

function saveBookmarks(bookmarks: Bookmark[]) {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch (e) {
    console.error('Failed to save bookmarks:', e);
  }
}

// 初始书籍 = 示例书籍 + 用户导入的书籍
const initialBooks = [...sampleBooks, ...loadUserBooks()];
const initialFolders = loadFolders();
const initialBookmarks = loadBookmarks();

export const useBookStore = create<BookState>((set) => ({
  books: initialBooks,
  highlights: [],
  bookmarks: initialBookmarks,
  currentBook: null,
  folders: initialFolders,
  addBook: (book) =>
    set((state) => {
      const books = [...state.books, book];
      saveUserBooks(books);
      return { books };
    }),
  removeBook: (id) =>
    set((state) => {
      const books = state.books.filter((b) => b.id !== id);
      saveUserBooks(books);
      // D3.2 清理该书的书签
      const bookmarks = state.bookmarks.filter((b) => b.bookId !== id);
      saveBookmarks(bookmarks);
      // 异步清理 IndexedDB 中的文件数据
      deleteBookData(id).catch(console.error);
      return { books, bookmarks };
    }),
  setCurrentBook: (book) => set({ currentBook: book }),
  addHighlight: (highlight) => set((state) => ({ highlights: [...state.highlights, highlight] })),
  removeHighlight: (id) => set((state) => ({ highlights: state.highlights.filter((h) => h.id !== id) })),
  addBookmark: (bookmark) =>
    set((state) => {
      const bookmarks = [...state.bookmarks, bookmark];
      saveBookmarks(bookmarks);
      return { bookmarks };
    }),
  removeBookmark: (id) =>
    set((state) => {
      const bookmarks = state.bookmarks.filter((b) => b.id !== id);
      saveBookmarks(bookmarks);
      return { bookmarks };
    }),
  updateLastReadPage: (bookId, page) =>
    set((state) => {
      const books = state.books.map((b) => (b.id === bookId ? { ...b, lastReadPage: page } : b));
      saveUserBooks(books);
      return { books };
    }),
  // ==== C3 文档管理 actions ====
  addFolder: (name, parentId = null) =>
    set((state) => {
      const now = new Date().toISOString();
      const folder: Folder = {
        id: `folder-${Date.now()}`,
        name,
        parentId,
        createdAt: now,
        updatedAt: now,
      };
      const folders = [...state.folders, folder];
      saveFolders(folders);
      return { folders };
    }),
  renameFolder: (id, name) =>
    set((state) => {
      const folders = state.folders.map((f) =>
        f.id === id ? { ...f, name, updatedAt: new Date().toISOString() } : f
      );
      saveFolders(folders);
      return { folders };
    }),
  deleteFolder: (id) =>
    set((state) => {
      // 递归收集所有子文件夹（含嵌套）
      const collectIds = (parentId: string): string[] => {
        const directChildren = state.folders
          .filter((f) => f.parentId === parentId)
          .map((f) => f.id);
        const all = [...directChildren];
        directChildren.forEach((cid) => {
          all.push(...collectIds(cid));
        });
        return all;
      };
      const idsToDelete = [id, ...collectIds(id)];
      const folders = state.folders.filter((f) => !idsToDelete.includes(f.id));
      // 文件夹下的书籍移到根目录
      const books = state.books.map((b) =>
        b.folderId && idsToDelete.includes(b.folderId) ? { ...b, folderId: null } : b
      );
      saveFolders(folders);
      saveUserBooks(books);
      return { folders, books };
    }),
  moveBookToFolder: (bookId, folderId) =>
    set((state) => {
      const books = state.books.map((b) =>
        b.id === bookId ? { ...b, folderId } : b
      );
      saveUserBooks(books);
      return { books };
    }),
  toggleFavorite: (bookId) =>
    set((state) => {
      const books = state.books.map((b) =>
        b.id === bookId ? { ...b, isFavorite: !b.isFavorite } : b
      );
      saveUserBooks(books);
      return { books };
    }),
  updateLastOpened: (bookId) =>
    set((state) => {
      const books = state.books.map((b) =>
        b.id === bookId ? { ...b, lastOpenedAt: new Date().toISOString() } : b
      );
      saveUserBooks(books);
      return { books };
    }),
}));
