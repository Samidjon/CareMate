"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { describeActivation, describeChange, describeFocus, describePage, type Announcement, type AnnouncerWords } from "./announcer";

// The same words again this soon are an echo (a tap also focuses, a change follows a click).
const REPEAT_WINDOW_MS = 1200;
// Announcements this close together become one phrase. Otherwise a choice and the
// result it causes ("Type: Pharmacy", then "Found: 29") would cancel each other out.
const GATHER_MS = 250;

function sentence(text: string) {
  return /[.!?…:]$/.test(text) ? text : `${text}.`;
}

/**
 * While voice assistance is on, speaks short announcements as the person moves
 * around: the page they open, what they press, what they choose, and the
 * confirmations and errors the page shows. Speech never blocks anything: each new
 * phrase replaces the previous one.
 */
export function useVoiceAssist({
  enabled,
  words,
  pageWords,
  announce,
}: {
  enabled: boolean;
  words: AnnouncerWords;
  pageWords: (title: string) => string;
  announce: (announcement: Announcement) => void;
}) {
  const pathname = usePathname();
  const announceRef = useRef(announce);
  const wordsRef = useRef({ words, pageWords });
  const state = useRef({
    last: { text: "", at: 0 },
    parts: [] as Announcement[],
    timer: null as number | null,
  });

  useEffect(() => {
    announceRef.current = announce;
    wordsRef.current = { words, pageWords };
  });

  useEffect(() => {
    if (!enabled) return;
    const current = state.current;

    const flush = () => {
      current.timer = null;
      const parts = current.parts.splice(0);
      if (parts.length === 0) return;
      announceRef.current({
        text: parts.map((part) => sentence(part.text)).join(" "),
        sensitive: parts.some((part) => part.sensitive),
      });
    };

    const say = (announcement: Announcement | null, { first = false } = {}) => {
      if (!announcement?.text) return;
      const now = Date.now();
      if (announcement.text === current.last.text && now - current.last.at < REPEAT_WINDOW_MS) return;
      current.last = { text: announcement.text, at: now };
      if (first) current.parts.unshift(announcement);
      else current.parts.push(announcement);
      if (current.timer === null) current.timer = window.setTimeout(flush, GATHER_MS);
    };

    // Runs in the capture phase, before React handles the click.
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest("input, select, textarea, label")) return;
      if (target.closest('[role="switch"]')) {
        // A switch reports its new state, so wait for React to apply the click.
        window.setTimeout(() => say(describeActivation(target, wordsRef.current.words)), 0);
      } else {
        // Anything else is named as the person saw it, before its label can change
        // ("Show map" must not be read as "Hide map").
        say(describeActivation(target, wordsRef.current.words));
      }
    };
    const onChange = (event: Event) => {
      const target = event.target as Element | null;
      if (target) say(describeChange(target, wordsRef.current.words));
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element | null;
      // Only keyboard focus: a tap already says what was tapped.
      if (!target || !target.matches(":focus-visible")) return;
      say(describeFocus(target) ?? (target.matches("a, button") ? describeActivation(target, wordsRef.current.words) : null));
    };

    // Confirmations and errors appear in live regions: speak them when their text changes.
    const spoken = new WeakMap<Element, string>();
    const textOf = (region: Element) => (region.textContent ?? "").replace(/\s+/g, " ").trim();
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const node = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        const region = node?.closest('[role="status"], [role="alert"], [aria-live]');
        if (!region || region.closest("[data-voice-ignore]")) continue;
        const text = textOf(region);
        if (!text || spoken.get(region) === text) continue;
        spoken.set(region, text);
        say({ text: text.slice(0, 200), sensitive: Boolean(region.closest("[data-voice-sensitive]")) });
      }
    });
    // Regions already on screen when assistance starts are not news.
    document.querySelectorAll('[role="status"], [role="alert"], [aria-live]').forEach((region) => spoken.set(region, textOf(region)));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });

    // A new page: wait for its heading (a loading screen may come first), then say its
    // name before anything else.
    let pageTimer = 0;
    let attempts = 0;
    const announcePage = () => {
      const page = describePage(document, wordsRef.current.pageWords);
      if (page) say(page, { first: true });
      else if (++attempts < 10) pageTimer = window.setTimeout(announcePage, 200);
    };
    pageTimer = window.setTimeout(announcePage, 300);

    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange);
    document.addEventListener("focusin", onFocus);
    return () => {
      window.clearTimeout(pageTimer);
      if (current.timer !== null) window.clearTimeout(current.timer);
      current.timer = null;
      current.parts.length = 0;
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange);
      document.removeEventListener("focusin", onFocus);
    };
  }, [enabled, pathname]);
}
