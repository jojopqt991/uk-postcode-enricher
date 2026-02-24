import "@/index.css";

import { useState, useRef, useCallback } from "react";
import { mountWidget } from "skybridge/web";
import { useCallTool, useToolInfo } from "../helpers.js";

function ComicGenerator() {
  const toolInfo = useToolInfo<"comic-generator">();
  const { callTool, isPending, isSuccess, data, isError, error } =
    useCallTool("comic-generator");

  const [heroName, setHeroName] = useState(
    "input" in toolInfo ? (toolInfo.input?.heroName ?? "") : "",
  );
  const [story, setStory] = useState(
    "input" in toolInfo ? (toolInfo.input?.story ?? "") : "",
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith("image/")) return;

    // Show preview using FileReader (data: URL — safe in ChatGPT's CSP)
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target!.result as string);
    reader.readAsDataURL(f);

    // Upload directly to FAL via our /upload route (bypasses 100KB MCP limit)
    setUploadState("uploading");
    setPhotoUrl(null);

    fetch(`${window.location.origin}/upload`, {
      method: "POST",
      headers: { "Content-Type": f.type || "image/jpeg" },
      body: f,
    })
      .then((r) => r.json())
      .then(({ url }) => {
        setPhotoUrl(url);
        setUploadState("done");
      })
      .catch(() => setUploadState("error"));
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const handleSubmit = () => {
    if (!heroName.trim() || !story.trim()) return;
    callTool({
      heroName: heroName.trim(),
      story: story.trim(),
      ...(photoUrl ? { photoUrl } : {}),
    });
  };

  // Result from interactive form submission
  const result = isSuccess ? data?.structuredContent : null;

  // Loading state
  if (isPending) {
    return (
      <div className="comic-container">
        <div className="comic-loading">
          <div className="comic-pencil">✏️</div>
          <div className="comic-loading-text">
            Drawing {heroName}&apos;s comic…
          </div>
          <div className="comic-loading-sub">This takes about 30–45 seconds</div>
        </div>
      </div>
    );
  }

  // Result state
  if (result) {
    return (
      <div className="comic-container">
        <div className="comic-result">
          <div className="comic-title">{result.heroName}&apos;s Comic</div>
          <img
            className="comic-image"
            src={result.imageUrl}
            alt={`${result.heroName}'s comic`}
          />
          <p className="comic-story">{result.story}</p>
          <div className="comic-result-actions">
            <a
              className="comic-download"
              href={result.imageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open full resolution
            </a>
            <button
              className="comic-retry"
              onClick={() => {
                setPreview(null);
                setPhotoUrl(null);
                setUploadState("idle");
              }}
            >
              Make another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="comic-container">
      <div className="comic-form">
        <div className="comic-form-title">Comic Generator</div>

        {/* Photo upload */}
        <div
          className={`comic-drop-zone${isDragging ? " dragging" : ""}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          {preview ? (
            <>
              <img className="comic-drop-preview" src={preview} alt="preview" />
              <span className="comic-drop-sub">
                {uploadState === "uploading" && "Uploading…"}
                {uploadState === "done" && "✓ Ready"}
                {uploadState === "error" && "Upload failed — try again"}
              </span>
            </>
          ) : (
            <>
              <span className="comic-drop-icon">📸</span>
              <span className="comic-drop-label">
                Drop a photo or click to browse
              </span>
              <span className="comic-drop-sub">
                Optional — for a personalised hero
              </span>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onFileChange}
          />
        </div>

        {/* Hero name */}
        <label className="comic-label">
          Hero name
          <input
            className="comic-input"
            type="text"
            placeholder="e.g. Alex"
            value={heroName}
            onChange={(e) => setHeroName(e.target.value)}
          />
        </label>

        {/* Story */}
        <label className="comic-label">
          Story
          <textarea
            className="comic-textarea"
            placeholder="A short adventure (2–5 sentences)…"
            rows={4}
            value={story}
            onChange={(e) => setStory(e.target.value)}
          />
        </label>

        {isError && (
          <p className="comic-error">
            {String((error as any)?.message ?? "Something went wrong.")}
          </p>
        )}

        <button
          className="comic-submit"
          disabled={!heroName.trim() || !story.trim() || uploadState === "uploading"}
          onClick={handleSubmit}
        >
          Generate comic ✨
        </button>
      </div>
    </div>
  );
}

export default ComicGenerator;

mountWidget(<ComicGenerator />);
