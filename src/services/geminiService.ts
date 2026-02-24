import { GoogleGenAI, Type } from "@google/genai";

function getAI(customKey?: string) {
  return new GoogleGenAI({ apiKey: customKey || process.env.GEMINI_API_KEY || "" });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Check for 429 Resource Exhausted
      const isRateLimit = error?.status === 429 || error?.code === 429 || error?.message?.includes("429") || error?.message?.includes("RESOURCE_EXHAUSTED");
      
      if (isRateLimit && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 2000 + Math.random() * 1000;
        console.warn(`Gemini API rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function generateFormalRecord(input: string, customKey?: string) {
  return withRetry(async () => {
    const ai = getAI(customKey);
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `你是一位資深的社工督導行政助理。你的專長是聆聽督導會議的逐字稿或口述內容，並將其整理成專業、結構化且符合邏輯的「社工督導記錄表」。

**你的核心任務：**
1. **分析**：閱讀使用者提供的督導對話逐字稿、口述重點。
2. **歸納**：根據對話內容，判斷本次督導涵蓋了哪些「教育性」、「行政性」與「支持性」功能，以及討論了哪些議題。
3. **轉譯**：將口語化的對話轉化為社工專業術語（例如：「個案很盧」轉為「案主出現抗拒行為」）。
4. **輸出**：直接顯示 Markdown 格式的內容。

**判斷邏輯指南：**
* **教育性**：涉及處遇計畫邏輯、倫理、技巧示範。
* **行政性**：涉及時間管理、記錄、核銷、方案進度。
* **支持性**：涉及情緒抒發、自信建立、自我照顧。
* **成效評估**：根據語氣自動判斷（待觀察/部份達成/達成目標）。

**輸出格式內容：**

# 社工個別督導記錄表
(包含受督者、督導者、日期、時間、地點等基本欄位)

## 一、 督導功能檢核 (請勾選)
### 1. 教育性功能
(包含：處遇計畫邏輯、專業關係與倫理、會談技巧示範...)
### 2. 行政性功能
(包含：時間管理、記錄完成度、服務流程、出缺勤、核銷、方案執行...)
### 3. 支持性功能
(包含：專業角色認知、反情感轉移、自我覺察...)

## 二、 督導議題 (請勾選)
(包含：專業關係、知能提升、個案研討、跨網絡合作...)

## 三、 督導策略 (請勾選)
(包含：個案討論、記錄檢核、角色扮演...)

## 四、 督導內容摘要與討論 (重點撰寫區)
1. **針對個案/議題之主要發現**
2. **督導給予之建議與指導**
3. **受督者之反思與回應**

## 五、 督導成效評估
(待觀察 / 部份達成 / 下次再加油 / 達成目標)

## 六、 下次督導預告
1. 預計追蹤事項
2. 受督者應完成作業

---
以下是輸入內容：
${input}`,
    });
    return response.text;
  });
}

export interface FeedbackData {
  feedbackCard: string;
  healingSentence: string;
  theme: string;
  fullText: string;
  designConfig: {
    textColor: 'light' | 'dark';
    textPosition: 'top' | 'center' | 'bottom';
    fontStyle: 'rounded' | 'serif' | 'handwritten';
  };
}

export async function generateFeedbackSummary(formalRecord: string, customKey?: string): Promise<FeedbackData> {
  return withRetry(async () => {
    const ai = getAI(customKey);
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `你是一位具社會工作督導經驗的專業工作者，理解敘事取向、創傷知情與支持式督導的精神。
你的任務是將提供的「督導紀錄」轉譯為一張「寫給社工的回饋卡片」。

【輸出要求】
1. **feedbackCard**：字數 50 到 80 字之間。語氣溫暖、肯定、具有支持力量。包含「看見」、「轉換」、「祝福」。**嚴格禁止使用任何關於「發芽、生長、種子、茁壯、長出」等植物生長的隱喻。** 請改用「構築、編織、沉澱、凝聚、點亮、守護、並行」等意象。
2. **healingSentence**：提供一句療癒金句。**嚴格禁止使用植物生長隱喻。**
3. **theme**：用於生成插圖的英文關鍵字（例如：inner peace, weaving light, gentle morning sun）。**嚴格禁止使用「sprout, seedling, growth」等關鍵字。**
4. **designConfig**：根據回饋內容的「情緒重量」與「主題」，建議最適合的排版設計：
   - **textColor**: 'light' (白色系，適合深色背景) 或 'dark' (深灰色系，適合淺色背景)。
   - **textPosition**: 'top', 'center', 或 'bottom'。
   - **fontStyle**: 'rounded' (親切、柔和), 'serif' (優雅、專業), 或 'handwritten' (感性、個人化)。

請以 JSON 格式回傳。

督導紀錄內容：
${formalRecord}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            feedbackCard: { type: Type.STRING },
            healingSentence: { type: Type.STRING },
            theme: { type: Type.STRING },
            designConfig: {
              type: Type.OBJECT,
              properties: {
                textColor: { type: Type.STRING, enum: ['light', 'dark'] },
                textPosition: { type: Type.STRING, enum: ['top', 'center', 'bottom'] },
                fontStyle: { type: Type.STRING, enum: ['rounded', 'serif', 'handwritten'] }
              },
              required: ["textColor", "textPosition", "fontStyle"]
            }
          },
          required: ["feedbackCard", "healingSentence", "theme", "designConfig"]
        }
      }
    });
    const data = JSON.parse(response.text || "{}");
    return {
      ...data,
      fullText: `${data.feedbackCard}\n\n${data.healingSentence}`
    };
  });
}

