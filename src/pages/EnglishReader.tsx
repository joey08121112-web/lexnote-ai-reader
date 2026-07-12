import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Languages, Sparkles, Plus } from 'lucide-react';
import { useVocabularyStore } from '@/stores/vocabularyStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { cn } from '@/lib/utils';

export default function EnglishReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addWord } = useVocabularyStore();
  
  const [wordPopup, setWordPopup] = useState<{
    word: string;
    definition: string;
    phonetic: string;
    examples: string[];
    position: { top: number; left: number };
  } | null>(null);
  const [sentenceAnalysis, setSentenceAnalysis] = useState<{
    sentence: string;
    grammar: string;
    translation: string;
    phrases: string[];
  } | null>(null);
  const [showAnalysisModal, setShowAnalysisModal] = useState(false);

  // 单词点击处理
  const handleWordClick = (word: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 模拟单词释义数据
    const wordData = getWordDefinition(word);
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const popupTop = rect.bottom + 8;
    const popupLeft = Math.max(10, rect.left - 100);
    
    setWordPopup({
      word,
      ...wordData,
      position: { top: popupTop, left: popupLeft },
    });
  };

  // 加入生词本
  const handleAddToVocabulary = () => {
    if (wordPopup) {
      addWord({
        id: Date.now().toString(),
        word: wordPopup.word,
        definition: wordPopup.definition,
        phonetic: wordPopup.phonetic,
        examples: wordPopup.examples,
        sourceBook: '英语阅读理解精选',
        addedDate: new Date(),
        reviewCount: 0,
        nextReviewDate: new Date(),
        easeFactor: 2.5,
        mastered: false,
      });
      setWordPopup(null);
    }
  };

  // 句子分析
  const handleSentenceSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const sentence = selection.toString().trim();
      setSentenceAnalysis({
        sentence,
        grammar: '这是一个复合句，包含主句和从句。',
        translation: '智能手机已经成为现代社会无处不在的存在。',
        phrases: ['become ubiquitous', 'modern society'],
      });
      setShowAnalysisModal(true);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5]" onClick={() => setWordPopup(null)}>
      {/* 顶部工具栏 */}
      <header className="sticky top-0 z-40 bg-[#FAF8F5]/95 backdrop-blur-sm border-b border-[#E8E4DE]">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-lg font-semibold text-[#4A3F35]">英语阅读理解 - Test 1</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/vocabulary')}>
              <BookOpen className="w-4 h-4 mr-1" />
              生词本
            </Button>
          </div>
        </div>
      </header>

      {/* 主内容区 */}
      <main className="container mx-auto px-6 py-8 max-w-3xl">
        {/* 提示 */}
        <div className="bg-[#D4A574]/10 rounded-xl p-4 mb-6 border border-[#D4A574]/30">
          <p className="text-sm text-[#6B5E54]">
            <Sparkles className="w-4 h-4 inline mr-1" />
            点击单词查看释义，选中句子进行语法分析
          </p>
        </div>

        {/* 阅读文章 */}
        <article className="prose prose-lg text-[#4A3F35] leading-relaxed">
          <h2 className="text-2xl font-bold mb-6 text-[#4A3F35]">The Digital Revolution</h2>
          
          <p className="mb-4" onMouseUp={handleSentenceSelect}>
            <Word word="The" onClick={handleWordClick} />
            <Word word="digital" onClick={handleWordClick} />
            <Word word="revolution" onClick={handleWordClick} />
            has fundamentally transformed how we live, work, and communicate. 
            <Word word="Smartphones" onClick={handleWordClick} />
            have 
            <Word word="become" onClick={handleWordClick} />
            <Word word="ubiquitous" onClick={handleWordClick} />
            in 
            <Word word="modern" onClick={handleWordClick} />
            <Word word="society" onClick={handleWordClick} />
            , serving as essential tools for daily activities.
          </p>
          
          <p className="mb-4" onMouseUp={handleSentenceSelect}>
            The 
            <Word word="rapid" onClick={handleWordClick} />
            <Word word="advancement" onClick={handleWordClick} />
            of 
            <Word word="technology" onClick={handleWordClick} />
            has led to 
            <Word word="significant" onClick={handleWordClick} />
            changes in various 
            <Word word="industries" onClick={handleWordClick} />
            . 
            <Word word="Traditional" onClick={handleWordClick} />
            <Word word="businesses" onClick={handleWordClick} />
            are adapting to the digital age, while new 
            <Word word="innovative" onClick={handleWordClick} />
            <Word word="companies" onClick={handleWordClick} />
            are emerging at an 
            <Word word="unprecedented" onClick={handleWordClick} />
            rate.
          </p>
          
          <p className="mb-4" onMouseUp={handleSentenceSelect}>
            <Word word="Artificial" onClick={handleWordClick} />
            <Word word="intelligence" onClick={handleWordClick} />
            and 
            <Word word="machine" onClick={handleWordClick} />
            <Word word="learning" onClick={handleWordClick} />
            are 
            <Word word="revolutionizing" onClick={handleWordClick} />
            fields from healthcare to finance. These 
            <Word word="technologies" onClick={handleWordClick} />
            enable more 
            <Word word="efficient" onClick={handleWordClick} />
            data analysis and 
            <Word word="prediction" onClick={handleWordClick} />
            , leading to better 
            <Word word="decision-making" onClick={handleWordClick} />
            .
          </p>
          
          <p className="mb-4" onMouseUp={handleSentenceSelect}>
            However, this digital transformation also brings 
            <Word word="challenges" onClick={handleWordClick} />
            . 
            <Word word="Privacy" onClick={handleWordClick} />
            concerns, 
            <Word word="cybersecurity" onClick={handleWordClick} />
            threats, and the digital divide are issues that need to be 
            <Word word="addressed" onClick={handleWordClick} />
            . 
            <Word word="Society" onClick={handleWordClick} />
            must find ways to 
            <Word word="balance" onClick={handleWordClick} />
            technological progress with ethical considerations.
          </p>
        </article>

        {/* 试题部分 */}
        <div className="mt-8 border-t border-[#E8E4DE] pt-6">
          <h3 className="text-xl font-semibold text-[#4A3F35] mb-4">Questions</h3>
          
          <div className="space-y-4">
            <Question
              number={1}
              question="According to the passage, smartphones have become ______ in modern society."
              options={['essential', 'ubiquitous', 'innovative', 'traditional']}
              answer="ubiquitous"
            />
            <Question
              number={2}
              question="What are the challenges mentioned in the passage?"
              options={['Privacy concerns', 'Cybersecurity threats', 'Digital divide', 'All of the above']}
              answer="All of the above"
            />
          </div>
        </div>
      </main>

      {/* 单词弹窗 */}
      {wordPopup && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-[#E8E4DE] p-4 w-[280px]"
          style={{ top: wordPopup.position.top, left: wordPopup.position.left }}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-[#4A3F35]">{wordPopup.word}</h4>
            <span className="text-sm text-[#6B5E54]">{wordPopup.phonetic}</span>
          </div>
          
          <p className="text-[#4A3F35] mb-2">{wordPopup.definition}</p>
          
          {wordPopup.examples.length > 0 && (
            <div className="bg-[#E8E4DE] rounded-lg p-2 mb-3">
              <p className="text-sm text-[#6B5E54]">
                例: {wordPopup.examples[0]}
              </p>
            </div>
          )}
          
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleAddToVocabulary}>
              <Plus className="w-4 h-4 mr-1" />
              加入生词本
            </Button>
            <Button variant="secondary" size="sm">
              更多
            </Button>
          </div>
        </div>
      )}

      {/* 句子分析弹窗 */}
      <Modal
        isOpen={showAnalysisModal}
        onClose={() => setShowAnalysisModal(false)}
        title="句子分析"
        className="max-w-lg"
      >
        {sentenceAnalysis && (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-[#6B5E54] mb-2">原句：</p>
              <div className="bg-[#E8E4DE] rounded-lg p-3 text-[#4A3F35]">
                "{sentenceAnalysis.sentence}"
              </div>
            </div>
            
            <div>
              <p className="text-sm text-[#6B5E54] mb-2">语法分析：</p>
              <div className="bg-[#D4A574]/10 rounded-lg p-3 text-[#4A3F35] border border-[#D4A574]/30">
                {sentenceAnalysis.grammar}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-[#6B5E54] mb-2">翻译：</p>
              <div className="bg-[#BBDEFB]/30 rounded-lg p-3 text-[#4A3F35]">
                {sentenceAnalysis.translation}
              </div>
            </div>
            
            <div>
              <p className="text-sm text-[#6B5E54] mb-2">重点短语：</p>
              <div className="flex gap-2">
                {sentenceAnalysis.phrases.map((phrase) => (
                  <span
                    key={phrase}
                    className="bg-[#FFEB99]/50 px-2 py-1 rounded text-sm text-[#4A3F35]"
                  >
                    {phrase}
                  </span>
                ))}
              </div>
            </div>
            
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" size="sm">
                <Languages className="w-4 h-4 mr-1" />
                详细语法
              </Button>
              <Button variant="secondary" size="sm">
                <Sparkles className="w-4 h-4 mr-1" />
                AI讲解
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// 单词组件
function Word({ word, onClick }: { word: string; onClick: (word: string, e: React.MouseEvent) => void }) {
  return (
    <span
      className="cursor-pointer hover:bg-[#D4A574]/20 rounded px-0.5 transition-colors"
      onClick={(e) => onClick(word, e)}
    >
      {word}
    </span>
  );
}

// 问题组件
function Question({
  number,
  question,
  options,
  answer,
}: {
  number: number;
  question: string;
  options: string[];
  answer: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <p className="text-[#4A3F35] mb-3">
        <span className="font-semibold">{number}. </span>
        {question}
      </p>
      
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => setSelected(option)}
            className={cn(
              'w-full text-left px-4 py-2 rounded-lg transition-colors',
              selected === option
                ? option === answer
                  ? 'bg-[#C8E6C9] text-[#2E7D32]'
                  : 'bg-[#FFCDD2] text-[#C62828]'
                : 'bg-[#E8E4DE] hover:bg-[#D8D4CE] text-[#4A3F35]'
            )}
          >
            {option}
          </button>
        ))}
      </div>
      
      {selected && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAnswer(!showAnswer)}
          className="mt-3"
        >
          {showAnswer ? '隐藏答案' : '显示答案'}
        </Button>
      )}
      
      {showAnswer && (
        <p className="mt-2 text-sm text-[#6B5E54]">
          正确答案: <span className="font-semibold text-[#D4A574]">{answer}</span>
        </p>
      )}
    </div>
  );
}

