---
name: ponytail
description: "The Lazy Senior Dev" engineering discipline. Prevents over-engineering, eliminates premature abstractions, and enforces YAGNI. Prioritizes the platform standard library (native JS/Web APIs, Python standard library) over unnecessary third-party npm/pip packages. Use when designing architectures, reviewing pull requests, evaluating dependencies, or writing clean, minimal code.
---

# Ponytail: The Pragmatic Senior Dev Guide

A coding discipline and architectural filter inspired by the quintessential veteran senior engineer who keeps systems simple, robust, and fast by refusing to over-engineer.

> *"The best code is the code you didn't have to write, don't have to test, and don't have to maintain."*

---

## 1. Core Tenets

1. **YAGNI (You Aren't Gonna Need It)**: Never build for a hypothetical future. Solve today's exact problem with the cleanest possible solution.
2. **Platform Primitives First**: Before installing an npm package or pip dependency, check if Web APIs, Node/Python standard libraries, or modern CSS already solve it natively.
3. **Flat Over Deep**: Prefer a 20-line straightforward function over a 4-file factory-pattern abstract-base-class hierarchy.
4. **Delete Code Boldly**: If an abstraction adds more cognitive friction than the duplicate lines it replaced, inline it and delete the abstraction.

---

## 2. Dependency Audit & Native Replacements

| Tempting Dependency | Native Standard Replacement | Why? |
| :--- | :--- | :--- |
| `lodash.debounce` / `throttle` | A 6-line native closure with `setTimeout` or `requestAnimationFrame`. | Zero bundle size, zero version vulnerabilities. |
| `clsx` / `classnames` | Simple string interpolation or clean template literals (or `twMerge` only when conflict resolution is truly required). | Simpler mental model. |
| `uuid` | `crypto.randomUUID()` (supported in all modern browsers & Node 16+). | Native C++ performance, 0 kB download. |
| `dayjs` / `moment` | `Intl.DateTimeFormat` or native `Date.toLocaleDateString()`. | Built into JavaScript runtime. |
| Deep nested Redux / state machines | React `useState` / `useReducer` / URL search parameters for state. | Keeps state visible and debuggable. |

---

## 3. Practical Code Guidelines

### Rule 1: Three Strikes Before Refactoring
Do not abstract on the first or second occurrence. Duplicate code is far cheaper than the wrong abstraction. Only extract a shared utility when the pattern repeats three times and has proven identical in intent.

### Rule 2: Keep Components Flat
```tsx
// ❌ Over-engineered: 4 layers of wrapper components for a simple button
<ButtonContainer>
  <ButtonRippleWrapper>
    <ButtonInnerTypography variant="caption">
      Click Me
    </ButtonInnerTypography>
  </ButtonRippleWrapper>
</ButtonContainer>

// ✅ Ponytail way: One clean, semantic button
<button className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 transition active:scale-[0.98]">
  Click Me
</button>
```

### Rule 3: Error Handling Without Verbose Boilerplate
Catch errors where you can actually take meaningful action (recover, retry, or alert user). Do not wrap every single line in empty `try { ... } catch (e) { console.error(e); }`.

### Rule 4: Clean Async Flow
Use standard `async`/`await` with native `Promise.all` or `AbortController` for cancellation instead of heavy reactive stream libraries unless building a complex event bus.
