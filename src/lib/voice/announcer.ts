// Works out what to say when someone interacts with the page. Pure DOM logic,
// kept apart from React so it can be tested and reused.
//
// Markup conventions:
//   data-voice="..."          what to say for this element, instead of its text
//   data-voice-sensitive      medical or personal: replaced unless the user opted in
//   data-voice-ignore         say nothing for this element or anything inside it
//   data-voice-page="..."     on a page's wrapper: what to say when the page opens

const MAX_LENGTH = 160;

export type Announcement = { text: string; sensitive: boolean };

export type AnnouncerWords = {
  on: string;
  off: string;
  selected: (label: string, value: string) => string;
};

function clean(text: string | null | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LENGTH);
}

function ignored(element: Element) {
  return Boolean(element.closest("[data-voice-ignore]"));
}

function sensitive(element: Element) {
  return Boolean(element.closest("[data-voice-sensitive]"));
}

/** The visible label of a form control, as a sighted person would read it. */
export function labelOf(control: Element): string {
  const labelledBy = control.getAttribute("aria-labelledby");
  if (labelledBy) {
    return clean(labelledBy.split(" ").map((id) => control.ownerDocument.getElementById(id)?.textContent).join(" "));
  }
  const aria = control.getAttribute("aria-label");
  if (aria) return clean(aria);
  const id = control.getAttribute("id");
  const explicit = id ? control.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const wrapping = control.closest("label");
  const label = explicit ?? wrapping;
  if (!label) return "";
  // A wrapping label also contains the control itself; read only its words.
  const copy = label.cloneNode(true) as Element;
  copy.querySelectorAll("input, select, textarea").forEach((node) => node.remove());
  return clean(copy.textContent);
}

/** What to say when an element is pressed. Links that change page are announced by the page itself. */
export function describeActivation(target: Element, words: AnnouncerWords): Announcement | null {
  const element = target.closest("[data-voice], button, a, [role=switch], [role=button], summary");
  if (!element || ignored(element)) return null;
  const isSensitive = sensitive(element);
  const custom = element.getAttribute("data-voice");
  if (custom) return { text: clean(custom), sensitive: isSensitive };

  if (element.tagName === "A") {
    const href = element.getAttribute("href") ?? "";
    // In-app navigation: the new page announces itself, so the link stays quiet.
    if (href.startsWith("/") && !href.startsWith("//")) return null;
  }
  if (element.getAttribute("role") === "switch") {
    // Called after the click, so aria-checked already holds the new state.
    const on = element.getAttribute("aria-checked") === "true";
    return { text: words.selected(labelOf(element) || clean(element.textContent), on ? words.on : words.off), sensitive: isSensitive };
  }
  const text = clean(element.getAttribute("aria-label") || element.textContent);
  return text ? { text, sensitive: isSensitive } : null;
}

/** What to say when a form value changes: a chosen option, a ticked box. */
export function describeChange(target: Element, words: AnnouncerWords): Announcement | null {
  if (ignored(target)) return null;
  const isSensitive = sensitive(target);
  if (target instanceof HTMLSelectElement) {
    const option = target.selectedOptions[0];
    return { text: words.selected(labelOf(target), clean(option?.textContent)), sensitive: isSensitive };
  }
  if (target instanceof HTMLInputElement && (target.type === "checkbox" || target.type === "radio")) {
    if (target.type === "radio" && !target.checked) return null;
    const label = labelOf(target);
    const text = target.type === "radio" ? label : words.selected(label, target.checked ? words.on : words.off);
    return text ? { text, sensitive: isSensitive } : null;
  }
  return null;
}

/** What to say when keyboard focus reaches a field: its label, so the person knows what to type. */
export function describeFocus(target: Element): Announcement | null {
  if (ignored(target)) return null;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return null;
  if (target instanceof HTMLInputElement && ["hidden", "checkbox", "radio", "submit", "button"].includes(target.type)) return null;
  const label = labelOf(target);
  return label ? { text: label, sensitive: sensitive(target) } : null;
}

/** The page's own description, or its main heading. */
export function describePage(root: ParentNode, pageWords: (title: string) => string): Announcement | null {
  const custom = root.querySelector("[data-voice-page]");
  if (custom) return { text: clean(custom.getAttribute("data-voice-page")), sensitive: false };
  const heading = clean(root.querySelector("main h1")?.textContent);
  return heading ? { text: pageWords(heading), sensitive: false } : null;
}