// 模拟单词释义数据
function getWordDefinition(word: string): { definition: string; phonetic: string; examples: string[] } {
  const dictionary: Record<string, { definition: string; phonetic: string; examples: string[] }> = {
    ubiquitous: {
      definition: 'adj. 无处不在的，普遍存在的',
      phonetic: '/juˈbɪkwɪtəs/',
      examples: ['Smartphones have become ubiquitous in modern society.'],
    },
    revolution: {
      definition: 'n. 革命，变革',
      phonetic: '/ˌrevəˈluːʃən/',
      examples: ['The digital revolution has changed our lives.'],
    },
    unprecedented: {
      definition: 'adj. 史无前例的，空前的',
      phonetic: '/ʌnˈpresɪdentɪd/',
      examples: ['The company grew at an unprecedented rate.'],
    },
    artificial: {
      definition: 'adj. 人造的，人工的',
      phonetic: '/ˌɑːtɪˈfɪʃəl/',
      examples: ['Artificial intelligence is transforming industries.'],
    },
    cybersecurity: {
      definition: 'n. 网络安全',
      phonetic: '/ˌsaɪbərsekˈjʊərɪti/',
      examples: ['Cybersecurity threats are increasing.'],
    },
    digital: {
      definition: 'adj. 数字的，数码的',
      phonetic: '/ˈdɪdʒɪtəl/',
      examples: ['The digital age has brought many changes.'],
    },
    innovative: {
      definition: 'adj. 创新的，革新的',
      phonetic: '/ˈɪnəvətɪv/',
      examples: ['Innovative companies are leading the market.'],
    },
    efficient: {
      definition: 'adj. 高效的，有效率的',
      phonetic: '/ɪˈfɪʃənt/',
      examples: ['The new system is more efficient.'],
    },
    privacy: {
      definition: 'n. 隐私',
      phonetic: '/ˈprɪvəsi/',
      examples: ['Privacy concerns are growing.'],
    },
    significant: {
      definition: 'adj. 重要的，显著的',
      phonetic: '/sɪɡˈnɪfɪkənt/',
      examples: ['This is a significant change.'],
    },
  };
  
  return dictionary[word.toLowerCase()] || {
    definition: '点击查看详细释义',
    phonetic: '',
    examples: [],
  };
}