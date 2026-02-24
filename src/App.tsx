/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, 
  Send, 
  Sparkles, 
  ClipboardCheck, 
  Heart, 
  Download, 
  Loader2,
  ChevronRight,
  RefreshCw,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Settings,
  Key,
  X,
  CheckCircle2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  generateFormalRecord, 
  generateFeedbackSummary, 
  generateCardImage, 
  refineContent, 
  refineImagePrompt, 
  IMAGE_STYLES,
  type FeedbackData 
} from './services/geminiService';
import { exportToWord } from './services/exportService';
import { toPng } from 'html-to-image';
import { saveAs } from 'file-saver';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Step = 'initial' | 'record' | 'feedback' | 'visual';

const STYLE_LABELS: Record<keyof typeof IMAGE_STYLES, string> = {
  auto: 'AI 自動生成',
  cute_animal: '可愛動物風',
  warm_book: '溫暖繪本風',
  nature_organic: '自然有機風',
  frieren_fantasy: '日本芙莉蓮',
  professional_calm: '專業沈穩風',
  starry_dream: '星空夢幻風',
  oil_texture: '油畫質感風',
  minimalist_line: '簡約線條風',
  ghibli_fresh: '吉卜力清新風'
};

export default function App() {
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [formalRecord, setFormalRecord] = useState<string>('');
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [cardImage, setCardImage] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('initial');
  const [selectedStyle, setSelectedStyle] = useState<keyof typeof IMAGE_STYLES>('auto');
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(true);
  
  // Edit & Refinement States
  const [isEditing, setIsEditing] = useState(false);
  const [refinementInput, setRefinementInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [imageRefinementInput, setImageRefinementInput] = useState('');
  const [isRefiningImage, setIsRefiningImage] = useState(false);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const cardRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load saved key from localStorage
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setUserApiKey(savedKey);
      setTempKey(savedKey);
    }

    const checkKey = async () => {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleOpenKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const handleSaveKey = () => {
    setUserApiKey(tempKey);
    localStorage.setItem('gemini_api_key', tempKey);
    setShowSettings(false);
  };

  const handleGenerateRecord = async () => {
    if (!input.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const record = await generateFormalRecord(input, userApiKey);
      setFormalRecord(record || '');
      setStep('record');
    } catch (err: any) {
      console.error('Record generation failed:', err);
      if (err?.message?.includes("Requested entity was not found")) {
        setHasKey(false);
        setError("API Key 效期已過或未設定，請重新連接。");
      } else {
        setError(err?.message?.includes("RESOURCE_EXHAUSTED") 
          ? "API 使用額度已達上限，請稍後再試，或檢查您的 API Key 設定。" 
          : "生成紀錄時發生錯誤，請稍後再試。");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async () => {
    if (!refinementInput.trim()) return;
    setIsRefining(true);
    setError(null);
    try {
      const currentContent = step === 'record' ? formalRecord : (feedback?.fullText || '');
      const type = step === 'record' ? 'record' : 'feedback';
      const refined = await refineContent(currentContent, refinementInput, type, userApiKey);
      
      if (step === 'record') {
        setFormalRecord(refined || '');
      } else {
        setFeedback(prev => prev ? { ...prev, fullText: refined } : null);
      }
      setRefinementInput('');
    } catch (err: any) {
      console.error('Refinement failed:', err);
      setError("微調內容時發生錯誤，請稍後再試。");
    } finally {
      setIsRefining(false);
    }
  };

  const handleRefineImage = async () => {
    if (!imageRefinementInput.trim() || !imagePrompt) return;
    setIsRefiningImage(true);
    setError(null);
    try {
      const refinedPrompt = await refineImagePrompt(imagePrompt, imageRefinementInput, userApiKey);
      if (refinedPrompt) {
        setImagePrompt(refinedPrompt);
        setCardImage(null);
        const newImage = await generateCardImage('', selectedStyle, refinedPrompt, userApiKey);
        setCardImage(newImage);
      }
      setImageRefinementInput('');
    } catch (err: any) {
      console.error('Image refinement failed:', err);
      setError("微調圖像提示詞時發生錯誤，請稍後再試。");
    } finally {
      setIsRefiningImage(false);
    }
  };

  const handleGoToFeedback = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const summary = await generateFeedbackSummary(formalRecord, userApiKey);
      // Construct a full text version for editing - NO HEADERS as requested
      const fullText = `${summary.feedbackCard}\n\n${summary.healingSentence}`;
      setFeedback({ ...summary, fullText });
      setStep('feedback');
      setIsEditing(false);
    } catch (err: any) {
      console.error('Feedback generation failed:', err);
      setError("生成回饋內容時發生錯誤。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGoToVisual = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const stylePrompt = IMAGE_STYLES[selectedStyle];
      const theme = feedback?.theme || 'warmth';
      const prompt = selectedStyle === 'auto' 
        ? `aspect ratio 9:16. ${stylePrompt} The theme is: ${theme}. Create a visual metaphor for this theme.`
        : `${stylePrompt} Theme: ${theme}.`;
      
      setImagePrompt(prompt);
      const image = await generateCardImage(theme, selectedStyle, prompt, userApiKey);
      setCardImage(image);
      setStep('visual');
    } catch (err: any) {
      console.error('Image generation failed:', err);
      setError("生成視覺卡片時發生錯誤。");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadWord = async () => {
    if (formalRecord) {
      await exportToWord(formalRecord);
    }
  };

  const handleDownloadCard = async () => {
    if (cardRef.current) {
      try {
        setIsGenerating(true);
        // Ensure the UI has time to settle and fonts are ready
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (document.fonts) {
          await document.fonts.ready;
        }

        const cardElement = cardRef.current;
        
        // Use a higher pixel ratio for crisp text on all devices
        const dataUrl = await toPng(cardElement, { 
          cacheBust: true,
          pixelRatio: 3, 
          backgroundColor: '#FDFBF7',
          style: {
            borderRadius: '2.5rem',
            transform: 'scale(1)',
          },
          filter: (node: HTMLElement) => {
            // Strictly exclude the hover overlay and any other unwanted elements
            return !node.classList?.contains('download-exclude');
          }
        });
        
        const link = document.createElement('a');
        link.download = `supervision-card-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        console.error('Download failed:', err);
        setError("下載卡片時發生錯誤。請嘗試長按圖片儲存，或重新整理頁面再試一次。");
      } finally {
        setIsGenerating(false);
      }
    }
  };

  const reset = () => {
    setStep('initial');
    setFormalRecord('');
    setFeedback(null);
    setCardImage(null);
    setImagePrompt(null);
    setInput('');
    setIsEditing(false);
  };

  return (
    <div className="min-h-screen bg-morandi-bg text-morandi-ink font-sans selection:bg-morandi-sage/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-morandi-bg/80 backdrop-blur-md border-b border-morandi-sage/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-morandi-sage rounded-xl flex items-center justify-center text-white shadow-lg shadow-morandi-sage/20">
              <Sparkles size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-none">Supervision Helper</h1>
              <p className="text-[10px] text-morandi-sage/60 font-bold uppercase tracking-widest mt-1">AI 督導輔助系統</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowSettings(true)}
              className={cn(
                "p-2 rounded-xl transition-all relative",
                userApiKey ? "text-morandi-sage bg-morandi-sage/10" : "text-amber-600 bg-amber-50 animate-pulse"
              )}
              title="設定 API Key"
            >
              <Settings size={20} />
              {!userApiKey && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />
              )}
            </button>

            {/* Progress Stepper - Desktop Only */}
            {step !== 'initial' && (
              <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-morandi-bg/50 rounded-2xl border border-morandi-sage/10 mr-4">
                {[
                  { id: 'record', label: '紀錄', icon: ClipboardCheck },
                  { id: 'feedback', label: '回饋', icon: Heart },
                  { id: 'visual', label: '視覺', icon: Sparkles }
                ].map((s, i) => {
                  const isActive = step === s.id;
                  const isPast = (step === 'feedback' && s.id === 'record') || (step === 'visual' && (s.id === 'record' || s.id === 'feedback'));
                  return (
                    <React.Fragment key={s.id}>
                      <div className={cn(
                        "flex items-center gap-2 transition-all",
                        isActive ? "text-morandi-sage" : isPast ? "text-morandi-sage/60" : "text-morandi-sage/30"
                      )}>
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border",
                          isActive ? "bg-morandi-sage text-white border-morandi-sage" : isPast ? "bg-morandi-sage/10 text-morandi-sage/60 border-morandi-sage/20" : "bg-white text-morandi-sage/30 border-morandi-sage/10"
                        )}>
                          {i + 1}
                        </div>
                        <span className="text-[11px] font-bold tracking-wider">{s.label}</span>
                      </div>
                      {i < 2 && <div className="w-4 h-[1px] bg-morandi-sage/10 mx-1" />}
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            <button 
              onClick={handleOpenKey}
              className={cn(
                "text-xs font-bold px-4 py-2 rounded-xl border transition-all flex items-center gap-2",
                hasKey 
                  ? "bg-morandi-sage/10 text-morandi-sage border-morandi-sage/20 hover:bg-morandi-sage/20" 
                  : "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100 animate-pulse"
              )}
            >
              <Sparkles size={14} />
              {hasKey ? "API Key 已就緒" : "連接 API Key"}
            </button>
            
            {step !== 'initial' && (
              <button 
                onClick={reset}
                className="p-2 text-morandi-sage/40 hover:text-morandi-sage hover:bg-morandi-sage/10 rounded-xl transition-all"
                title="重新開始"
              >
                <RefreshCw size={18} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3 text-morandi-sage">
                    <div className="p-2 bg-morandi-sage/10 rounded-lg">
                      <Key size={20} />
                    </div>
                    <h2 className="text-xl font-bold">API 設定</h2>
                  </div>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-500 leading-relaxed">
                    為了保護您的隱私，API Key 將儲存在您的瀏覽器中。如果您不設定，系統將嘗試使用預設金鑰（如果有的話）。
                  </p>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-morandi-sage uppercase tracking-widest">Gemini API Key</label>
                    <input 
                      type="password"
                      value={tempKey}
                      onChange={(e) => setTempKey(e.target.value)}
                      placeholder="輸入您的 API Key..."
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-morandi-sage/20 focus:border-morandi-sage outline-none transition-all font-mono text-sm"
                    />
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                      尚未擁有金鑰？您可以前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline font-bold">Google AI Studio</a> 免費申請。
                    </p>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-all"
                  >
                    取消
                  </button>
                  <button 
                    onClick={handleSaveKey}
                    className="flex-1 py-3 px-4 bg-morandi-sage text-white rounded-xl font-bold shadow-lg shadow-morandi-sage/20 hover:bg-morandi-sage/90 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={18} />
                    儲存設定
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-medium flex items-center gap-3"
          >
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            {error}
          </motion.div>
        )}
        <AnimatePresence mode="wait">
          {step === 'initial' ? (
            <motion.div
              key="initial"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-6xl mx-auto space-y-12 py-8"
            >
              {/* Hero Section - Centered */}
              <div className="text-center space-y-6 max-w-5xl mx-auto">
                <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-morandi-ink leading-tight">
                  轉化督導對話，傳遞專業與溫暖。
                </h2>
                <p className="text-morandi-ink/60 text-lg md:text-xl font-medium">
                  將枯燥的逐字稿轉化為具備專業深度與情感溫度的正式紀錄。
                </p>
              </div>

              {/* Info Grid - 3 Columns with Morandi Style */}
              <div className="grid grid-cols-1 md:grid-cols-3 bg-morandi-cream/50 backdrop-blur-sm border border-morandi-sage/20 rounded-[2.5rem] overflow-hidden shadow-sm divide-y md:divide-y-0 md:divide-x divide-morandi-sage/20">
                {/* System Status */}
                <div className="p-10 space-y-6 flex flex-col">
                  <div className="flex items-center gap-3 text-morandi-blue">
                    <Sparkles size={22} />
                    <h3 className="text-sm font-bold uppercase tracking-[0.2em]">System Status</h3>
                  </div>
                  <div className="flex-1 flex flex-col justify-center space-y-4">
                    <p className="text-2xl font-bold text-morandi-ink">
                      {hasKey ? "Gemini API Ready" : "API Key Required"}
                    </p>
                    <button 
                      onClick={handleOpenKey}
                      className="inline-flex items-center text-sm font-bold text-morandi-blue hover:text-morandi-ink transition-colors underline underline-offset-8"
                    >
                      {hasKey ? "更換金鑰" : "立即連接金鑰"}
                    </button>
                  </div>
                </div>

                {/* Self-provided Key */}
                <div className="p-10 space-y-6 flex flex-col">
                  <div className="flex items-center gap-3 text-morandi-pink">
                    <Heart size={22} />
                    <h3 className="text-sm font-bold uppercase tracking-[0.2em]">自備金鑰</h3>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="text-sm text-morandi-ink/70 leading-relaxed font-medium">
                      本系統不儲存您的 API Key。您只需連接自己的 Google AI Studio 金鑰即可開始使用，完全掌握自己的使用額度與頻率。
                    </p>
                  </div>
                </div>

                {/* Privacy */}
                <div className="p-10 space-y-6 flex flex-col">
                  <div className="flex items-center gap-3 text-morandi-tea">
                    <ClipboardCheck size={22} />
                    <h3 className="text-sm font-bold uppercase tracking-[0.2em]">資料隱私</h3>
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="text-sm text-morandi-ink/70 leading-relaxed font-medium">
                      您的督導紀錄僅在瀏覽器端處理並傳送至 Gemini API。本系統後端不會留存任何敏感對話內容，確保絕對的專業隱私。
                    </p>
                  </div>
                </div>
              </div>

              {/* Input Area - Morandi Boxed */}
              <div className="bg-morandi-cream/80 backdrop-blur-sm border border-morandi-sage/20 rounded-[3rem] shadow-sm relative group overflow-hidden">
                <div className="absolute top-8 left-10 z-10">
                  <div className="flex items-center gap-3 text-morandi-sage/40 font-bold text-xs uppercase tracking-[0.2em]">
                    <FileText size={16} />
                    督導內容輸入
                  </div>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="在此輸入督導逐字稿、重點筆記或對話內容..."
                  className="w-full h-[450px] p-12 pt-24 bg-transparent outline-none resize-none text-xl leading-relaxed placeholder:text-morandi-sage/20 font-serif transition-all focus:bg-white/40"
                />
                <div className="absolute bottom-10 right-10">
                  <button
                    onClick={handleGenerateRecord}
                    disabled={!input.trim() || isGenerating}
                    className="bg-morandi-sage text-white px-12 py-5 rounded-2xl font-bold flex items-center gap-4 hover:bg-morandi-sage/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-xl shadow-morandi-sage/20 active:scale-95 group-hover:scale-105"
                  >
                    {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <Send size={24} />}
                    <span className="text-lg">開始生成紀錄</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ) : step === 'record' ? (
            <motion.div
              key="record"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-gray-500 uppercase tracking-widest text-xs font-bold">
                    <ClipboardCheck size={14} />
                    第一步：正式督導紀錄
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setIsEditing(!isEditing)}
                      className="text-xs font-bold text-gray-400 hover:text-emerald-600 flex items-center gap-1 transition-colors"
                    >
                      {isEditing ? "預覽模式" : "手動編輯"}
                    </button>
                    <button 
                      onClick={handleDownloadWord}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                    >
                      <Download size={14} />
                      下載 Word
                    </button>
                  </div>
                </div>

                <div className="bg-morandi-cream p-8 rounded-3xl border border-morandi-sage/10 shadow-sm min-h-[500px] relative">
                  {isEditing ? (
                    <textarea 
                      value={formalRecord}
                      onChange={(e) => setFormalRecord(e.target.value)}
                      className="w-full h-[500px] outline-none resize-none font-mono text-sm leading-relaxed bg-transparent"
                    />
                  ) : (
                    <div className="prose prose-stone max-w-none">
                      <Markdown>{formalRecord}</Markdown>
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button 
                    onClick={handleGoToFeedback}
                    disabled={isGenerating}
                    className="bg-morandi-sage text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-morandi-sage/90 transition-all shadow-xl shadow-morandi-sage/20"
                  >
                    {isGenerating ? <Loader2 className="animate-spin" size={20} /> : "下一步：生成回饋內容"}
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* AI Refinement Sidebar */}
              <div className="space-y-6">
                <div className="bg-morandi-sage/5 p-6 rounded-3xl border border-morandi-sage/10 space-y-4">
                  <div className="flex items-center gap-2 text-morandi-sage font-bold text-sm">
                    <Sparkles size={16} />
                    AI 紀錄精修
                  </div>
                  <p className="text-xs text-morandi-sage/70 leading-relaxed">
                    您可以下指令微調紀錄，例如：「口吻再專業一點」、「增加關於個案情緒的描述」。
                  </p>
                  <textarea 
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="輸入微調指令..."
                    className="w-full h-24 p-3 bg-white border border-morandi-sage/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-morandi-sage/20 resize-none"
                  />
                  <button 
                    onClick={handleRefine}
                    disabled={isRefining || !refinementInput.trim()}
                    className="w-full py-3 bg-morandi-sage text-white rounded-xl font-bold text-sm hover:bg-morandi-sage/90 transition-colors flex items-center justify-center gap-2"
                  >
                    {isRefining ? <Loader2 className="animate-spin" size={16} /> : "執行微調"}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : step === 'feedback' ? (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-morandi-sage/60 uppercase tracking-widest text-xs font-bold">
                    <Heart size={14} />
                    第二步：回饋卡片內容 (50-80字)
                  </div>
                  <button 
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-xs font-bold text-morandi-sage/40 hover:text-morandi-sage flex items-center gap-1 transition-colors"
                  >
                    {isEditing ? "預覽模式" : "手動編輯"}
                  </button>
                </div>

                <div className="bg-morandi-cream p-10 rounded-3xl border border-morandi-sage/10 shadow-sm min-h-[300px] relative flex flex-col justify-center">
                  {isEditing ? (
                    <textarea 
                      value={feedback?.fullText || ''}
                      onChange={(e) => setFeedback(prev => prev ? { ...prev, fullText: e.target.value } : null)}
                      className="w-full h-48 outline-none resize-none text-lg leading-relaxed text-center font-sans bg-transparent"
                    />
                  ) : (
                    <div className="text-center space-y-6">
                      <div className="prose prose-stone mx-auto text-2xl leading-relaxed font-sans text-morandi-ink/90">
                        <Markdown>{feedback?.fullText}</Markdown>
                      </div>
                      <div className="w-12 h-1 bg-morandi-pink mx-auto rounded-full" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-6 items-end">
                  <div className="w-full bg-morandi-cream p-6 rounded-3xl border border-morandi-sage/10 shadow-sm space-y-4">
                    <p className="text-xs font-bold text-morandi-sage/60 uppercase tracking-widest">選擇卡片風格</p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(IMAGE_STYLES) as Array<keyof typeof IMAGE_STYLES>).map((style) => (
                        <button
                          key={style}
                          onClick={() => setSelectedStyle(style)}
                          className={cn(
                            "px-4 py-2 rounded-full text-sm font-medium transition-all",
                            selectedStyle === style 
                              ? "bg-morandi-sage text-white shadow-lg shadow-morandi-sage/20" 
                              : "bg-morandi-bg text-morandi-sage/60 hover:bg-morandi-sage/10"
                          )}
                        >
                          {STYLE_LABELS[style]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    onClick={handleGoToVisual}
                    disabled={isGenerating}
                    className="bg-morandi-sage text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-morandi-sage/90 transition-all shadow-xl shadow-morandi-sage/20"
                  >
                    {isGenerating ? <Loader2 className="animate-spin" size={20} /> : "下一步：生成視覺卡片"}
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>

              {/* AI Refinement Sidebar */}
              <div className="space-y-6">
                <div className="bg-morandi-pink/5 p-6 rounded-3xl border border-morandi-pink/10 space-y-4">
                  <div className="flex items-center gap-2 text-morandi-pink font-bold text-sm">
                    <Sparkles size={16} />
                    AI 回饋精修
                  </div>
                  <p className="text-xs text-morandi-pink/70 leading-relaxed">
                    您可以下指令微調回饋，例如：「語氣再溫柔一點」、「多強調社工的努力」。
                  </p>
                  <textarea 
                    value={refinementInput}
                    onChange={(e) => setRefinementInput(e.target.value)}
                    placeholder="輸入微調指令..."
                    className="w-full h-24 p-3 bg-white border border-morandi-pink/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-morandi-pink/20 resize-none"
                  />
                  <button 
                    onClick={handleRefine}
                    disabled={isRefining || !refinementInput.trim()}
                    className="w-full py-3 bg-morandi-pink text-white rounded-xl font-bold text-sm hover:bg-morandi-pink/90 transition-colors flex items-center justify-center gap-2"
                  >
                    {isRefining ? <Loader2 className="animate-spin" size={16} /> : "執行微調"}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="visual"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto space-y-8"
            >
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 text-morandi-sage/60 uppercase tracking-widest text-xs font-bold">
                  <Sparkles size={14} />
                  第三步：最終視覺卡片
                </div>
                <h3 className="text-2xl font-bold">完美的專業回饋已準備就緒</h3>
              </div>

              <div 
                ref={cardRef} 
                className="w-full max-w-[340px] sm:max-w-md mx-auto bg-morandi-cream rounded-[2.5rem] overflow-hidden shadow-2xl shadow-morandi-sage/10 border border-morandi-sage/5 relative flex flex-col group"
                style={{ aspectRatio: '9/16' }}
              >
                {/* Top Section: Generated Image (65% of height) */}
                <div className="relative overflow-hidden w-full h-[65%] shrink-0">
                  {cardImage ? (
                    <img 
                      src={cardImage} 
                      alt="Feedback theme" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-morandi-bg">
                      <Loader2 className="animate-spin text-morandi-sage" size={32} />
                    </div>
                  )}
                </div>
                
                {/* Bottom Section: Text Content (35% of height) */}
                <div className="relative flex-1 p-6 sm:p-8 flex flex-col justify-center bg-morandi-cream">
                  <div className="w-full">
                    <div className={cn(
                      "mx-auto transition-all text-morandi-ink",
                      textAlign === 'left' ? 'text-left' : textAlign === 'right' ? 'text-right' : 'text-center',
                      feedback?.designConfig?.fontStyle === 'rounded' ? "font-rounded" :
                      feedback?.designConfig?.fontStyle === 'handwritten' ? "font-hand" :
                      "font-serif",
                      // Smarter dynamic font size and line height based on text length
                      (feedback?.fullText?.length || 0) > 150 ? "text-[11px] leading-[1.4]" :
                      (feedback?.fullText?.length || 0) > 100 ? "text-[13px] leading-[1.5]" :
                      (feedback?.fullText?.length || 0) > 70 ? "text-[15px] leading-[1.6]" :
                      "text-[17px] leading-[1.7]"
                    )}>
                      <div className="prose-p:mb-1 last:prose-p:mb-0">
                        <Markdown>{feedback?.fullText}</Markdown>
                      </div>
                    </div>
                  </div>

                  {/* Subtle Branding - Bottom Right Corner */}
                  <div className="absolute bottom-4 right-6 opacity-20 download-exclude">
                    <Sparkles size={14} className="text-morandi-sage" />
                  </div>
                </div>

                {/* Download Button Overlay - Visible on hover, excluded from capture */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none download-exclude">
                  <button 
                    onClick={handleDownloadCard}
                    className="bg-white/90 backdrop-blur-md text-morandi-ink font-bold px-6 py-3 rounded-full shadow-lg flex items-center gap-2 hover:bg-white transition-all transform scale-90 group-hover:scale-100 pointer-events-auto"
                  >
                    <Download size={18} />
                    儲存卡片
                  </button>
                </div>
              </div>

              {/* Explicit Download Button for Mobile Reliability */}
              <div className="flex justify-center pt-2">
                <button 
                  onClick={handleDownloadCard}
                  disabled={isGenerating}
                  className={cn(
                    "w-full max-w-md font-bold py-5 rounded-3xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95",
                    isGenerating 
                      ? "bg-morandi-sage/50 text-white cursor-not-allowed" 
                      : "bg-morandi-sage text-white hover:bg-morandi-sage/90 shadow-morandi-sage/20"
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="animate-spin" size={22} />
                      <span>正在準備高品質卡片...</span>
                    </>
                  ) : (
                    <>
                      <Download size={22} />
                      <span className="text-lg">下載完整圖文卡片</span>
                    </>
                  )}
                </button>
              </div>

              {/* Prompt Display Section */}
              {imagePrompt && (
                <div className="bg-morandi-cream p-6 rounded-3xl border border-morandi-sage/10 space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-morandi-sage/60 uppercase tracking-widest">AI 繪圖提示詞與卡片文字 (可複製使用)</p>
                      <button 
                        onClick={() => {
                          const combined = `【AI 繪圖提示詞】\n${imagePrompt}\n\n【卡片文字】\n${feedback?.fullText}`;
                          navigator.clipboard.writeText(combined);
                          alert('提示詞與文字已複製到剪貼簿！');
                        }}
                        className="text-[10px] font-bold text-morandi-sage hover:underline"
                      >
                        點擊複製全部
                      </button>
                    </div>
                    <div className="bg-morandi-bg/30 p-4 rounded-xl border border-morandi-sage/10 text-xs text-morandi-ink/60 font-mono break-all space-y-4">
                      <div>
                        <span className="font-bold text-morandi-sage/40 block mb-1">Prompt:</span>
                        {imagePrompt}
                      </div>
                      <div className="pt-4 border-t border-morandi-sage/10">
                        <span className="font-bold text-morandi-sage/40 block mb-1">Text:</span>
                        {feedback?.fullText}
                      </div>
                    </div>
                  </div>

                  {/* Design Overrides */}
                  <div className="pt-6 border-t border-morandi-sage/10 space-y-6">
                    <div className="flex items-center gap-2 text-morandi-sage font-bold text-sm">
                      <Palette size={16} />
                      卡片排版微調
                    </div>
                    
                    <div className="grid grid-cols-2 gap-6">
                      {/* Font Style */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-morandi-sage uppercase tracking-widest">字體風格</label>
                        <div className="flex gap-1">
                          {(['rounded', 'serif', 'handwritten'] as const).map((f) => (
                            <button
                              key={f}
                              onClick={() => setFeedback(prev => prev ? { ...prev, designConfig: { ...prev.designConfig, fontStyle: f } } : null)}
                              className={cn(
                                "flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all",
                                feedback?.designConfig?.fontStyle === f 
                                  ? "bg-morandi-sage text-white border-morandi-sage" 
                                  : "bg-white text-morandi-sage border-morandi-sage/10 hover:border-morandi-sage/20"
                              )}
                            >
                              {f === 'rounded' ? '圓體' : f === 'serif' ? '明體' : '手寫'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Text Alignment */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-morandi-sage uppercase tracking-widest">文字對齊</label>
                        <div className="flex gap-1">
                          {(['left', 'center', 'right'] as const).map((a) => (
                            <button
                              key={a}
                              onClick={() => setTextAlign(a)}
                              className={cn(
                                "flex-1 py-1.5 rounded-lg border transition-all flex items-center justify-center",
                                textAlign === a 
                                  ? "bg-morandi-sage text-white border-morandi-sage" 
                                  : "bg-white text-morandi-sage border-morandi-sage/10 hover:border-morandi-sage/20"
                              )}
                            >
                              {a === 'left' ? <AlignLeft size={14} /> : a === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Image Refinement Input */}
                  <div className="pt-6 border-t border-morandi-sage/10 space-y-4">
                    <div className="flex items-center gap-2 text-morandi-sage font-bold text-sm">
                      <RefreshCw size={16} className={isRefiningImage ? "animate-spin" : ""} />
                      微調圖像風格
                    </div>
                    <p className="text-xs text-morandi-sage/70 leading-relaxed">
                      您可以下指令微調圖像，例如：「顏色再明亮一點」、「增加更多森林元素」、「改為夜晚的氛圍」。
                    </p>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={imageRefinementInput}
                        onChange={(e) => setImageRefinementInput(e.target.value)}
                        placeholder="輸入微調指令..."
                        className="flex-1 p-3 bg-white border border-morandi-sage/20 rounded-xl text-sm outline-none focus:ring-2 focus:ring-morandi-sage/20"
                        onKeyDown={(e) => e.key === 'Enter' && handleRefineImage()}
                      />
                      <button 
                        onClick={handleRefineImage}
                        disabled={isRefiningImage || !imageRefinementInput.trim()}
                        className="px-6 bg-morandi-sage text-white rounded-xl font-bold text-sm hover:bg-morandi-sage/90 transition-colors disabled:opacity-50"
                      >
                        {isRefiningImage ? <Loader2 className="animate-spin" size={16} /> : "執行"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-4">
                <button 
                  onClick={() => setStep('feedback')}
                  className="px-6 py-3 text-morandi-sage/60 font-bold hover:text-morandi-sage transition-colors"
                >
                  返回修改內容
                </button>
                <button 
                  onClick={reset}
                  className="bg-morandi-sage text-white px-8 py-3 rounded-xl font-bold hover:bg-morandi-sage/90 transition-all shadow-lg shadow-morandi-sage/20"
                >
                  完成並開始新紀錄
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
