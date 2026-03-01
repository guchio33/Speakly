import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";

interface Message {
  role: "user" | "assistant";
  content: string;
  translation?: string;
}

const API_BASE = "http://localhost:3001";

// Web Speech API の型定義
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
  length: number;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: Event) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // メッセージが追加されたら自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const speakText = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  };

  const processUserInput = async (userText: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      // ユーザーメッセージを追加
      setMessages((prev) => [...prev, { role: "user", content: userText }]);

      // AIの返答を取得
      const chatResponse = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText }),
      });

      const data = await chatResponse.json();

      if (!chatResponse.ok) {
        throw new Error(data.error || "Chat failed");
      }

      // AIメッセージを追加
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply, translation: data.translation },
      ]);

      // AIの返答を音声で読み上げ (Web Speech API)
      speakText(data.reply);
    } catch (err) {
      console.error("Processing error:", err);
      const errorMessage = err instanceof Error ? err.message : "エラーが発生しました";
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("このブラウザは音声認識に対応していません。");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      processUserInput(transcript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      alert("音声認識でエラーが発生しました。");
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <div className="app">
      <header className="header">
        <h1>Speakly</h1>
        <p>AI English Conversation Partner</p>
      </header>

      <main className="main">
        {error && (
          <div className="error-message">
            <span>{error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        <div className="conversation">
          {messages.length === 0 ? (
            <div className="empty-state">
              <p>ボタンを押して英語で話しかけてみましょう！</p>
            </div>
          ) : (
            <div className="messages">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.role}`}
                  style={{
                    opacity: showTranscript || msg.role === "user" ? 1 : 0.3,
                  }}
                >
                  <span className="label">
                    {msg.role === "user" ? "You" : "AI"}
                  </span>
                  <p
                    style={{
                      filter:
                        !showTranscript && msg.role === "assistant"
                          ? "blur(5px)"
                          : "none",
                    }}
                  >
                    {msg.content}
                  </p>
                  {msg.translation && showTranscript && (
                    <p className="translation">{msg.translation}</p>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="controls">
          <button
            className={`record-button ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <span className="processing">処理中...</span>
            ) : isRecording ? (
              <span className="stop">停止</span>
            ) : (
              <span className="start">話す</span>
            )}
          </button>

          {messages.some((m) => m.role === "assistant") && (
            <button
              className="transcript-button"
              onClick={() => setShowTranscript(!showTranscript)}
            >
              {showTranscript ? "英文を隠す" : "英文を表示"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