export const IMAGE_STYLES = {
  auto: "A unique, artistic illustration. Style: Modern, healing. SCENE: A vast landscape with rolling hills, a distant mountain range, or an abstract tapestry of weaving light. STICK TO LANDSCAPES OR ABSTRACT ART. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES, GREEN PLANTS, ANY GROWTH METAPHORS. ABSOLUTELY NO TEXT.",
  cute_animal: "A cute and warm illustration. SCENE: A busy forest festival with many different animals (rabbits, cats, dogs, bears) playing musical instruments or sharing a feast. RICH BACKGROUND with many details. NO PLANTS IN FOCUS. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT.",
  warm_book: "A warm, healing illustration, picture book style. SCENE: A wide-angle view of a cozy village at night with glowing windows, or a library with floating books and warm candlelight. FOCUS ON ATMOSPHERE. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT.",
  nature_organic: "Style: Soft painterly edges, ink wash. SCENE: A grand waterfall cascading into a misty lake, or a wide rocky canyon with glowing minerals. FOCUS ON GEOLOGICAL VASTNESS. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, GREEN LEAVES. ABSOLUTELY NO TEXT.",
  frieren_fantasy: "A beautiful elf female mage, Sousou no Frieren style. SCENE: She is standing on a high stone balcony overlooking a massive stone castle and a sunset sea. FOCUS ON ARCHITECTURE AND SCALE. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT.",
  professional_calm: "Professional, minimalist illustration. Modern editorial style. SCENE: An abstract composition of many overlapping translucent geometric shapes, or a complex network of delicate golden threads. FOCUS ON BALANCE. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT.",
  starry_dream: "A dreamlike illustration of a vast galaxy. SCENE: Thousands of stars, swirling nebulae, and distant planets. A cosmic journey. STRICTLY FORBIDDEN: ANY TERRESTRIAL PLANTS, SPROUTS, SEEDLINGS. ABSOLUTELY NO TEXT.",
  oil_texture: "A rich, textured oil painting. SCENE: A classic landscape of a winding river through a rocky valley, or a stormy sea with crashing waves. FOCUS ON TEXTURE. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT.",
  minimalist_line: "Minimalist line art on textured cream background. SCENE: A complex, continuous line drawing of a mountain range or a series of interconnected geometric patterns. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT.",
  ghibli_fresh: "Studio Ghibli style. SCENE: A vast, lush valley with a train track running through it, or a high-altitude view of a seaside town with many houses, ships, and a bustling harbor. RICH IN ARCHITECTURAL DETAIL. STRICTLY FORBIDDEN: SPROUTS, SEEDLINGS, LEAVES. ABSOLUTELY NO TEXT."
};

export async function generateCardImage(theme: string, styleKey: keyof typeof IMAGE_STYLES = 'warm_book', rawPrompt?: string, customKey?: string) {
  return withRetry(async () => {
    const ai = getAI(customKey);
    let finalPrompt = '';
    
    if (rawPrompt) {
      finalPrompt = `${rawPrompt}. ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WORDS IN THE IMAGE.`;
    } else {
      const stylePrompt = IMAGE_STYLES[styleKey] || IMAGE_STYLES.warm_book;
      finalPrompt = styleKey === 'auto' 
        ? `${stylePrompt} The theme is: ${theme}. Create a visual metaphor for this theme. ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WORDS IN THE IMAGE.`
        : `${stylePrompt} Theme: ${theme}. ABSOLUTELY NO TEXT, NO LETTERS, NO CHARACTERS, NO WORDS IN THE IMAGE.`;
    }
    
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [
          {
            text: finalPrompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "3:4", // Closest to 2:3 (3:4.5)
          imageSize: "1K"
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  });
}

export async function refineContent(currentContent: string, instruction: string, type: 'record' | 'feedback', customKey?: string) {
  return withRetry(async () => {
    const ai = getAI(customKey);
    const systemPrompt = type === 'record' 
      ? "你是一位資深的社工督導行政助理。請根據使用者的指令微調目前的督導紀錄。保持專業、結構化且符合邏輯。"
      : "你是一位溫暖的社工督導。請根據使用者的指令微調目前的回饋卡片內容。保持溫暖、正向，字數控制在 50-80 字。";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `目前的內容：
      ${currentContent}

      指令：
      ${instruction}`,
      config: {
        systemInstruction: systemPrompt
      }
    });
    return response.text;
  });
}

export async function refineImagePrompt(currentPrompt: string, instruction: string, customKey?: string) {
  return withRetry(async () => {
    const ai = getAI(customKey);
    const systemPrompt = "你是一位專業的 AI 繪圖提示詞工程師。請根據使用者的指令微調目前的提示詞。保持英文輸出，確保提示詞精確且能生成高品質圖像。不要包含任何解釋文字，只輸出最終的提示詞。";

    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `目前的提示詞：
      ${currentPrompt}

      指令：
      ${instruction}`,
      config: {
        systemInstruction: systemPrompt
      }
    });
    return response.text;
  });
}

