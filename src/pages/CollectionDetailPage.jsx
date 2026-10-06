import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { serverTimestamp } from 'firebase/firestore';
import PageHeader from '../components/common/PageHeader';
import { useDocument, useCollection, useFirestoreCrud } from '../hooks/useFirestore';
import Spinner from '../components/common/Spinner';
import Button from '../components/common/Button';
import { PaintBrushIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import {
  FAL_MODELS,
  DEFAULT_MODEL_PARAMS,
  isNanoBanana,
  NANO_RESOLUTIONS,
} from '../lib/promptAssembler';

export default function CollectionDetailPage() {
  const { collectionId } = useParams();
  const { document: collection, loading: collectionLoading } = useDocument('ideationCollections', collectionId);
  const { documents: rawMessages, loading: messagesLoading } = useCollection(`ideationCollections/${collectionId}/conversations`, [], 'timestamp');
  const messages = [...rawMessages].reverse(); // Hook sorts desc, chat needs asc
  const { documents: collectionImages, loading: imagesLoading } = useCollection('images', [{ field: 'ideationCollectionId', op: '==', value: collectionId }], 'createdAt');
  const conversationsCrud = useFirestoreCrud(`ideationCollections/${collectionId}/conversations`);
  const jobsCrud = useFirestoreCrud('jobs');
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-5');
  // Image generation state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageModel, setImageModel] = useState('fal-ai/nano-banana-2');
  const [aspectRatio, setAspectRatio] = useState('2:3');
  const [resolution, setResolution] = useState('2K');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [variants, setVariants] = useState(1);
  const [dividerPosition, setDividerPosition] = useState(() => {
    const saved = localStorage.getItem('promptBuilderDividerPosition');
    return saved ? parseFloat(saved) : 50;
  });
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);

  const isThinking = !messagesLoading && messages.length > 0 && messages[messages.length - 1].role === 'user';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newDividerPosition = ((e.clientX - rect.left) / rect.width) * 100;
      if (newDividerPosition > 25 && newDividerPosition < 75) {
        setDividerPosition(newDividerPosition);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      localStorage.setItem('promptBuilderDividerPosition', dividerPosition.toString());
    };

    const isResizing = (e) => {
      if (e.target.id === 'resize-handle') {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
      }
    };

    window.addEventListener('mousedown', isResizing);
    return () => window.removeEventListener('mousedown', isResizing);
  }, [dividerPosition]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = {
      role: 'user',
      content: input.trim(),
      modelUsed: selectedModel,
      timestamp: serverTimestamp(),
    };

    setInput('');
    await conversationsCrud.add(userMessage);
    // In a future step, this is where we will trigger the AI response.
  };

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim()) return;

    await jobsCrud.add({
      promptId: null,
      ideationCollectionId: collectionId,
      promptText: imagePrompt.trim(),
      model: imageModel,
      modelParams: { ...DEFAULT_MODEL_PARAMS, aspectRatio, resolution },
      negativePrompt: negativePrompt || null,
      variants,
      status: 'queued',
      error: null,
      imageIds: [],
      cost: 0,
      startedAt: null,
      completedAt: null,
    });
    toast.success(`${variants} image${variants > 1 ? 's' : ''} sent to queue!`);
  };

  const handleCopyToPrompt = (text) => {
    setImagePrompt(text);
    toast.success('Copied to image prompt');
  };

  if (collectionLoading) {
    return <div className="flex items-center justify-center h-full"><Spinner /></div>;
  }

  if (!collection) {
    return <div className="p-6 text-center">Collection not found.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title={collection.name}
        description={`Images generated: ${collectionImages.length}`}
      />
      <div ref={containerRef} className="flex-grow flex overflow-hidden">
        {/* Left Panel: Chat */}
        <div style={{ width: `${dividerPosition}%` }} className="h-full flex flex-col overflow-hidden">
          <div className="flex-grow p-6 overflow-y-auto space-y-4 pr-2">
            {messagesLoading && <Spinner />}
            {messages.map((msg, index) => {
              const isLastMessage = index === messages.length - 1;
              return (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`relative group max-w-2xl p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white/10'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === 'assistant' && (
                      <div className="absolute -bottom-4 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={() => handleCopyToPrompt(msg.content)}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                          style={{ backgroundColor: 'var(--color-surface-hover)', color: 'var(--color-text)' }}
                          title="Copy to image prompt"
                        >
                          <ClipboardDocumentIcon className="h-3 w-3" />
                          Use as prompt
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isThinking && (
              <div className="flex justify-start">
                <div
                  className="max-w-2xl p-3 rounded-lg bg-white/10 animate-pulse"
                >
                  <p className="whitespace-pre-wrap text-gray-400">Thinking...</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 border-t border-white/10">
            <form onSubmit={handleSendMessage} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="p-2 rounded-lg text-white"
                  style={{ backgroundColor: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}
                  disabled={messagesLoading || isThinking}
                >
                  <option value="claude-sonnet-5">Claude Sonnet 5</option>
                  <option value="claude-opus-4-8">Claude Opus 4.8</option>
                  <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                </select>
                <Button type="submit" disabled={!input.trim() || messagesLoading || isThinking}>
                  Send
                </Button>
              </div>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                placeholder="Start your prompt here... (Shift+Enter for new line)"
                rows={3}
                className="w-full p-2 rounded-lg text-white resize-y"
                style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: '60px', maxHeight: '200px' }}
                disabled={messagesLoading || isThinking}
              />
            </form>
          </div>
        </div>

        {/* Divider */}
        <div id="resize-handle" className="w-2 cursor-col-resize flex items-center justify-center" style={{ backgroundColor: 'var(--color-border)' }}>
          <div className="w-px h-8 bg-gray-500"></div>
        </div>

        {/* Right Panel: Image Generation */}
        <div style={{ width: `calc(100% - ${dividerPosition}%)` }} className="h-full flex flex-col">
          {/* Generated images — scrollable top area */}
          {collectionImages.length > 0 && (
            <div className="flex-shrink-0 overflow-y-auto p-6 pb-2" style={{ maxHeight: '40%' }}>
              <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Generated Images ({collectionImages.length})
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {collectionImages.map((image) => (
                  <Link to={`/gallery?selected=${image.id}`} key={image.id}>
                    <img src={image.url} alt={image.promptText} className="w-full h-auto object-cover rounded-lg aspect-[2/3] hover:opacity-80 transition-opacity" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Image builder form — pinned to bottom */}
          <div className="mt-auto p-6 pt-4 flex flex-col gap-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-muted)' }}>Image Prompt</h3>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Paste or type your image generation prompt here..."
              rows={4}
              className="w-full p-3 rounded-lg text-sm resize-y"
              style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)', minHeight: '60px', maxHeight: '160px' }}
            />

            <div className="flex gap-2">
              <Button onClick={handleGenerateImage} disabled={!imagePrompt.trim()} className="flex-1">
                Generate {variants} {variants === 1 ? 'Image' : 'Images'}
              </Button>
              <select
                value={variants}
                onChange={(e) => setVariants(Number(e.target.value))}
                className="px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Model</label>
                <select
                  value={imageModel}
                  onChange={(e) => setImageModel(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  {FAL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Aspect Ratio</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                >
                  <option value="2:3">2:3 (A4 Portrait)</option>
                  <option value="3:4">3:4 (Portrait)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="1:1">1:1 (Square)</option>
                </select>
              </div>
              {isNanoBanana(imageModel) && (
                <div>
                  <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Resolution</label>
                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg text-xs"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                  >
                    {NANO_RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Negative Prompt</label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Things to avoid..."
                  className="w-full px-3 py-1.5 rounded-lg text-xs"
                  style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}