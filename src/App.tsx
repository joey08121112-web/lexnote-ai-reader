import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Monitor, Smartphone } from 'lucide-react';
import Bookshelf from "@/pages/Bookshelf";
import Reader from "@/pages/Reader";
import EnglishReader from "@/pages/EnglishReader";
import Vocabulary from "@/pages/Vocabulary";
import Settings from "@/pages/Settings";
import Solver from "@/pages/Solver";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/common/Button";

export default function App() {
  const [showDemoNotice, setShowDemoNotice] = useState(() => {
    return sessionStorage.getItem('lexnote_demo_notice_dismissed') !== '1';
  });

  const handleDismissNotice = () => {
    sessionStorage.setItem('lexnote_demo_notice_dismissed', '1');
    setShowDemoNotice(false);
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Bookshelf />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/english/:id" element={<EnglishReader />} />
        <Route path="/vocabulary" element={<Vocabulary />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/solver" element={<Solver />} />
      </Routes>

      <Modal
        isOpen={showDemoNotice}
        onClose={handleDismissNotice}
        title="演示版本说明"
        className="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#D4A574]/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-[#D4A574]" />
            </div>
            <div>
              <p className="text-[#4A3F35] leading-relaxed">
                此网页<strong>只用于演示Demo</strong>。
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#6B9FD4]/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-[#6B9FD4]" />
            </div>
            <div>
              <p className="text-[#4A3F35] leading-relaxed">
                Lexnote 的<strong>主应用是 iOS / iPadOS 原生应用</strong>，支持 Apple Pencil 手写、PencilKit 笔触、离线词典翻译等完整功能。
              </p>
            </div>
          </div>

          <p className="text-sm text-[#9B8E84] pt-1">
            Web 版仅用于在浏览器中快速展示核心交互体验，非最终产品形态。
          </p>

          <div className="pt-2 flex justify-end">
            <Button onClick={handleDismissNotice}>
              我知道了
            </Button>
          </div>
        </div>
      </Modal>
    </Router>
  );
}
