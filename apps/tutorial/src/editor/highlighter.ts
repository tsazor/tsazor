/**
 * One highlighter for the editor and the lesson text's code blocks: lezer
 * tags → `tok-*` classes (styled in app.css). Stream-mode token names
 * (`keyword`, `variableName.function`) map to the same tags.
 */
import { tagHighlighter, tags, type Tag } from "@lezer/highlight";

export const tutorialHighlighter = tagHighlighter([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.definitionKeyword, tags.operatorKeyword, tags.modifier, tags.self], class: "tok-keyword" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.docString], class: "tok-string" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], class: "tok-comment" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit], class: "tok-number" },
  { tag: tags.tagName, class: "tok-tagName" },
  { tag: [tags.typeName, tags.className, tags.namespace], class: "tok-typeName" },
  { tag: tags.attributeName, class: "tok-attributeName" },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], class: "tok-propertyName" },
  { tag: [tags.meta, tags.processingInstruction, tags.annotation], class: "tok-meta" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], class: "tok-function" },
  { tag: [tags.definition(tags.variableName)], class: "tok-definition" },
  { tag: tags.variableName, class: "tok-variableName" },
  { tag: [tags.operator, tags.compareOperator, tags.arithmeticOperator, tags.logicOperator], class: "tok-operator" },
  { tag: [tags.punctuation, tags.bracket, tags.brace, tags.paren, tags.squareBracket, tags.separator], class: "tok-punctuation" },
  { tag: tags.invalid, class: "tok-invalid" },
]);

/** The lezer tag a stream-mode token name stands for (`variableName.function` → function(variableName)). */
export function tagForToken(name: string): Tag | undefined {
  const [base, ...modifiers] = name.split(".");
  let tag = (tags as unknown as Record<string, Tag | undefined>)[base!];
  if (!tag) return undefined;
  for (const modifier of modifiers) {
    const apply = (tags as unknown as Record<string, unknown>)[modifier];
    if (typeof apply === "function") tag = (apply as (t: Tag) => Tag)(tag);
  }
  return tag;
}

/** The CSS class(es) of a stream-mode token name, or null. */
export function classForToken(name: string): string | null {
  const tag = tagForToken(name);
  return tag ? tutorialHighlighter.style([tag]) : null;
}
