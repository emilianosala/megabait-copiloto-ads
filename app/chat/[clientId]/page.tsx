'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL } from '@/lib/models';
import styles from './chat.module.css';

interface Client {
  id: string;
  name: string;
  industry: string;
}

interface AttachedImage {
  mediaType: string;
  data: string; // base64 sin el prefijo "data:...;base64,"
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: AttachedImage;
}

// Máximo del lado largo al que reescalamos la captura antes de enviarla.
// Mantiene el tamaño (y el costo en tokens) razonable y el texto legible.
const MAX_IMAGE_EDGE = 1568;

export default function ChatPage() {
  const { clientId } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<
    (AttachedImage & { preview: string }) | null
  >(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}`)
      .then((res) => res.json())
      .then((data) => setClient(data));

    fetch(`/api/conversations/${clientId}`)
      .then((res) => res.json())
      .then((data) => setMessages(Array.isArray(data) ? data : []));
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

  // Reescala la imagen a un lado largo máximo y la reencoda como JPEG.
  // Achica el tamaño del envío (importante por el límite de request de Vercel)
  // manteniendo el texto de un dashboard legible. Devuelve base64 + preview.
  const processImageFile = (
    file: File | Blob,
  ): Promise<AttachedImage & { preview: string }> =>
    new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('El archivo no es una imagen.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
        img.onload = () => {
          const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(img.width, img.height));
          const width = Math.round(img.width * scale);
          const height = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('No se pudo procesar la imagen.'));
            return;
          }
          // Fondo blanco: JPEG no soporta transparencia.
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          const preview = canvas.toDataURL('image/jpeg', 0.9);
          resolve({ mediaType: 'image/jpeg', data: preview.split(',')[1], preview });
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });

  const attachImage = async (file: File | Blob) => {
    try {
      setPendingImage(await processImageFile(file));
    } catch (err: any) {
      console.error('[chat] imagen:', err);
      alert(err.message || 'No se pudo adjuntar la imagen.');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith('image/'),
    );
    if (!item) return; // Sin imagen: dejar el pegado de texto normal.
    e.preventDefault();
    const file = item.getAsFile();
    if (file) attachImage(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // Permite volver a elegir el mismo archivo.
    if (file) attachImage(file);
  };

  const sendMessage = async () => {
    if ((!input.trim() && !pendingImage) || loading) return;

    const trimmedInput = input.trim();
    const attached: AttachedImage | undefined = pendingImage
      ? { mediaType: pendingImage.mediaType, data: pendingImage.data }
      : undefined;
    const userMessage: Message = {
      role: 'user',
      content: trimmedInput,
      ...(attached && { image: attached }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPendingImage(null);
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
          model,
          image: attached ?? null,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error del servidor (${res.status})`);
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
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `⚠️ ${err.message}` },
        ]);
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
        <select
          className={styles.modelSelect}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          title={
            CHAT_MODELS.find((m) => m.id === model)?.hint ??
            'Elegí el modelo de IA según la tarea'
          }
          aria-label="Modelo de IA"
        >
          {CHAT_MODELS.map((m) => (
            <option key={m.id} value={m.id} title={m.hint}>
              {m.label}
            </option>
          ))}
        </select>
        {messages.length > 0 && (
          <button
            className={styles.newChatButton}
            onClick={() => setMessages([])}
            title="Empezar conversación nueva (el historial anterior se conserva)"
          >
            + Nueva
          </button>
        )}
        <button
          className={styles.newChatButton}
          onClick={() => router.push('/help')}
          title="Ver guía de Jair"
        >
          ?
        </button>
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
                {msg.image && (
                  <img
                    className={styles.messageImage}
                    src={`data:${msg.image.mediaType};base64,${msg.image.data}`}
                    alt="Captura adjunta"
                  />
                )}
                {msg.content && (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ node, ...props }) => (
                        <a {...props} target="_blank" rel="noopener noreferrer" />
                      ),
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
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
        {pendingImage && (
          <div className={styles.imagePreview}>
            <img src={pendingImage.preview} alt="Vista previa de la captura" />
            <button
              type="button"
              className={styles.imagePreviewRemove}
              onClick={() => setPendingImage(null)}
              title="Quitar captura"
            >
              ✕
            </button>
          </div>
        )}
        <div className={styles.inputWrapper}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className={styles.attachButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Adjuntar una captura de pantalla"
          >
            📎
          </button>
          <textarea
            ref={textareaRef}
            className={styles.input}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`Preguntale algo sobre ${client.name}... (podés pegar una captura con Ctrl+V)`}
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
              disabled={!input.trim() && !pendingImage}
            >
              Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
