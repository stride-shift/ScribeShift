import React, { useRef, useState } from 'react';

const ACCEPTED = '.txt,.doc,.docx,.pdf,.md,.jpg,.jpeg,.png,.webp,.mp4,.mov,.avi,.webm,.mkv,.mp3,.wav,.m4a,.ogg';

export default function MultiFileUpload({ files, onFilesChange, videoUrls, onVideoUrlsChange, textPrompt, onTextPromptChange }) {
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-recording-${Date.now()}.webm`, { type: 'audio/webm' });
        onFilesChange([...files, file]);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      // Microphone permission denied or not available
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const addFiles = (newFiles) => {
    const existing = new Set(files.map(f => f.name + f.size));
    const unique = [...newFiles].filter(f => !existing.has(f.name + f.size));
    onFilesChange([...files, ...unique]);
  };

  const removeFile = (index) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const addUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!videoUrls.includes(url)) {
      onVideoUrlsChange([...videoUrls, url]);
    }
    setUrlInput('');
  };

  const removeUrl = (index) => {
    onVideoUrlsChange(videoUrls.filter((_, i) => i !== index));
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="card">
      <div className="card-title"><span className="step">2</span> Upload Content</div>

      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''} ${files.length ? 'has-file' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          multiple
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
        <div className="icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="label">
          {files.length > 0 ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Drop files here or click to browse'}
        </div>
        <div className="hint">Supports documents, images, video & audio files — up to 20 files</div>
      </div>

      {files.length > 0 && (
        <div className="file-list">
          {files.map((f, i) => (
            <div key={i} className="file-item">
              <div className="file-icon">
                {f.type?.startsWith('video/') ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                ) : f.type?.startsWith('audio/') ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                ) : f.type?.startsWith('image/') ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                )}
              </div>
              <div className="file-info">
                <span className="file-name">{f.name}</span>
                <span className="file-size">{formatSize(f.size)}</span>
              </div>
              <button className="file-remove" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>&times;</button>
            </div>
          ))}
        </div>
      )}

      {/* Text prompt — standalone input */}
      <div className="text-prompt-section">
        <label className="option-label">Or describe what you want to write about</label>
        <textarea
          className="text-prompt-textarea"
          placeholder="e.g. Write about the future of AI in marketing, focusing on personalization at scale and how small businesses can compete with enterprise brands..."
          value={textPrompt || ''}
          onChange={(e) => onTextPromptChange(e.target.value)}
          rows={3}
        />
      </div>

      {/* Voice recording */}
      <div className="voice-record-section">
        <label className="option-label">Record voice input</label>
        <button
          className={`voice-record-btn ${isRecording ? 'recording' : ''}`}
          onClick={isRecording ? stopRecording : startRecording}
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          {isRecording ? 'Stop Recording...' : 'Start Recording'}
        </button>
        {isRecording && <span className="recording-indicator">Recording in progress...</span>}
      </div>

      <div className="video-url-section">
        <label className="option-label">Video / YouTube / Reference URLs</label>
        <div className="url-input-row">
          <input
            type="url"
            placeholder="https://youtube.com/watch?v=... or any URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addUrl()}
            className="brand-input"
          />
          <button className="btn" onClick={addUrl} type="button">Add</button>
        </div>
        {videoUrls.length > 0 && (
          <div className="url-list">
            {videoUrls.map((url, i) => (
              <div key={i} className="url-badge">
                <span className="url-text">{url.length > 50 ? url.slice(0, 50) + '...' : url}</span>
                <button className="url-remove" onClick={() => removeUrl(i)}>&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="input-hint">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        Use any combination of inputs — upload files, add URLs, type a topic, or record your voice. Each works on its own.
      </div>
    </div>
  );
}
