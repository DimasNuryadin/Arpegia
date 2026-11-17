---
name: ui-craft-and-delight
description: Tactile UI craftsmanship guide for micro-interactions, spring animations, active-state compression, living status rings, and True Dark Mode surfaces. Use when polishing interactive components, buttons, tabs, sliders, audio meters, or status indicators.
---

# UI Craft & Delight: Tactile Feedback & Micro-Interactions

A guide for infusing tactile physical feedback, micro-delight, and organic polish into modern web and mobile applications. Built for high-frequency interactive tools (DAWs, audio players, dashboards, and creative apps).

---

## 1. The Physicality Principle: Tactile Micro-Compression

Elements on screen should respond to human touch and clicks like physical, high-tolerance mechanical hardware.

### Micro-Compression on Press
Always add an immediate micro-compression feedback on clickable triggers:
```tsx
// Buttons / Clickable Cards
className="transition-transform duration-100 ease-out active:scale-[0.97]"

// Small Icons / Badges
className="transition-transform duration-75 ease-out active:scale-90"
```

### Spring-Loaded Release
When released, the element rebounds without oscillation lag:
```css
/* Cubic bezier for snappy physical rebound */
transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
```

---

## 2. Living Status Rings & Indicators

Static dots feel dead. Real-time states (processing audio, recording microphone, active Bluetooth MIDI, playing transport) should breathe with organic life.

### 1. Active Processing Pulse
```tsx
<span className="relative flex h-2 w-2">
  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
</span>
```

### 2. Living Audio Transport Ring
```tsx
<div className="relative inline-flex items-center justify-center">
  {isPlaying && (
    <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-md animate-pulse" />
  )}
  <button className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 transition-transform active:scale-95">
    {/* Play / Pause Icon */}
  </button>
</div>
```

---

## 3. Keyboard Navigation & Focus Rings

Never hide focus outlines without replacing them with high-contrast, accessible rings.

```tsx
// Raycast / Linear Style Focus Ring
className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
```

---

## 4. Sliders and Scrubbers (Fretboard & Audio Timeline)

Audio and timeline controls require special tactile consideration:
1. **Scrubbing Feedback**: Cursor transforms (`cursor-grab` -> `cursor-grabbing`).
2. **Hover Expansion**: Timeline thumb expands smoothly on hover from `w-1` to `w-3` with a soft glow.
3. **Number Ticker**: Dynamic value tooltip appears directly above the scrubber while dragging.

```tsx
// Interactive Playhead Thumb
<div className="group relative cursor-pointer py-2">
  <div className="h-1.5 w-full rounded-full bg-zinc-800">
    <div 
      className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
      style={{ width: `${progress}%` }}
    >
      <div className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-zinc-950 bg-emerald-400 shadow-md transition-transform group-hover:scale-125" />
    </div>
  </div>
</div>
```

---

## 5. Touch / Mobile Delight

- **Haptic Cues**: Where supported (`navigator.vibrate?.([10])`), trigger a 10ms micro-vibration on primary toggle switches or chord selections.
- **Rubber-banding**: Respect iOS inertia and bounce without breaking layout boundaries (`overscroll-behavior-y: contain`).
- **Touch Slop Safety**: Minimum tap target size of 44x44px even if visible icon is 16px (`p-2.5` touch padding around small icons).
