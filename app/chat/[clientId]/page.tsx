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
  images?: AttachedImage[];
}

// Máximo del lado largo al que reescalamos la captura antes de enviarla.
// Mantiene el tamaño (y el costo en tokens) razonable y el texto legible.
const MAX_IMAGE_EDGE = 1568;

// Tope de capturas por mensaje. Limita el tamaño del request (Vercel corta
// alrededor de 4.5 MB) y el costo en tokens de visión. Ajustable.
const MAX_IMAGES = 5;

// Palabras que rotan en el indicador "pensando" mientras Jair procesa.
// Onda analista rosarino, sin forzar el modismo.
const THINKING_WORDS = [
  'Pensando',
  'Cruzando números',
  'Mirando la cuenta',
  'Atando cabos',
  'Rumiando',
  'Sacando cuentas',
  'Revisando campañas',
  'Haciendo números',
];

// Indicador animado de "Jair está pensando": una palabra que rota cada par
// de segundos + tres puntitos animados. Reemplaza al viejo "Escribiendo...".
function ThinkingIndicator() {
  const [i, setI] = useState(() => Math.floor(Math.random() * THINKING_WORDS.length));
  useEffect(() => {
    const id = setInterval(
      () => setI((v) => (v + 1) % THINKING_WORDS.length),
      2200,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <p className={styles.typing}>
      <span>{THINKING_WORDS[i]}</span>
      <span className={styles.dots}>
        <span />
        <span />
        <span />
      </span>
    </p>
  );
}

export default function ChatPage() {
  const { clientId } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(DEFAULT_CHAT_MODEL);
  const [loading, setLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<
    (AttachedImage & { preview: string })[]
  >([]);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

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

  // Dictado por voz: usamos la Web Speech API nativa del navegador (sin backend).
  // Solo está disponible en Chrome/Edge de escritorio; en otros navegadores
  // escondemos el botón de micrófono.
  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
        !!((window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition),
    );
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

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

  // Adjunta una o varias imágenes a la vez, respetando el tope MAX_IMAGES.
  const attachImages = async (files: (File | Blob)[]) => {
    const room = MAX_IMAGES - pendingImages.length;
    if (room <= 0) {
      alert(`Podés adjuntar hasta ${MAX_IMAGES} capturas por mensaje.`);
      return;
    }
    const slice = files.slice(0, room);
    try {
      const processed = await Promise.all(slice.map(processImageFile));
      setPendingImages((prev) => [...prev, ...processed]);
      if (files.length > room) {
        alert(
          `Se adjuntaron ${room}. El máximo es ${MAX_IMAGES} capturas por mensaje.`,
        );
      }
    } catch (err: any) {
      console.error('[chat] imagen:', err);
      alert(err.message || 'No se pudo adjuntar la imagen.');
    }
  };

  const removeImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((it) => it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) return; // Sin imagen: dejar el pegado de texto normal.
    e.preventDefault();
    attachImages(files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // Permite volver a elegir el mismo archivo.
    if (files.length) attachImages(files);
  };

  // Arranca/detiene el dictado por voz. Va agregando lo dictado al texto actual.
  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Tu navegador no soporta dictado por voz. Probá con Chrome.');
      return;
    }
    const rec = new SR();
    rec.lang = 'es-AR';
    rec.continuous = true;
    rec.interimResults = true;

    // Partimos de lo que ya haya escrito el usuario y le vamos sumando.
    let base = input ? input + ' ' : '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) base += t;
        else interim += t;
      }
      setInput(base + interim);
      resizeTextarea();
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const sendMessage = async () => {
    if ((!input.trim() && pendingImages.length === 0) || loading) return;

    // Si estaba dictando, cortamos el micrófono al enviar.
    recognitionRef.current?.stop();

    const trimmedInput = input.trim();
    const attached: AttachedImage[] = pendingImages.map((p) => ({
      mediaType: p.mediaType,
      data: p.data,
    }));
    const userMessage: Message = {
      role: 'user',
      content: trimmedInput,
      ...(attached.length > 0 && { images: attached }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setPendingImages([]);
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
          images: attached,
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
                {msg.images?.map((im, idx) => (
                  <img
                    key={idx}
                    className={styles.messageImage}
                    src={`data:${im.mediaType};base64,${im.data}`}
                    alt="Captura adjunta"
                  />
                ))}
                {msg.content &&
                  (msg.role === 'user' ? (
                    // Los mensajes del usuario se muestran como texto plano para
                    // respetar los saltos de línea (Shift+Enter). Markdown se
                    // comería un salto simple y quedaría "todo seguido".
                    <p className={styles.userText}>{msg.content}</p>
                  ) : (
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
                  ))}
              </div>
            </div>
          ))
        )}

        {/* Indicador de escritura: solo mientras espera el primer chunk */}
        {loading && lastMessageIsUser && <ThinkingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      <div className={styles.inputArea}>
        {pendingImages.length > 0 && (
          <div className={styles.imagePreviewRow}>
            {pendingImages.map((img, idx) => (
              <div key={idx} className={styles.imagePreview}>
                <img src={img.preview} alt="Vista previa de la captura" />
                <button
                  type="button"
                  className={styles.imagePreviewRemove}
                  onClick={() => removeImage(idx)}
                  title="Quitar captura"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={styles.inputWrapper}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className={styles.attachButton}
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title={`Adjuntar capturas de pantalla (hasta ${MAX_IMAGES})`}
          >
            📎
          </button>
          {voiceSupported && (
            <button
              type="button"
              className={`${styles.attachButton} ${listening ? styles.micActive : ''}`}
              onClick={toggleListening}
              disabled={loading}
              title={listening ? 'Detener dictado' : 'Dictar por voz'}
            >
              {listening ? '⏹' : '🎤'}
            </button>
          )}
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
              disabled={!input.trim() && pendingImages.length === 0}
            >
              Enviar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
