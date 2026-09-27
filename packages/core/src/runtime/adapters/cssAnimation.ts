// Computed style escapes a comma inside a name (`"n,m"` reads `n\,m`): split only on the others.
const splitNames = (list: string) =>
  (list.match(/(?:\\.|[^,])+/g) ?? []).map((name) => name.trim());

/**
 * The CSS animations the page authored: the names in each element's computed style at discover, which
 * outlives display:none and escapes each name. One a class adds or swaps in later is not authored.
 */
export function createAuthoredCssAnimations() {
  let names = new WeakMap<Element, Set<string>>();
  let anyNames = false;
  return {
    /** Starts a discover: forgets what the last one recorded. */
    reset: () => {
      names = new WeakMap();
      anyNames = false;
    },
    record: (element: Element, style: CSSStyleDeclaration) => {
      names.set(element, new Set(splitNames(style.animationName)));
      anyNames = true;
    },
    has: (animation: CSSAnimation): boolean => {
      const target = (animation.effect as KeyframeEffect | null)?.target;
      const escaped = globalThis.CSS?.escape?.(animation.animationName) ?? animation.animationName;
      return !!target && names.get(target)?.has(escaped) === true;
    },
    hasAny: () => anyNames,
  };
}

export type AuthoredCssAnimations = ReturnType<typeof createAuthoredCssAnimations>;
