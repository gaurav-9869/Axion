/**
 * Centralized Gemini generation utility that communicates strictly with the server-side API routes.
 * Never executes direct API calls from the browser or exposes keys in the client bundle.
 */
export async function generateWithGemini(prompt: string): Promise<string> {
  const customKey =
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('axion_gemini_api_key') ||
        localStorage.getItem('gemini_api_key'))) ||
    '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (customKey && customKey.trim()) {
      headers['x-gemini-api-key'] = customKey.trim();
    }

    const res = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let serverError = 'Failed to generate response from server';
      try {
        const errData = await res.json();
        serverError = errData.error || serverError;
      } catch {}
      throw new Error(serverError);
    }

    const data = await res.json();
    return data.text || '';
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Connection timed out after 25 seconds. Please check your network connection.');
    }
    throw err;
  }
}

/**
 * Server-side streaming utility via Server-Sent Events (SSE).
 */
export async function* streamWithGemini(prompt: string): AsyncGenerator<string, void, unknown> {
  const customKey =
    (typeof localStorage !== 'undefined' &&
      (localStorage.getItem('axion_gemini_api_key') ||
        localStorage.getItem('gemini_api_key'))) ||
    '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (customKey && customKey.trim()) {
    headers['x-gemini-api-key'] = customKey.trim();
  }

  const res = await fetch('/api/gemini/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt })
  });

  if (!res.ok || !res.body) {
    let serverError = 'Streaming failed';
    try {
      const errData = await res.json();
      serverError = errData.error || serverError;
    } catch {}
    throw new Error(serverError);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') return;
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.text) yield parsed.text;
        } catch (e) {
          if (e instanceof Error && e.message !== raw) throw e;
        }
      }
    }
  }
}

/**
 * Standard sendChatMessage interface supporting conversational history arrays
 */
export async function sendChatMessage(
  userMessage: string,
  chatHistory: { role: string; content?: string; text?: string }[] = []
): Promise<string> {
  const formattedHistory = chatHistory
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content || m.text || ''}`)
    .join('\n');

  const combinedPrompt = formattedHistory
    ? `Conversation history:\n${formattedHistory}\n\nUser: ${userMessage}\nAssistant:`
    : userMessage;

  return generateWithGemini(combinedPrompt);
}
