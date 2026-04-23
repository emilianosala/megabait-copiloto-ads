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

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, message: input, history: messages }),
    });

    const data = await res.json();
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: data.response },
    ]);
    setLoading(false);
  };

  if (!client) return <div className={styles.container} />;

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
        {loading && <p className={styles.typing}>Escribiendo...</p>}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <input
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={`Preguntale algo sobre ${client.name}...`}
            disabled={loading}
          />
          <button
            className={styles.sendButton}
            onClick={sendMessage}
            disabled={loading}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
