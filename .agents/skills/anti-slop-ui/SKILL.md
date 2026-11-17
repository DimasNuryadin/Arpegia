---
name: anti-slop-ui
description: Design standard and aesthetic filter inspired by Linear, Raycast, and Apple interfaces. Prevents generic AI UI slop, tacky neon gradients, excessive rounded corners, and low-density layouts. Use when designing, reviewing, or styling UI components, pages, cards, and typography.
---

# Anti-Slop UI: Design Standards & Aesthetic Filter

An aesthetic filter and design guide that prevents generic "AI slop" interfaces (gratuitous neon gradients, floating glow bubbles, bloated card padding, and low information density). Enforces crisp, disciplined craftsmanship inspired by tools like **Linear**, **Raycast**, **Vercel**, and **Apple**.

---

## 1. Core Principles

1. **Substance Over Decoration**: Every element on screen must serve an informational or functional purpose. If removing a gradient, glow, or icon does not reduce clarity or utility, remove it.
2. **High Information Density**: Avoid vast empty white/black voids with huge rounded cards. Use compact, well-structured layouts where users can scan data effortlessly.
3. **Disciplined Lighting & Borders**: Never use harsh 100% white borders or blinding radial glow backgrounds. Use translucent hairline borders (`border-white/[0.08]` or `border-zinc-800`) and subtle, directional ambient lighting.
4. **Monochrome First, Color for State**: The UI foundation should be monochromatic (slate, zinc, or neutral dark tones). Accent colors (Emerald, Amber, Rose, Sky) are reserved exclusively for status, active states, and actionable primary triggers.

---

## 2. The "Anti-Slop" Checklist

| Anti-Pattern ("AI Slop") | Clean Standard ("Linear / Raycast") |
| :--- | :--- |
| **Neon Purple/Cyan Gradients** as background fills on every card. | Neutral matte backgrounds (`bg-zinc-900/50`, `bg-slate-950`) with single hairline border (`border-white/[0.06]`). |
| **Giant 32px rounded corners** (`rounded-3xl`) on small data cards. | Purposeful radii: `rounded-lg` (8px) for buttons/inputs, `rounded-xl` (12px) for cards, `rounded-2xl` (16px) only for dialogs/modals. |
| **Massive 48px padding** with tiny centered text. | Tight, efficient padding: `p-3.5` to `p-5` with structured visual hierarchy (header, body, meta). |
| **Decorative sparkles/stars icons** on random headers. | Clear, technical typography: semibold tracking-tight headers, muted monospace labels (`text-xs font-mono text-zinc-400`). |
| **Full-screen blur overlays** that lag performance. | Crisp translucent panels: `backdrop-blur-md bg-zinc-950/70 border border-white/[0.08]`. |

---

## 3. Dark Mode Palette & Surfaces

Never use pure `#000000` for every surface or `#111111` without contrast. Build intentional depth:

```css
/* Surface Hierarchy */
--bg-canvas: #090B0E;      /* Deepest base layer */
--bg-surface: #11141A;     /* Primary card / panel */
--bg-surface-elevated: #181C24; /* Hovered / floating element */
--border-subtle: rgba(255, 255, 255, 0.07);
--border-highlight: rgba(255, 255, 255, 0.14);
```

### Tailwind Implementation Example:
```tsx
// Clean Card Surface
<div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4 shadow-sm backdrop-blur-sm transition-colors hover:border-white/[0.16] hover:bg-zinc-900/80">
  <div className="flex items-center justify-between">
    <span className="text-xs font-mono font-medium uppercase tracking-wider text-zinc-400">Tempo</span>
    <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2 py-0.5 text-xs font-mono text-zinc-200">
      120 BPM
    </span>
  </div>
</div>
```

---

## 4. Typography & Monospace Rules

1. **Heading Tracking**: Always apply `tracking-tight` (`-0.02em` to `-0.03em`) on headings (`text-xl`, `text-2xl`) to avoid loose, sloppy lettering.
2. **Metadata & Figures**: Numbers, timestamps, pitches, chords, and keyboard shortcuts should always render in monospace (`font-mono font-medium`).
3. **Contrast Hierarchy**:
   - Primary: `text-zinc-100` (high emphasis)
   - Secondary: `text-zinc-400` (labels, descriptions)
   - Muted: `text-zinc-500` (shortcuts, disabled, timestamps)

---

## 5. Buttons and Interactive States

Avoid oversized gradients on buttons. Primary buttons should feel solid and engineered:

```tsx
// Linear-style Primary Button
<button className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-3.5 py-1.5 text-xs font-medium text-zinc-950 shadow-sm transition-all hover:bg-white active:scale-[0.98] disabled:opacity-50">
  Export MIDI
</button>

// Subtle Secondary Button
<button className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-3.5 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-white/[0.18] hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.98]">
  Settings
</button>
```
