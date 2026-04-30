'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import styles from './chat.module.css';

interface Client {
  id: string;
  name: string;
  industry: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPage() {
  const { clientId } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((res) => res.json())
      .then((data) => setClient(data));

    fetch(`/api/conversations/${clientId}`)
      .then((res) => res.json())
      .then((data) => setMessages(data));
  }, [clientId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize del textarea según el contenido
  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeTextarea();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    // Shift+Enter: comportamiento default del textarea (nueva línea)
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const trimmedInput = input.trim();
    const userMessage: Message = { role: 'user', content: trimmedInput };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          message: trimmedInput,
          history: messages,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error('Error en la respuesta del servidor');
      }

      // Agregar mensaje vacío del asistente — se irá llenando con los chunks
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // El usuario detuvo el stream — el mensaje parcial queda visible
      } else {
        console.error('[chat] Error:', err);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
  };

  if (!client) return <div className={styles.container} />;

  const lastMessageIsUser =
    messages.length === 0 || messages[messages.length - 1].role === 'user';

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => router.push('/dashboard')}
        >
          ←
        </button>
        <div className={styles.clientInfo}>
          <p className={styles.clientName}>{client.name}</p>
          <p className={styles.clientIndustry}>{client.industry}</p>
        </div>
        <div className={styles.dot} />
      </header>

      <div className={styles.messages}>
        {messages.length === 0 && !loading ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>⚡</div>
            <p className={styles.emptyTitle}>Agente listo</p>
            <p className={styles.emptySubtitle}>
              Preguntale algo sobre {client.name}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : ''}`}
            >
              <span className={styles.messageLabel}>
                {msg.role === 'user' ? 'Vos' : 'Agente'}
              </span>
              <div className={styles.messageContent}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          ))
        )}

        {/* Indicador de escritura: solo mientras espera el primer chunk */}
        {loading && lastMessageIsUser && (
          <p className={styles.typing}>Escribiendo...</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={`Preguntale algo sobre ${client.name}... (Shift+Enter para nueva línea)`}
            disabled={loading}
            rows={1}
          />
          {loading ? (
            <button className={styles.stopButton} onClick={handleStop}>
              Detener
            </button>
          ) : (
            <button
              className={styles.sendButton}
              onClick={sendMessage}
              disabled={!input.trim()}
            >
              Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
