import { GoogleGenAI } from "@google/genai";

/**
 * Retrieve the Gemini API key from all available clientside locations.
 */
export function getGeminiApiKey(): string | null {
  // 1. Check LocalStorage
  const localKey = localStorage.getItem('axion_gemini_api_key') || localStorage.getItem('gemini_api_key');
  if (localKey && localKey.trim()) {
    return localKey.trim();
  }

  // 2. Check Vite environment variable
  const viteKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
  if (viteKey && viteKey !== 'dummy' && viteKey.trim()) {
    return viteKey.trim();
  }

  return null;
}

/**
 * Centralized Gemini generation utility. Handles direct client-side calls
 * (ideal for GitHub Pages & static environments) with a backend proxy fallback.
 */
export async function generateWithGemini(prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey();

  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      return response.text || "";
    } catch (err: any) {
      console.error("Client-side Gemini call failed:", err);
      throw new Error(`Gemini Error: ${err.message || err}`);
    }
  }

  // Check if we are hosted on static GitHub Pages
  const isGitHubPages = window.location.hostname.includes("github.io");
  if (isGitHubPages) {
    throw new Error(
      "Gemini API Key is not configured. Please add your key in the 'Settings' tab of Axion Workspace under 'Gemini API Configuration' to run client-side on GitHub Pages."
    );
  }

  // Fallback to server-side proxy
  const res = await fetch(`/api/gemini/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });

  if (!res.ok) {
    let serverError = "Unknown server error";
    try {
      const errData = await res.json();
      serverError = errData.error || serverError;
    } catch(e) {
      if (res.status === 404 || res.status === 405) {
        throw new Error(
          "Backend API not found. If hosting statically, please configure your Gemini API key in the 'Settings' tab to enable client-side AI capabilities."
        );
      }
    }
    throw new Error(serverError);
  }

  const data = await res.json();
  return data.text || "";
}
